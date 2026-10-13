# PenDesk VPS Infrastructure Deployment Guide

This directory contains the production-ready VPS infrastructure for PenDesk, including:
1. **Coturn**: STUN/TURN media relay server for seamless NAT traversal (even behind restrictive corporate firewalls and symmetric NATs).
2. **PenDesk Signaling Server**: Device registration, presence tracking, and WebRTC SDP/ICE session negotiation.
3. **Caddy**: High-performance reverse proxy that automatically provisions and renews SSL/TLS certificates via Let's Encrypt for your domain.

---

## 1. Prerequisites on Your VPS
- A VPS (Ubuntu 22.04 / 24.04 or Debian recommended) with a public IP.
- Docker and Docker Compose installed (`apt install docker.io docker-compose-plugin`).
- DNS A Records pointed to your VPS IP:
  - `pendesk.yourdomain.com` -> `YOUR_VPS_IP`
  - `turn.yourdomain.com` -> `YOUR_VPS_IP`

---

## 2. Firewall Configuration (UFW)
Ensure the following ports are allowed on your VPS:

```bash
# Web & TLS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# STUN / TURN Ports
sudo ufw allow 3478/udp
sudo ufw allow 3478/tcp
sudo ufw allow 5349/tcp

# TURN UDP Relay Range (for direct peer video forwarding)
sudo ufw allow 49152:65535/udp

sudo ufw reload
```

---

## 3. Quick Deployment (1-Command)

1. Clone or copy the `infra/` and `server/` folders to your VPS:
   ```bash
   scp -r infra server user@your-vps-ip:/opt/pendesk
   ```

2. SSH into your VPS:
   ```bash
   ssh user@your-vps-ip
   cd /opt/pendesk/infra
   ```

3. Configure your domain in `.env`:
   ```bash
   cp .env.example .env
   nano .env
   ```
   Set:
   ```env
   DOMAIN=pendesk.yourdomain.com
   TURN_DOMAIN=turn.yourdomain.com
   ACME_EMAIL=your-email@example.com
   ```

4. Run the automated deployment script:
   ```bash
   ./deploy.sh
   ```

---

## 4. Verification

- **Health check**: `curl https://pendesk.yourdomain.com/health`
- **ICE Servers**: `curl https://pendesk.yourdomain.com/api/ice-servers`
- **Signaling WebSocket**: `wss://pendesk.yourdomain.com/ws`
