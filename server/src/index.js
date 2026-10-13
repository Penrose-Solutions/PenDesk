import http from 'node:http';
import crypto from 'node:crypto';
import { WebSocketServer } from './websocket.js';

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

// HTTP Server
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
          deviceName: msg.deviceName || 'PenDesk Client',
          connectedAt: new Date().toISOString()
        });

        console.log(`[Signaling] Peer registered: ${cleanId} (${msg.deviceName})`);

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

        // Validate password if host requires one
        if (target.password && target.password !== msg.password) {
          send({
            type: 'dial_response',
            targetId,
            success: false,
            reason: 'Feil engangskode for fjernstyring.'
          });
          return;
        }

        console.log(`[Signaling] Dial: ${currentClientId} -> ${targetId}`);

        // Forward connection offer to target host
        target.ws.send(
          JSON.stringify({
            type: 'incoming_connection',
            fromId: currentClientId,
            deviceName: msg.deviceName || 'Fjernhjelp Operatør',
            sdpOffer: msg.sdpOffer
          })
        );
        break;
      }

      case 'dial_answer': {
        const targetId = (msg.targetId || '').trim();
        const caller = peers.get(targetId);

        if (caller) {
          console.log(`[Signaling] Dial Answer: ${currentClientId} -> ${targetId} (accepted=${msg.accepted})`);
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
          target.ws.send(
            JSON.stringify({
              type: 'session_ended',
              fromId: currentClientId,
              reason: msg.reason || 'Økten ble avsluttet av brukeren.'
            })
          );
        }
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
