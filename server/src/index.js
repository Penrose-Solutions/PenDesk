import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from './websocket.js';
import { db } from './db.js';
import { hashPassword, verifyPassword, createToken, verifyToken } from './auth.js';

const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const TURN_DOMAIN = process.env.TURN_DOMAIN || 'hjelp.penrose.no';
const TURN_SECRET = process.env.TURN_SECRET || 'pendesk_secure_secret_replace_in_prod';
const STUN_PORT = process.env.STUN_PORT || '3478';
const TURN_PORT = process.env.TURN_PORT || '3478';

// Store registered active peers: Map<clientId, PeerRecord>
const peers = new Map();

function generateNineDigitId() {
  let id;
  do {
    const raw = Math.floor(100000000 + Math.random() * 900000000).toString();
    id = `${raw.slice(0, 3)} ${raw.slice(3, 6)} ${raw.slice(6, 9)}`;
  } while (peers.has(id));
  return id;
}

function generateTurnCredentials(username, secret, ttlSeconds = 86400) {
  // Coturn usernames MUST NOT contain spaces or special characters
  const safeUser = (username || 'guest').replace(/[^a-zA-Z0-9_]/g, '') || 'client';
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const user = `${expiry}:${safeUser}`;
  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(user);
  const password = hmac.digest('base64');
  return { username: user, password };
}

function getIceServers(clientId) {
  const creds = generateTurnCredentials(clientId || 'guest', TURN_SECRET);
  return [
    {
      urls: [
        `stun:${TURN_DOMAIN}:${STUN_PORT}`,
        'stun:stun.l.google.com:19302'
      ]
    },
    {
      urls: [
        `turn:${TURN_DOMAIN}:${TURN_PORT}?transport=udp`,
        `turn:${TURN_DOMAIN}:${TURN_PORT}?transport=tcp`
      ],
      username: creds.username,
      credential: creds.password
    }
  ];
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1e6) {
        req.destroy();
        reject(new Error('Payload for stor'));
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function getAuthUser(req) {
  const authHeader = req.headers['authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7).trim();
  return verifyToken(token);
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Health check
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        status: 'ok',
        service: 'PenDesk Signaling Server',
        version: '1.0.0',
        activePeers: peers.size,
        uptime: Math.floor(process.uptime())
      })
    );
    return;
  }

  // Legacy heartbeat & sysinfo endpoint stubs
  if (url.pathname === '/api/heartbeat' || url.pathname === '/api/sysinfo') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // Get ICE Servers configuration
  if (url.pathname === '/api/ice-servers') {
    const clientId = url.searchParams.get('clientId') || 'anonymous';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        iceServers: getIceServers(clientId)
      })
    );
    return;
  }

  // Peer status lookup
  if (url.pathname === '/api/peer-status') {
    const targetId = url.searchParams.get('id');
    const isOnline = !!targetId && peers.has(targetId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        id: targetId,
        online: isOnline
      })
    );
    return;
  }

  // ==========================================
  // AUTH API: Register
  // ==========================================
  if (url.pathname === '/api/auth/register' && req.method === 'POST') {
    try {
      const { email, password, name } = await parseJsonBody(req);
      if (!email || !password || !name) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Navn, e-post og passord er påkrevd.' }));
        return;
      }
      if (password.length < 6) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Passordet må ha minst 6 tegn.' }));
        return;
      }

      const cleanEmail = email.toLowerCase().trim();
      const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail);
      if (existing) {
        res.writeHead(409, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'En bruker med denne e-postadressen finnes allerede.' }));
        return;
      }

      const { hash, salt } = hashPassword(password);
      const userId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO users (id, email, password_hash, salt, name)
        VALUES (?, ?, ?, ?, ?)
      `).run(userId, cleanEmail, hash, salt, name.trim());

      const token = createToken({ userId, email: cleanEmail, name: name.trim() });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        token,
        user: { id: userId, email: cleanEmail, name: name.trim() }
      }));
    } catch (err) {
      console.error('[API] Register error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Intern serverfeil ved registrering.' }));
    }
    return;
  }

  // ==========================================
  // AUTH API: Login
  // ==========================================
  if (url.pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const { email, password } = await parseJsonBody(req);
      if (!email || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'E-post og passord er påkrevd.' }));
        return;
      }

      const cleanEmail = email.toLowerCase().trim();
      const user = db.prepare('SELECT id, email, password_hash, salt, name FROM users WHERE email = ?').get(cleanEmail);
      if (!user || !verifyPassword(password, user.password_hash, user.salt)) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Ugyldig e-post eller passord.' }));
        return;
      }

      const token = createToken({ userId: user.id, email: user.email, name: user.name });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        token,
        user: { id: user.id, email: user.email, name: user.name }
      }));
    } catch (err) {
      console.error('[API] Login error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Intern serverfeil ved innlogging.' }));
    }
    return;
  }

  // ==========================================
  // AUTH API: Current User Profile (me)
  // ==========================================
  if (url.pathname === '/api/auth/me' && req.method === 'GET') {
    const authUser = getAuthUser(req);
    if (!authUser) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Uautorisert.' }));
      return;
    }
    const user = db.prepare('SELECT id, email, name, created_at FROM users WHERE id = ?').get(authUser.userId);
    if (!user) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bruker ikke funnet.' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ user }));
    return;
  }

  // ==========================================
  // DEVICES API: List My Devices
  // ==========================================
  if (url.pathname === '/api/devices' && req.method === 'GET') {
    const authUser = getAuthUser(req);
    if (!authUser) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Uautorisert.' }));
      return;
    }
    const rows = db.prepare(`
      SELECT id, device_id, alias, platform, permanent_password, created_at, last_seen
      FROM devices
      WHERE user_id = ?
      ORDER BY created_at DESC
    `).all(authUser.userId);

    const devices = rows.map((row) => ({
      id: row.id,
      deviceId: row.device_id,
      alias: row.alias,
      platform: row.platform,
      hasPermanentPassword: !!row.permanent_password,
      permanentPassword: row.permanent_password || '',
      isOnline: peers.has(row.device_id),
      createdAt: row.created_at,
      lastSeen: row.last_seen
    }));

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ devices }));
    return;
  }

  // ==========================================
  // DEVICES API: Add or Update Device
  // ==========================================
  if (url.pathname === '/api/devices' && req.method === 'POST') {
    const authUser = getAuthUser(req);
    if (!authUser) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Uautorisert.' }));
      return;
    }
    try {
      const { deviceId, alias, platform, permanentPassword } = await parseJsonBody(req);
      if (!deviceId || !alias) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Enhets-ID og maskinnavn er påkrevd.' }));
        return;
      }

      const cleanDeviceId = deviceId.replace(/\s+/g, ' ').trim();
      const existing = db.prepare('SELECT id FROM devices WHERE user_id = ? AND device_id = ?').get(authUser.userId, cleanDeviceId);

      if (existing) {
        db.prepare(`
          UPDATE devices
          SET alias = ?, platform = ?, permanent_password = ?
          WHERE id = ?
        `).run(alias.trim(), platform || 'generic', permanentPassword || null, existing.id);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'updated',
          device: {
            id: existing.id,
            deviceId: cleanDeviceId,
            alias: alias.trim(),
            platform: platform || 'generic',
            hasPermanentPassword: !!permanentPassword,
            isOnline: peers.has(cleanDeviceId)
          }
        }));
      } else {
        const id = crypto.randomUUID();
        db.prepare(`
          INSERT INTO devices (id, user_id, device_id, alias, platform, permanent_password)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(id, authUser.userId, cleanDeviceId, alias.trim(), platform || 'generic', permanentPassword || null);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          status: 'created',
          device: {
            id,
            deviceId: cleanDeviceId,
            alias: alias.trim(),
            platform: platform || 'generic',
            hasPermanentPassword: !!permanentPassword,
            isOnline: peers.has(cleanDeviceId)
          }
        }));
      }
    } catch (err) {
      console.error('[API] Add device error:', err);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Kunne ikke lagre enhet.' }));
    }
    return;
  }

  // ==========================================
  // DEVICES API: Delete Device
  // ==========================================
  if (url.pathname.startsWith('/api/devices/') && req.method === 'DELETE') {
    const authUser = getAuthUser(req);
    if (!authUser) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Uautorisert.' }));
      return;
    }
    const id = url.pathname.replace('/api/devices/', '').trim();
    db.prepare('DELETE FROM devices WHERE id = ? AND user_id = ?').run(id, authUser.userId);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'deleted', id }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

