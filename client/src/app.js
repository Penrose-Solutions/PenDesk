import { WebRtcManager } from './webrtc-manager.js?v=2027_v4';

// Check Tauri native environment
const isTauri = typeof window.__TAURI__ !== 'undefined';

// Application State (In browser, use sessionStorage so two tabs have unique IDs for testing)
// Clean up any stale localhost URL from previous visits
try {
  const storedUrl = localStorage.getItem('pendesk_signaling_url');
  if (storedUrl && storedUrl.includes('localhost') && window.location.protocol === 'https:') {
    localStorage.removeItem('pendesk_signaling_url');
  }
} catch {}

function resolveSignalingUrl() {
  if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
    const custom = localStorage.getItem('pendesk_signaling_url');
    if (custom && custom.startsWith('wss://') && !custom.includes('localhost')) {
      return custom;
    }
    return `wss://${window.location.host}/ws`;
  }
  return localStorage.getItem('pendesk_signaling_url') || 'wss://hjelp.penrose.no/ws';
}

const state = {
  localId: storage.getItem('pendesk_device_id') || '',
  localPasscode: generateRandomPasscode(),
  signalingUrl: resolveSignalingUrl(),
  recentConnections: JSON.parse(localStorage.getItem('pendesk_recent') || '[]'),
  inSession: false
};

// DOM References
const elLocalId = document.getElementById('local-desk-id');
const elLocalPass = document.getElementById('local-passcode');
const elStatusPill = document.getElementById('status-pill');
const elStatusText = document.getElementById('status-text');
const elVpsLabel = document.getElementById('vps-connection-label');
const elRemoteIdInput = document.getElementById('remote-id-input');
const elRemotePassInput = document.getElementById('remote-pass-input');
const elBtnConnect = document.getElementById('btn-connect');
const elBtnConnectText = document.getElementById('btn-connect-text');
const elRecentChips = document.getElementById('recent-chips-list');
const elRecentCount = document.getElementById('recent-count');

const elSessionOverlay = document.getElementById('session-overlay');
const elRemoteVideo = document.getElementById('remote-video');
const elStatLatency = document.getElementById('stat-latency');
const elStatFps = document.getElementById('stat-fps');
const elBtnDisconnect = document.getElementById('btn-disconnect');
const elBtnFullscreen = document.getElementById('btn-fullscreen');

const elSettingsModal = document.getElementById('settings-modal');
const elBtnOpenSettings = document.getElementById('btn-open-settings');
const elBtnCloseSettings = document.getElementById('btn-close-settings');
const elBtnSaveSettings = document.getElementById('btn-save-settings');
const elSettingVpsDomain = document.getElementById('setting-vps-domain');

const elPermissionBanner = document.getElementById('permission-banner');
const elBtnRequestPerms = document.getElementById('btn-request-perms');

