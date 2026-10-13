# PenDesk — Cross-Platform Remote Desktop

PenDesk is a high-performance, self-hosted cross-platform remote desktop system designed in the style of TeamViewer and RustDesk. Built with **Tauri v2**, **Rust**, and **WebRTC**, it features hardware-accelerated screen capture, sub-frame input injection, end-to-end encryption (DTLS-SRTP), and zero-configuration NAT traversal via Coturn (STUN/TURN) and a dedicated VPS signaling broker.

---

## Architecture Overview

```
               ┌─────────────────────────────────────────┐
               │    Controlling Operator (Viewer)        │
               │   Tauri v2 + WebRTC Stream Canvas       │
               └────────────────────┬────────────────────┘
                                    │
           1. Dial & SDP Offer      │        2. STUN Binding Test
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
          ┌───────────────────┐           ┌───────────────────┐
          │ Signaling Server  │           │   Coturn Relay    │
          │ (WebSocket/HTTPS) │           │   (STUN & TURN)   │
          └───────────────────┘           └───────────────────┘
                    ▲                               ▲
                    │                               │
                    └───────────────┬───────────────┘
                                    │  3. Direct P2P Stream (or TURN Fallback)
               ┌────────────────────┴────────────────────┐
               │         Controlled Host (Target)        │
               │   ScreenCaptureKit (Mac) / DXGI (Win)   │
               │   + Native CGEvent / SendInput Engine   │
               └─────────────────────────────────────────┘
```

### Key Components

| Directory | Role | Description |
| :--- | :--- | :--- |
| [`client/`](file:///Users/eba/Documents/dev/Penrose%20Systems/PenDesk/client) | **Desktop Client** | Tauri v2 desktop app with Rust native capture/input modules and a modern dark-mode UI. |
| [`server/`](file:///Users/eba/Documents/dev/Penrose%20Systems/PenDesk/server) | **Signaling Server** | High-performance WebSocket & REST server handling peer registration, 9-digit IDs, presence, and ICE credentials. |
| [`infra/`](file:///Users/eba/Documents/dev/Penrose%20Systems/PenDesk/infra) | **VPS Deployment** | Production Docker Compose stack with Coturn (STUN/TURN relay) and Caddy (automatic Let's Encrypt TLS). |

---

## 1. Deploying to Your VPS (Domain Setup)

### Prerequisites
- A Linux VPS (Ubuntu 22.04 / 24.04 or Debian) with a public IP.
- DNS A Records pointing to your VPS IP:
  - `pendesk.yourdomain.com` ➔ `YOUR_VPS_IP`
  - `turn.yourdomain.com` ➔ `YOUR_VPS_IP`

### Step 1: Open Firewall Ports on Your VPS
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 3478/udp
sudo ufw allow 3478/tcp
sudo ufw allow 5349/tcp
sudo ufw allow 49152:65535/udp
sudo ufw reload
```

### Step 2: Deploy the VPS Stack
Copy `infra/` and `server/` to your VPS:
```bash
scp -r infra server user@YOUR_VPS_IP:/opt/pendesk
ssh user@YOUR_VPS_IP
cd /opt/pendesk/infra

# Configure your domain in .env
cp .env.example .env
nano .env

# Run automated deployment
./deploy.sh
```

Caddy will automatically provision SSL certificates for your domain via Let's Encrypt. Verify with:
```bash
curl https://pendesk.yourdomain.com/health
curl https://pendesk.yourdomain.com/api/ice-servers
```

---

## 2. Desktop Client Features

- **9-Digit PenDesk Device ID**: Formatted as `XXX XXX XXX` (e.g., `492 810 523`) with one-click copy.
- **One-Time Passcode**: Automatically generated cryptographic session password with quick refresh and copy controls.
- **Direct P2P & TURN Fallback**: WebRTC attempts direct P2P connection via STUN; seamlessly falls back to your encrypted TURN relay if both sides are behind symmetric firewalls.
- **Native Input Injection**:
  - **macOS**: `CGEventPost` with normalized display coordinate mapping, mouse moves, left/right/middle clicks, smooth scroll wheel deltas, and keyboard shortcuts.
  - **Windows**: `SendInput` mouse and keyboard pipeline.
- **macOS Permissions Wizard**: In-app detection for Screen Recording and Accessibility permissions with direct deep-links to macOS System Settings.
- **Floating Session Toolbar**: Real-time telemetry (RTT latency in ms, FPS, WebRTC P2P/TURN badge), fit screen toggle, action menu (`Ctrl+Alt+Del`), and session disconnect.
- **VPS Overrides**: Settings modal to connect to your custom domain (`wss://pendesk.yourdomain.com/ws`).

---

## 3. Local Development & Building

### Running the Signaling Server Locally
```bash
cd server
node src/index.js
```

### Running the Client UI Preview
```bash
cd client
npm run dev:ui
# Open http://localhost:3000 in your browser
```

### Compiling the Native Desktop Application
```bash
cd client
# Run Rust compilation check
npm run check:rust

# Build native binary
cargo build --manifest-path src-tauri/Cargo.toml
```

---

## 4. Security & Cryptography

1. **End-to-End Encryption (E2EE)**: All media frames and input control data channels are encrypted using **DTLS 1.3** and **SRTP**. The VPS relay only forwards encrypted packets and cannot view screen content.
2. **Ephemeral TURN Credentials**: Time-limited HMAC-SHA1 tokens (RFC 5766 TURN REST API) prevent unauthorized relay usage.
3. **Password Protection**: Sessions require matching the host's one-time or permanent access passcode before SDP offers are accepted.
