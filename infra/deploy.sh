#!/usr/bin/env bash
set -e

# ============================================================
# PenDesk VPS Automated Deployment Script
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "======================================================="
echo "  PenDesk VPS Deployment & Provisioning Tool"
echo "======================================================="

# Check prerequisites
if ! command -v docker &> /dev/null; then
    echo "[-] Error: docker is not installed. Please install Docker first."
    exit 1
fi

# Ensure .env exists
if [ ! -f .env ]; then
    if [ -f .env.example ]; then
        echo "[+] Creating .env from .env.example..."
        cp .env.example .env
        
        # Auto-generate secure random TURN secret
        RANDOM_SECRET=$(openssl rand -hex 32 2>/dev/null || date +%s%N | sha256sum | head -c 64)
        sed -i.bak "s/replace_with_a_secure_random_64_char_hex_secret/${RANDOM_SECRET}/g" .env
        rm -f .env.bak
        echo "[+] Generated new secure TURN_SECRET."
    else
        echo "[-] Error: .env.example not found."
        exit 1
    fi
fi

# Source environment
set -a
source .env
set +a

if [ -z "$DOMAIN" ] || [ "$DOMAIN" = "pendesk.yourdomain.com" ]; then
    echo "[!] Warning: DOMAIN is currently set to '$DOMAIN'."
    echo "[!] Please edit $SCRIPT_DIR/.env with your actual domain name."
fi

# Generate turnserver.generated.conf with injected values
echo "[+] Generating Coturn configuration..."
sed -e "s/PENDESK_TURN_SECRET_PLACEHOLDER/${TURN_SECRET}/g" \
    -e "s/PENDESK_REALM_PLACEHOLDER/${TURN_DOMAIN:-$DOMAIN}/g" \
    turnserver.conf > turnserver.generated.conf

# Check firewall hint
echo "======================================================="
echo "[*] FIREWALL NOTICE: Ensure these ports are open on your VPS:"
echo "    - 80/tcp, 443/tcp (Web & HTTPS)"
echo "    - 3478/udp, 3478/tcp (STUN/TURN Signaling)"
echo "    - 49152-65535/udp (TURN Media Relay Range)"
echo ""
echo "    If using ufw on Ubuntu/Debian:"
echo "    sudo ufw allow 80/tcp"
echo "    sudo ufw allow 443/tcp"
echo "    sudo ufw allow 3478/udp"
echo "    sudo ufw allow 3478/tcp"
echo "    sudo ufw allow 49152:65535/udp"
echo "======================================================="

echo "[+] Starting PenDesk infrastructure services with Docker Compose..."
docker compose up -d --build

echo ""
echo "======================================================="
echo "  ✓ PenDesk VPS Infrastructure is running!"
echo "  Signaling URL: wss://${DOMAIN}/ws"
echo "  Health Check:  https://${DOMAIN}/health"
echo "  ICE Config:    https://${DOMAIN}/api/ice-servers"
echo "  STUN/TURN:     stun:${TURN_DOMAIN:-$DOMAIN}:3478"
echo "======================================================="