// WebSocket Server
const wss = new WebSocketServer();

server.on('upgrade', (req, socket, head) => {
  wss.handleUpgrade(req, socket, head);
});

wss.on('connection', (ws) => {
  let currentClientId = null;

  const send = (msgObj) => {
    try {
      ws.send(JSON.stringify(msgObj));
    } catch (err) {
      console.error(`[Signaling] Failed to send message:`, err);
    }
  };

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      send({ type: 'error', message: 'Invalid JSON payload' });
      return;
    }

    switch (msg.type) {
      case 'register': {
        let id = msg.clientId;
        if (!id || id.trim().length === 0) {
          id = generateNineDigitId();
        }

        const cleanId = id.replace(/\s+/g, ' ').trim();

        // If another socket was registered with this ID, close the previous one cleanly
        if (peers.has(cleanId)) {
          const old = peers.get(cleanId);
          if (old.ws !== ws) {
            console.log(`[Signaling] Re-registering ID ${cleanId}, closing previous connection`);
            old.ws.close();
          }
        }

        currentClientId = cleanId;

        peers.set(cleanId, {
          ws,
          clientId: cleanId,
          password: msg.password || '',
          permanentPassword: (msg.permanentPassword || '').trim(),
          allowUnattended: Boolean(msg.allowUnattended),
          deviceName: msg.deviceName || 'PenDesk Client',
          platform: msg.platform || 'generic',
          connectedAt: new Date().toISOString()
        });

        try {
          db.prepare('UPDATE devices SET last_seen = CURRENT_TIMESTAMP WHERE device_id = ?').run(cleanId);
        } catch {}

        console.log(`[Signaling] Peer registered: ${cleanId} (${msg.deviceName}) unattended=${Boolean(msg.allowUnattended)}`);

        send({
          type: 'registered',
          clientId: cleanId,
          iceServers: getIceServers(cleanId)
        });
        break;
      }

      case 'heartbeat': {
        send({ type: 'heartbeat_ack', timestamp: Date.now() });
        break;
      }

      case 'dial': {
        const targetId = (msg.targetId || '').trim();

        // Prevent self-connection
        if (targetId === currentClientId) {
          send({
            type: 'dial_response',
            targetId,
            success: false,
            reason: 'Du kan ikke koble til din egen enhet. Åpne et inkognitovindu for å teste med en separat ID.'
          });
          return;
        }

        const target = peers.get(targetId);

        if (!target) {
          send({
            type: 'dial_response',
            targetId,
            success: false,
            reason: 'Partner-enheten er ikke pålogget eller ID finnes ikke.'
          });
          return;
        }

        // Validate password against one-time passcode OR permanent unattended password
        const isOtpMatch = target.password && target.password === msg.password;
        const isPermMatch = target.allowUnattended && target.permanentPassword && target.permanentPassword === msg.password;

        if (target.password && !isOtpMatch && !isPermMatch) {
          send({
            type: 'dial_response',
            targetId,
            success: false,
            reason: 'Feil passord for fjernstyring.'
          });
          return;
        }

        console.log(`[Signaling] Dial: ${currentClientId} -> ${targetId} (unattended=${isPermMatch})`);

        // Forward connection offer to target host
        target.ws.send(
          JSON.stringify({
            type: 'incoming_connection',
            fromId: currentClientId,
            deviceName: msg.deviceName || 'Fjernhjelp Operatør',
            sdpOffer: msg.sdpOffer,
            unattended: isPermMatch
          })
        );
        break;
      }

      case 'dial_answer': {
        const targetId = (msg.targetId || '').trim();
        const caller = peers.get(targetId);

        if (caller) {
          console.log(`[Signaling] Dial Answer: ${currentClientId} -> ${targetId} (accepted=${msg.accepted})`);
          if (msg.accepted) {
            caller.activePartnerId = currentClientId;
            const currentHost = peers.get(currentClientId);
            if (currentHost) currentHost.activePartnerId = targetId;
          }
          caller.ws.send(
            JSON.stringify({
              type: 'dial_response',
              targetId: currentClientId,
              success: msg.accepted,
              sdpAnswer: msg.sdpAnswer,
              reason: msg.reason || null
            })
          );
        }
        break;
      }

      case 'ice_candidate': {
        const targetId = (msg.targetId || '').trim();
        const target = peers.get(targetId);

        if (target) {
          target.ws.send(
            JSON.stringify({
              type: 'ice_candidate',
              fromId: currentClientId,
              candidate: msg.candidate
            })
          );
        }
        break;
      }

      case 'hangup': {
        const targetId = (msg.targetId || '').trim();
        const target = peers.get(targetId);
        if (target) {
          target.activePartnerId = null;
          target.ws.send(
            JSON.stringify({
              type: 'session_ended',
              fromId: currentClientId,
              reason: msg.reason || 'Økten ble avsluttet av brukeren.'
            })
          );
        }
        const sender = peers.get(currentClientId);
        if (sender) sender.activePartnerId = null;
        break;
      }

      default:
        console.warn(`[Signaling] Unrecognized message type: ${msg.type}`);
    }
  });

  ws.on('close', () => {
    if (currentClientId && peers.has(currentClientId)) {
      const record = peers.get(currentClientId);
      if (record.ws === ws) {
        console.log(`[Signaling] Peer disconnected: ${currentClientId}`);
        if (record.activePartnerId) {
          const partner = peers.get(record.activePartnerId);
          if (partner && partner.ws && partner.ws.readyState === WebSocket.OPEN) {
            console.log(`[Signaling] Notifying partner ${record.activePartnerId} that ${currentClientId} disconnected`);
            partner.activePartnerId = null;
            partner.ws.send(
              JSON.stringify({
                type: 'session_ended',
                fromId: currentClientId,
                reason: 'Partneren lukket nettleseren eller mistet tilkoblingen.'
              })
            );
          }
        }
        peers.delete(currentClientId);
      }
    }
  });

  ws.on('error', (err) => {
    console.error(`[Signaling] Socket error for ${currentClientId}:`, err.message);
  });
});

server.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`  PenDesk Signaling & Rendezvous Server`);
  console.log(`  Running on: http://${HOST}:${PORT}`);
  console.log(`  STUN/TURN Domain: ${TURN_DOMAIN}:${TURN_PORT}`);
  console.log(`=======================================================`);
});
