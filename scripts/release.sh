#!/usr/bin/env bash
set -e

VERSION=$1
NOTES=${2:-"PenDesk v$VERSION — Forbedret ytelse, stabilitet og sikkerhet."}

if [ -z "$VERSION" ]; then
  echo "Bruk: ./scripts/release.sh <versjonsnummer> [endringslogg]"
  echo "Eksempel: ./scripts/release.sh 1.1.0 'Optimalisert skjermstrømming og nye hurtigtaster'"
  exit 1
fi

echo "=================================================="
echo "  PUBLISERER PENDESK OPPDATERING v$VERSION        "
echo "=================================================="

# 1. Oppdater versjonsnummer i tauri.conf.json og client/package.json
node -e "
import fs from 'fs';
const tcPath = 'client/src-tauri/tauri.conf.json';
const tc = JSON.parse(fs.readFileSync(tcPath, 'utf8'));
tc.version = '$VERSION';
fs.writeFileSync(tcPath, JSON.stringify(tc, null, 2) + '\n');

const pkgPath = 'client/package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = '$VERSION';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('[1/3] Versjonsnummer oppdatert til $VERSION');
"

# 2. Generer latest.json med digital Minisign/Ed25519-signatur
node -e "
import fs from 'fs';
import { generateManifest } from './scripts/updater-tools.js';

const manifest = generateManifest({
  version: '$VERSION',
  notes: '$NOTES'
});

fs.writeFileSync('latest.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('[2/3] Generert latest.json manifest for v$VERSION');
"

# 3. Last opp til VPS
echo "[3/3] Laster opp til https://hjelp.penrose.no/updates/ ..."
rsync -avz latest.json root@164.92.214.242:/var/www/hjelp-portal/public/updates/latest.json
rm -f latest.json

echo ""
echo "=================================================="
echo "  OPPDATERING v$VERSION ER NÅ LIVE PÅ VPS!         "
echo "  Alle installerte PenDesk-klienter vil nå få     "
echo "  automatisk varsel om ny oppdatering.            "
echo "=================================================="