// Helper Functions
function generateRandomPasscode() {
  const chars = '23456789abcdefghjkmnpqrstuvwxyz';
  let res = '';
  for (let i = 0; i < 6; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

function formatPartnerId(val) {
  const digits = val.replace(/\D/g, '').slice(0, 9);
  const parts = [];
  if (digits.length > 0) parts.push(digits.slice(0, 3));
  if (digits.length > 3) parts.push(digits.slice(3, 6));
  if (digits.length > 6) parts.push(digits.slice(6, 9));
  return parts.join(' ');
}

// Check Tauri native environment
const isTauri = typeof window.__TAURI__ !== 'undefined';

async function invokeTauri(cmd, args = {}) {
  if (isTauri && window.__TAURI__.core) {
    return await window.__TAURI__.core.invoke(cmd, args);
  }
  return null;
}

// Initialize WebRTC Manager
const rtc = new WebRtcManager({
  signalingUrl: state.signalingUrl,
  clientId: state.localId,
  password: state.localPasscode,
  deviceName: 'PenDesk Desktop',

  onStatusChange: (status, message) => {
    elStatusPill.className = 'status-pill ' + (status === 'ready' ? '' : status);
    elStatusText.textContent = message;
    elVpsLabel.textContent = `VPS Signaling: ${state.signalingUrl}`;
  },

  onRegistered: (assignedId) => {
    state.localId = assignedId;
    storage.setItem('pendesk_device_id', assignedId);
    elLocalId.textContent = assignedId;
  },

  onIncomingCall: async ({ fromId, deviceName, accept, reject }) => {
    const ok = confirm(`Innkommende forespørsel om fjernhjelp:\nOperatør: ${fromId} (${deviceName})\n\nVil du tillate tilkobling og dele skjermen din?`);
    if (ok) {
      let localStream = null;
      try {
        // Capture screen via ScreenCaptureKit / standard getDisplayMedia
        localStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 60, max: 60 },
            cursor: 'always'
          },
          audio: true
        });
      } catch (err) {
        console.warn('Kunne ikke hente skjermopptak via nettleser-API:', err);
      }
      await accept(localStream);
    } else {
      reject('Brukeren avslo tilkoblingsforespørselen');
    }
  },

  onRemoteTrack: (stream) => {
    elRemoteVideo.srcObject = stream;
    elRemoteVideo.play().catch((e) => console.warn('Autoplay info:', e));
    elSessionOverlay.classList.add('active');
    state.inSession = true;
  },

  onDataMessage: async (rawData) => {
    try {
      const event = JSON.parse(rawData);
      // Dispatch input event to Tauri's native OS injection module!
      if (isTauri) {
        await invokeTauri('inject_input', { event });
      }
    } catch (err) {
      console.error('Input injection error:', err);
    }
  },

  onTelemetryUpdate: ({ rtt, fps, transport }) => {
    if (rtt !== null) elStatLatency.textContent = `${rtt} ms`;
    elStatFps.textContent = `${fps} FPS`;
  },

  onSessionEnded: (reason) => {
    elSessionOverlay.classList.remove('active');
    state.inSession = false;
    elRemoteVideo.srcObject = null;
    alert(reason || 'Session ended');
  }
});

