#!/usr/bin/env node

/**
 * PenDesk Auto-Updater Tooling
 * Generates cryptographic Ed25519/Minisign keys, signs update packages,
 * generates Tauri latest.json manifest, and deploys updates to VPS.
 *
 * (C) 2026 Penrose Systems - All rights reserved.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const KEYS_DIR = path.join(ROOT_DIR, '.updater-keys');

// Default VPS deployment config
const VPS_CONFIG = {
  host: 'root@164.92.214.242',
  remotePath: '/var/www/hjelp-portal/public/updates',
  baseUrl: 'https://hjelp.penrose.no/updates'
};

/**
 * Generate Ed25519 Minisign-compatible keypair
 */
export function generateKeypair() {
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }

  const privPath = path.join(KEYS_DIR, 'penrose-updater.key');
  const pubPath = path.join(KEYS_DIR, 'penrose-updater.pub');

  if (fs.existsSync(privPath) && fs.existsSync(pubPath)) {
    const pub = fs.readFileSync(pubPath, 'utf8').trim();
    console.log('[Updater] Keypair already exists:');
    console.log('Public key:', pub);
    return { pub, pubPath, privPath };
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');

  // Minisign public key format: 'Ed' (2 bytes) + 8-byte key ID + 32-byte raw public key
  const rawPub = publicKey.export({ type: 'spki', format: 'der' }).slice(-32);
  const keyId = crypto.randomBytes(8);
  const fullPub = Buffer.concat([Buffer.from('Ed'), keyId, rawPub]).toString('base64');

  // Minisign private key format: export as PKCS8 DER
  const pkcs8Der = privateKey.export({ type: 'pkcs8', format: 'der' });

  fs.writeFileSync(privPath, pkcs8Der, { mode: 0o600 });
  fs.writeFileSync(pubPath, fullPub, 'utf8');

  console.log('=====================================================');
  console.log('  PENROSE DESKTOP AUTO-UPDATER KEYPAIR GENERATED     ');
  console.log('=====================================================');
  console.log('Public Key (to put in tauri.conf.json):');
  console.log(`  "${fullPub}"`);
  console.log('');
  console.log('Private Key stored safely at:');
  console.log(`  ${privPath}`);
  console.log('  (Make sure .updater-keys/ is in .gitignore!)');
  console.log('=====================================================');

  return { pub: fullPub, pubPath, privPath };
}

/**
 * Sign an update archive file using the private key
 */
export function signFile(filePath, privKeyPath = path.join(KEYS_DIR, 'penrose-updater.key')) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  if (!fs.existsSync(privKeyPath)) {
    throw new Error(`Private key not found at ${privKeyPath}. Run 'node scripts/updater-tools.js generate-keys' first.`);
  }

  const privKeyDer = fs.readFileSync(privKeyPath);
  const privateKey = crypto.createPrivateKey({
    key: privKeyDer,
    format: 'der',
    type: 'pkcs8'
  });

  const fileData = fs.readFileSync(filePath);
  const sig = crypto.sign(null, fileData, privateKey);
  return sig.toString('base64');
}

/**
 * Generate latest.json manifest for Tauri v2 updater
 */
export function generateManifest({ version, notes, packages = {}, baseUrl = VPS_CONFIG.baseUrl }) {
  const pubDate = new Date().toISOString();

  const manifest = {
    version,
    notes: notes || `PenDesk oppdatering v${version} - Forbedret ytelse, stabilitet og sikkerhet.`,
    pub_date: pubDate,
    platforms: {}
  };

  for (const [platform, pkg] of Object.entries(packages)) {
    manifest.platforms[platform] = {
      signature: pkg.signature,
      url: pkg.url.startsWith('http') ? pkg.url : `${baseUrl}/${pkg.url}`
    };
  }

  return manifest;
}

/**
 * Main CLI dispatcher
 */
const cmd = process.argv[2];

if (cmd === 'generate-keys') {
  generateKeypair();
} else if (cmd === 'sign') {
  const file = process.argv[3];
  if (!file) {
    console.error('Usage: node scripts/updater-tools.js sign <file>');
    process.exit(1);
  }
  const signature = signFile(file);
  console.log('Signature (base64):', signature);
} else if (cmd === 'init-vps') {
  console.log('[Updater] Initializing latest.json on VPS...');
  const initial = generateManifest({
    version: '1.0.0',
    notes: 'PenDesk v1.0.0 — Offisiell stabil utgivelse for Windows, macOS og Linux.'
  });

  const tmpPath = path.join(ROOT_DIR, 'latest.json');
  fs.writeFileSync(tmpPath, JSON.stringify(initial, null, 2));

  try {
    execSync(`rsync -avz "${tmpPath}" ${VPS_CONFIG.host}:${VPS_CONFIG.remotePath}/latest.json`, { stdio: 'inherit' });
    fs.unlinkSync(tmpPath);
    console.log('[Updater] Successfully published latest.json to VPS!');
  } catch (err) {
    console.error('[Updater] Failed to rsync to VPS:', err.message);
  }
} else if (cmd === 'status') {
  try {
    const res = execSync(`curl -s ${VPS_CONFIG.baseUrl}/latest.json`, { encoding: 'utf8' });
    console.log('Current live latest.json on VPS:');
    console.log(res);
  } catch (err) {
    console.error('Failed to query VPS latest.json:', err.message);
  }
} else {
  console.log(`
PenDesk Updater CLI
Usage:
  node scripts/updater-tools.js generate-keys   Generate Ed25519 updater keypair
  node scripts/updater-tools.js sign <file>     Sign an update package
  node scripts/updater-tools.js init-vps        Upload initial latest.json to VPS
  node scripts/updater-tools.js status          Check current live latest.json on VPS
`);
}