// Setup UI Event Handlers
function setupEventListeners() {
  // Render credentials
  elLocalId.textContent = state.localId || 'Allocating...';
  elLocalPass.textContent = state.localPasscode;
  elSettingVpsDomain.value = state.signalingUrl;

  // Copy ID
  document.getElementById('btn-copy-id').addEventListener('click', () => {
    navigator.clipboard.writeText(state.localId.replace(/\s/g, ''));
    flashButton(document.getElementById('btn-copy-id'));
  });

  // Copy Password
  document.getElementById('btn-copy-pass').addEventListener('click', () => {
    navigator.clipboard.writeText(state.localPasscode);
    flashButton(document.getElementById('btn-copy-pass'));
  });

  // Regenerate Password
  document.getElementById('btn-refresh-pass').addEventListener('click', () => {
    state.localPasscode = generateRandomPasscode();
    elLocalPass.textContent = state.localPasscode;
    rtc.updateCredentials(state.localPasscode);
    flashButton(document.getElementById('btn-refresh-pass'));
  });

  // Partner ID formatting
  elRemoteIdInput.addEventListener('input', (e) => {
    e.target.value = formatPartnerId(e.target.value);
  });

  // Connect Button
  elBtnConnect.addEventListener('click', async () => {
    const targetId = elRemoteIdInput.value.trim();
    const pass = elRemotePassInput.value.trim();

    if (targetId.length < 9) {
      alert('Please enter a valid 9-digit partner ID');
      return;
    }

    elBtnConnectText.textContent = 'Connecting...';
    elBtnConnect.style.opacity = '0.7';

    try {
      await rtc.dial(targetId, pass);
      saveRecentConnection(targetId);
    } catch (err) {
      alert('Failed to initiate connection: ' + err.message);
    } finally {
      elBtnConnectText.textContent = 'Connect to Partner';
      elBtnConnect.style.opacity = '1';
    }
  });

  // Disconnect Button
  elBtnDisconnect.addEventListener('click', () => {
    rtc.disconnectSession();
  });

  // Fullscreen Button
  elBtnFullscreen.addEventListener('click', () => {
    if (!document.fullscreenElement) {
      elSessionOverlay.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // Settings Modal
  elBtnOpenSettings.addEventListener('click', () => {
    elSettingsModal.classList.add('active');
  });

  elBtnCloseSettings.addEventListener('click', () => {
    elSettingsModal.classList.remove('active');
  });

  elBtnSaveSettings.addEventListener('click', () => {
    const newUrl = elSettingVpsDomain.value.trim();
    if (newUrl) {
      state.signalingUrl = newUrl;
      localStorage.setItem('pendesk_signaling_url', newUrl);
      rtc.signalingUrl = newUrl;
      rtc.connectSignaling();
    }
    elSettingsModal.classList.remove('active');
  });

  // Permissions Check (macOS)
  if (isTauri) {
    invokeTauri('check_permissions').then((perms) => {
      if (perms && (!perms.screen_recording || !perms.accessibility)) {
        elPermissionBanner.style.display = 'flex';
      }
    });

    elBtnRequestPerms.addEventListener('click', () => {
      invokeTauri('open_permission_settings');
    });
  }

  // Setup Remote Input Listeners (Viewport)
  setupInputForwarding();
  renderRecentConnections();
}

// Forward mouse & keyboard events to Host
function setupInputForwarding() {
  const container = document.getElementById('stream-container');

  function getNormalizedCoords(e) {
    const rect = elRemoteVideo.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  }

  container.addEventListener('mousemove', (e) => {
    if (!state.inSession) return;
    const { x, y } = getNormalizedCoords(e);
    rtc.sendInputEvent({ type: 'mousemove', x, y });
  });

  container.addEventListener('mousedown', (e) => {
    if (!state.inSession) return;
    const { x, y } = getNormalizedCoords(e);
    rtc.sendInputEvent({ type: 'mousedown', x, y, button: e.button });
  });

  container.addEventListener('mouseup', (e) => {
    if (!state.inSession) return;
    const { x, y } = getNormalizedCoords(e);
    rtc.sendInputEvent({ type: 'mouseup', x, y, button: e.button });
  });

  container.addEventListener('wheel', (e) => {
    if (!state.inSession) return;
    rtc.sendInputEvent({ type: 'wheel', deltaX: e.deltaX, deltaY: e.deltaY });
  }, { passive: true });

  window.addEventListener('keydown', (e) => {
    if (!state.inSession) return;
    if (['Tab', 'Alt', 'Meta', 'F5'].includes(e.key)) e.preventDefault();
    rtc.sendInputEvent({ type: 'keydown', key: e.key, code: e.code });
  });

  window.addEventListener('keyup', (e) => {
    if (!state.inSession) return;
    rtc.sendInputEvent({ type: 'keyup', key: e.key, code: e.code });
  });
}

function flashButton(btn) {
  const orig = btn.style.borderColor;
  btn.style.borderColor = 'var(--accent-cyan)';
  setTimeout(() => { btn.style.borderColor = orig; }, 300);
}

function saveRecentConnection(id) {
  if (!state.recentConnections.includes(id)) {
    state.recentConnections.unshift(id);
    if (state.recentConnections.length > 5) state.recentConnections.pop();
    localStorage.setItem('pendesk_recent', JSON.stringify(state.recentConnections));
    renderRecentConnections();
  }
}

function renderRecentConnections() {
  if (state.recentConnections.length === 0) {
    elRecentChips.innerHTML = '<span style="font-size: 12px; color: var(--text-dim);">No recent sessions yet. Connected partner desks will appear here.</span>';
    elRecentCount.textContent = '0 saved';
    return;
  }

  elRecentCount.textContent = `${state.recentConnections.length} saved`;
  elRecentChips.innerHTML = '';
  state.recentConnections.forEach((id) => {
    const chip = document.createElement('div');
    chip.className = 'session-chip';
    chip.innerHTML = `
      <span>${id}</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="9 18 15 12 9 6"></polyline>
      </svg>
    `;
    chip.addEventListener('click', () => {
      elRemoteIdInput.value = id;
      elRemotePassInput.focus();
    });
    elRecentChips.appendChild(chip);
  });
}

// Bootstrap
window.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  rtc.connectSignaling();
});
