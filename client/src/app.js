import { WebRtcManager } from './webrtc-manager.js?v=2027_v6';

// Check Tauri native environment
const isTauri = typeof window !== 'undefined' && typeof window.__TAURI__ !== 'undefined';

// Use sessionStorage in browser so each tab has its own unique Desk ID for testing
const storage = (typeof window !== 'undefined' && !isTauri && window.sessionStorage) 
  ? window.sessionStorage 
  : (typeof window !== 'undefined' && window.localStorage ? window.localStorage : { getItem: () => null, setItem: () => {} });

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

function resolveSignalingUrl() {
  if (typeof window !== 'undefined' && window.location && window.location.protocol === 'https:') {
    try {
      const custom = localStorage.getItem('pendesk_signaling_url');
      if (custom && custom.startsWith('wss://') && !custom.includes('localhost')) {
        return custom;
      }
    } catch {}
    return `wss://${window.location.host}/ws`;
  }
  try {
    return localStorage.getItem('pendesk_signaling_url') || 'wss://hjelp.penrose.no/ws';
  } catch {
    return 'wss://hjelp.penrose.no/ws';
  }
}

// Clean up any stale localhost URL from previous visits
try {
  const storedUrl = localStorage.getItem('pendesk_signaling_url');
  if (storedUrl && storedUrl.includes('localhost') && window.location.protocol === 'https:') {
    localStorage.removeItem('pendesk_signaling_url');
  }
} catch {}

// Application State
const state = {
  localId: storage.getItem('pendesk_device_id') || '',
  localPasscode: generateRandomPasscode(),
  signalingUrl: resolveSignalingUrl(),
  recentConnections: JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem('pendesk_recent')) || '[]'),
  inSession: false,
  unreadChat: 0,
  isDrawerOpen: false,
  activeDrawerTab: 'chat',

  // Authentication & Device Management State
  authToken: (typeof localStorage !== 'undefined' && localStorage.getItem('pendesk_auth_token')) || '',
  currentUser: null,
  devices: [],
  activeView: 'desk',

  // Unattended Access State
  allowUnattended: (typeof localStorage !== 'undefined' && localStorage.getItem('pendesk_unattended_enabled') === 'true'),
  permanentPassword: (typeof localStorage !== 'undefined' && localStorage.getItem('pendesk_permanent_password')) || ''
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

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

// Navigation & Views
const elNavRemote = document.getElementById('nav-remote');
const elNavDevices = document.getElementById('nav-devices');
const elViewTitle = document.getElementById('view-title');
const elBtnAuthUser = document.getElementById('btn-auth-user');
const elAuthUserLabel = document.getElementById('auth-user-label');
const elViewDesk = document.getElementById('view-desk');
const elViewDevices = document.getElementById('view-devices');

// Unattended Access Elements (Card 1)
const elToggleUnattended = document.getElementById('toggle-unattended');
const elUnattendedInputs = document.getElementById('unattended-inputs');
const elUnattendedPassInput = document.getElementById('unattended-pass-input');
const elBtnToggleUnattendedPass = document.getElementById('btn-toggle-unattended-pass');
const elBtnSaveUnattended = document.getElementById('btn-save-unattended');

// Devices View Elements
const elDevicesAuthCta = document.getElementById('devices-auth-cta');
const elBtnCtaLogin = document.getElementById('btn-cta-login');
const elDevicesContainer = document.getElementById('devices-container');
const elDevicesList = document.getElementById('devices-list');
const elDevicesCountLabel = document.getElementById('devices-count-label');
const elBtnRefreshDevices = document.getElementById('btn-refresh-devices');
const elBtnClaimCurrentDevice = document.getElementById('btn-claim-current-device');
const elBtnOpenAddDevice = document.getElementById('btn-open-add-device');

// Auth Modal & User Popover Elements
const elAuthModal = document.getElementById('auth-modal');
const elBtnCloseAuth = document.getElementById('btn-close-auth');
const elTabAuthLogin = document.getElementById('tab-auth-login');
const elTabAuthRegister = document.getElementById('tab-auth-register');
const elAuthAlert = document.getElementById('auth-alert');
const elFormLogin = document.getElementById('form-login');
const elLoginEmail = document.getElementById('login-email');
const elLoginPassword = document.getElementById('login-password');
const elFormRegister = document.getElementById('form-register');
const elRegName = document.getElementById('reg-name');
const elRegEmail = document.getElementById('reg-email');
const elRegPassword = document.getElementById('reg-password');
const elUserPopover = document.getElementById('user-popover');
const elUserDisplayName = document.getElementById('user-display-name');
const elUserDisplayEmail = document.getElementById('user-display-email');
const elPopoverBtnDevices = document.getElementById('popover-btn-devices');
const elPopoverBtnLogout = document.getElementById('popover-btn-logout');

// Add Device Modal Elements
const elAddDeviceModal = document.getElementById('add-device-modal');
const elBtnCloseAddDevice = document.getElementById('btn-close-add-device');
const elBtnCancelAddDevice = document.getElementById('btn-cancel-add-device');
const elFormAddDevice = document.getElementById('form-add-device');
const elAddDeviceId = document.getElementById('add-device-id');
const elAddDeviceAlias = document.getElementById('add-device-alias');
const elAddDevicePlatform = document.getElementById('add-device-platform');
const elAddDevicePermPass = document.getElementById('add-device-perm-pass');

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

const elIncomingModal = document.getElementById('incoming-modal');
const elIncomingDesc = document.getElementById('incoming-caller-desc');
const elBtnAcceptIncoming = document.getElementById('btn-accept-incoming');
const elBtnRejectIncoming = document.getElementById('btn-reject-incoming');
const elStreamPlaceholder = document.getElementById('stream-placeholder');

const elHostSessionBanner = document.getElementById('host-session-banner');
const elHostSessionText = document.getElementById('host-session-text');
const elBtnHostDisconnect = document.getElementById('btn-host-disconnect');
const elBtnHostToggleDrawer = document.getElementById('btn-host-toggle-drawer');
const elBtnHostSwitchScreen = document.getElementById('btn-host-switch-screen');
const elHostChatUnreadBadge = document.getElementById('host-chat-unread-badge');

const elSessionDrawer = document.getElementById('session-drawer');
const elBtnCloseDrawer = document.getElementById('btn-close-drawer');
const elTabBtnChat = document.getElementById('tab-btn-chat');
const elTabBtnFiles = document.getElementById('tab-btn-files');
const elTabBtnClipboard = document.getElementById('tab-btn-clipboard');
const elTabContentChat = document.getElementById('tab-content-chat');
const elTabContentFiles = document.getElementById('tab-content-files');
const elTabContentClipboard = document.getElementById('tab-content-clipboard');
const elChatMessages = document.getElementById('chat-messages');
const elChatInputForm = document.getElementById('chat-input-form');
const elChatInput = document.getElementById('chat-input');
const elChatUnreadBadge = document.getElementById('chat-unread-badge');
const elBtnToggleChat = document.getElementById('btn-toggle-chat');
const elBtnToggleFiles = document.getElementById('btn-toggle-files');
const elBtnToggleClipboard = document.getElementById('btn-toggle-clipboard');
const elFileDropzone = document.getElementById('file-dropzone');
const elFileInputElem = document.getElementById('file-input-elem');
const elBtnBrowseFile = document.getElementById('btn-browse-file');
const elFilesList = document.getElementById('files-list');
const elFilesEmptyNotice = document.getElementById('files-empty-notice');
const elClipboardPreview = document.getElementById('clipboard-preview');
const elBtnCopyReceivedClip = document.getElementById('btn-copy-received-clip');
const elBtnSendMyClipboard = document.getElementById('btn-send-my-clipboard');
const elToastContainer = document.getElementById('toast-container');

async function invokeTauri(cmd, args = {}) {
  if (isTauri && window.__TAURI__.core) {
    return await window.__TAURI__.core.invoke(cmd, args);
  }
  return null;
}

// Toast Notifications System
function showToast(message, type = 'info', duration = 3500) {
  if (!elToastContainer) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  elToastContainer.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-20px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Synthetic Notification Audio Chime (Web Audio API)
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
  } catch (e) {}
}

// Drawer Controls
function openDrawer(tabName = 'chat') {
  if (!elSessionDrawer) return;
  elSessionDrawer.classList.add('active');
  state.isDrawerOpen = true;
  switchDrawerTab(tabName);
}

function closeDrawer() {
  if (!elSessionDrawer) return;
  elSessionDrawer.classList.remove('active');
  state.isDrawerOpen = false;
}

function switchDrawerTab(tabName) {
  state.activeDrawerTab = tabName;
  [elTabBtnChat, elTabBtnFiles, elTabBtnClipboard].forEach((btn) => {
    if (btn) btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  if (elTabContentChat) elTabContentChat.classList.toggle('active', tabName === 'chat');
  if (elTabContentFiles) elTabContentFiles.classList.toggle('active', tabName === 'files');
  if (elTabContentClipboard) elTabContentClipboard.classList.toggle('active', tabName === 'clipboard');
  if (tabName === 'chat') {
    state.unreadChat = 0;
    updateUnreadBadges();
    if (elChatInput) elChatInput.focus();
  }
}

function updateUnreadBadges() {
  const display = state.unreadChat > 0 ? 'inline-flex' : 'none';
  const text = state.unreadChat > 9 ? '9+' : String(state.unreadChat);
  if (elChatUnreadBadge) {
    elChatUnreadBadge.style.display = display;
    elChatUnreadBadge.textContent = text;
  }
  if (elHostChatUnreadBadge) {
    elHostChatUnreadBadge.style.display = display;
    elHostChatUnreadBadge.textContent = text;
  }
}

// Chat Messages Rendering
function appendChatMessage({ text, timestamp, isMe, senderId }) {
  if (!elChatMessages) return;
  const empty = elChatMessages.querySelector('.chat-empty-state');
  if (empty) empty.remove();

  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${isMe ? 'mine' : 'partner'}`;

  const textEl = document.createElement('div');
  textEl.textContent = text;
  bubble.appendChild(textEl);

  const metaEl = document.createElement('div');
  metaEl.className = 'chat-meta';
  const timeStr = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  metaEl.textContent = isMe ? timeStr : `${senderId ? senderId.slice(0, 7) + '.. ' : ''}${timeStr}`;
  bubble.appendChild(metaEl);

  elChatMessages.appendChild(bubble);
  elChatMessages.scrollTop = elChatMessages.scrollHeight;
}

// File Transfer Cards Handling
function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function createFileCard({ fileId, name, size, direction }) {
  if (elFilesEmptyNotice) elFilesEmptyNotice.style.display = 'none';
  const card = document.createElement('div');
  card.className = 'file-card';
  card.id = `file-card-${fileId}`;

  card.innerHTML = `
    <div class="file-card-header">
      <span class="file-name" title="${name}">${name}</span>
      <span class="file-size">${formatBytes(size)}</span>
    </div>
    <div class="file-progress-bar-wrap">
      <div class="file-progress-bar" id="prog-${fileId}"></div>
    </div>
    <div class="file-card-footer">
      <span id="status-${fileId}">${direction === 'upload' ? 'Sender...' : 'Mottar...'} 0%</span>
      <span id="action-${fileId}"></span>
    </div>
  `;

  if (elFilesList) elFilesList.prepend(card);
  return card;
}

function updateFileProgress({ fileId, progress, offset, total }) {
  const bar = document.getElementById(`prog-${fileId}`);
  const status = document.getElementById(`status-${fileId}`);
  if (bar) bar.style.width = `${progress}%`;
  if (status) status.textContent = `${progress}% (${formatBytes(offset || 0)} / ${formatBytes(total)})`;
}

function completeFileTransfer({ fileId, name, size, downloadUrl, direction }) {
  const bar = document.getElementById(`prog-${fileId}`);
  const status = document.getElementById(`status-${fileId}`);
  const action = document.getElementById(`action-${fileId}`);
  if (bar) bar.style.width = '100%';
  if (status) {
    status.textContent = direction === 'upload' ? 'Fullført' : 'Mottatt';
    status.style.color = 'var(--accent-success)';
  }
  if (action && downloadUrl) {
    action.innerHTML = `
      <a href="${downloadUrl}" download="${name}" class="btn-download-file">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Last ned
      </a>
    `;
  }
}

async function handleFilesSelected(files) {
  if (!files || files.length === 0) return;
  for (const file of files) {
    const fileId = Math.random().toString(36).substring(2, 9);
    createFileCard({ fileId, name: file.name, size: file.size, direction: 'upload' });
    try {
      showToast(`Starter sending: ${file.name}`, 'info');
      await rtc.sendFile(file, ({ offset, total, progress }) => {
        updateFileProgress({ fileId, progress, offset, total });
      });
      completeFileTransfer({ fileId, name: file.name, size: file.size, direction: 'upload' });
      showToast(`Fil sendt: ${file.name}`, 'success');
      playNotificationSound();
    } catch (err) {
      alert('Feil ved filoverføring: ' + err.message);
    }
  }
}

// Initialize WebRTC Manager
const rtc = new WebRtcManager({
  signalingUrl: state.signalingUrl,
  clientId: state.localId,
  password: state.localPasscode,
  allowUnattended: state.allowUnattended,
  permanentPassword: state.permanentPassword,
  deviceName: isTauri ? 'PenDesk Mac Desktop' : 'PenDesk Web Klient',

  onStatusChange: (status, message) => {
    if (elStatusPill) elStatusPill.className = 'status-pill ' + (status === 'ready' ? '' : status);
    if (elStatusText) elStatusText.textContent = message;
    if (elVpsLabel) {
      const host = (state.signalingUrl || '').replace(/^wss?:\/\//, '').replace(/\/.*$/, '');
      elVpsLabel.textContent = `Sikker tilkobling: ${host} (TLS 1.3 / DTLS-SRTP)`;
    }
  },

  onRegistered: (assignedId) => {
    state.localId = assignedId;
    storage.setItem('pendesk_device_id', assignedId);
    if (elLocalId) elLocalId.textContent = assignedId;
  },

  onIncomingCall: async ({ fromId, deviceName, unattended, accept, reject }) => {
    // If incoming connection is authenticated via unattended permanent password:
    if (unattended && state.allowUnattended) {
      console.log('[PenDesk] Auto-accepting unattended remote session from:', fromId);
      let localStream = null;
      try {
        localStream = await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 60, max: 60 },
            cursor: 'always'
          },
          audio: false
        });

        if (localStream) {
          localStream.getVideoTracks().forEach((track) => {
            track.onended = () => {
              console.log('[PenDesk] Host stopped screen sharing via native browser bar');
              rtc.disconnectSession('Skjermdeling ble stoppet av verten.');
            };
          });
        }
      } catch (err) {
        console.warn('Kunne ikke hente skjermopptak for uovervåket økt:', err);
      }

      await accept(localStream);

      if (elHostSessionBanner) {
        if (elHostSessionText) elHostSessionText.textContent = `Du fjernstyres nå uovervåket av ${fromId}.`;
        elHostSessionBanner.style.display = 'flex';
      }
      showToast(`Uovervåket økt godkjent fra ${fromId}`, 'info');
      return;
    }

    if (elIncomingModal && elBtnAcceptIncoming && elBtnRejectIncoming) {
      if (elIncomingDesc) {
        elIncomingDesc.textContent = `Operatør ${fromId} (${deviceName}) ber om å koble til og se skjermen din.`;
      }
      elIncomingModal.classList.add('active');

      const handleAccept = async () => {
        elIncomingModal.classList.remove('active');
        cleanupModal();
        let localStream = null;
        try {
          localStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              frameRate: { ideal: 60, max: 60 },
              cursor: 'always'
            },
            audio: false
          });

          if (localStream) {
            localStream.getVideoTracks().forEach((track) => {
              track.onended = () => {
                console.log('[PenDesk] Host stopped screen sharing via native browser bar');
                rtc.disconnectSession('Skjermdeling ble stoppet av verten.');
              };
            });
          }
        } catch (err) {
          console.warn('Kunne ikke hente skjermopptak:', err);
          alert('Kunne ikke hente skjermopptak: ' + err.message);
        }

        await accept(localStream);

        if (elHostSessionBanner) {
          if (elHostSessionText) elHostSessionText.textContent = `Du fjernstyres nå av ${fromId}.`;
          elHostSessionBanner.style.display = 'flex';
        }
      };

      const handleReject = () => {
        elIncomingModal.classList.remove('active');
        cleanupModal();
        reject('Brukeren avslo tilkoblingsforespørselen');
      };

      const cleanupModal = () => {
        elBtnAcceptIncoming.removeEventListener('click', handleAccept);
        elBtnRejectIncoming.removeEventListener('click', handleReject);
      };

      elBtnAcceptIncoming.addEventListener('click', handleAccept);
      elBtnRejectIncoming.addEventListener('click', handleReject);
    } else {
      const ok = confirm(`Innkommende forespørsel fra ${fromId}. Dele skjerm?`);
      if (ok) {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        await accept(stream);
      } else {
        reject('Avslått');
      }
    }
  },

  onRemoteTrack: (stream) => {
    if (elStreamPlaceholder) elStreamPlaceholder.style.display = 'none';
    if (elRemoteVideo) {
      elRemoteVideo.style.display = 'block';
      elRemoteVideo.srcObject = stream;
      elRemoteVideo.play().catch((e) => console.warn('Autoplay info:', e));
    }
    if (elSessionOverlay) elSessionOverlay.classList.add('active');
    state.inSession = true;

    if (elBtnConnectText) elBtnConnectText.textContent = 'Avslutt økt / Koble fra';
    if (elBtnConnect) elBtnConnect.classList.add('btn-disconnect-active');
  },

  onDataMessage: async (rawData) => {
    try {
      const event = JSON.parse(rawData);
      if (isTauri) {
        await invokeTauri('inject_input', { event });
      }
    } catch (err) {
      console.error('Input injection error:', err);
    }
  },

  onTelemetryUpdate: ({ rtt, fps, transport }) => {
    if (rtt !== null && elStatLatency) elStatLatency.textContent = `${rtt} ms`;
    if (elStatFps) elStatFps.textContent = `${fps} FPS`;
  },

  onChatMessage: (msg) => {
    appendChatMessage(msg);
    playNotificationSound();
    if (!state.isDrawerOpen || state.activeDrawerTab !== 'chat') {
      state.unreadChat++;
      updateUnreadBadges();
      showToast(`Ny melding fra partner: ${msg.text.slice(0, 32)}...`, 'info');
    }
  },

  onClipboardReceived: (text) => {
    if (elClipboardPreview) elClipboardPreview.value = text;
    showToast('Utklippstavle mottatt fra partner', 'success');
    playNotificationSound();
    try {
      navigator.clipboard.writeText(text).catch(() => {});
    } catch {}
  },

  onFileTransferStart: (fileInfo) => {
    createFileCard(fileInfo);
    showToast(`Mottar fil: ${fileInfo.name}`, 'info');
    openDrawer('files');
  },

  onFileTransferProgress: (progressInfo) => {
    updateFileProgress({
      fileId: progressInfo.fileId,
      progress: progressInfo.progress,
      offset: progressInfo.receivedBytes,
      total: progressInfo.totalBytes
    });
  },

  onFileTransferComplete: (completedFile) => {
    completeFileTransfer(completedFile);
    playNotificationSound();
    showToast(`Fil mottatt: ${completedFile.name}`, 'success');
  },

  onSessionEnded: (reason) => {
    if (elSessionOverlay) elSessionOverlay.classList.remove('active');
    if (elHostSessionBanner) elHostSessionBanner.style.display = 'none';
    if (elStreamPlaceholder) elStreamPlaceholder.style.display = 'flex';
    if (elRemoteVideo) {
      elRemoteVideo.style.display = 'none';
      elRemoteVideo.srcObject = null;
    }
    state.inSession = false;
    closeDrawer();

    // Reset connect button in Card 2
    if (elBtnConnectText) elBtnConnectText.textContent = 'Koble til enhet';
    if (elBtnConnect) {
      elBtnConnect.classList.remove('btn-disconnect-active');
      elBtnConnect.style.opacity = '1';
    }

    // Reset status pill to ready
    if (elStatusPill) elStatusPill.className = 'status-pill';
    if (elStatusText) elStatusText.textContent = 'Sikker tilkobling (DTLS-SRTP AES-256)';

    // Refresh one-time passcode for security
    state.localPasscode = generateRandomPasscode();
    if (elLocalPass) elLocalPass.textContent = state.localPasscode;
    rtc.updateCredentials(state.localPasscode, {
      allowUnattended: state.allowUnattended,
      permanentPassword: state.permanentPassword
    });

    console.log('[PenDesk] Økt avsluttet:', reason);
  }
});

// Setup UI Event Handlers
function setupEventListeners() {
  if (elLocalId) elLocalId.textContent = state.localId || '--- --- ---';
  if (elLocalPass) elLocalPass.textContent = state.localPasscode;
  if (elSettingVpsDomain) elSettingVpsDomain.value = state.signalingUrl;

  const btnCopyId = document.getElementById('btn-copy-id');
  if (btnCopyId) {
    btnCopyId.addEventListener('click', () => {
      navigator.clipboard.writeText(state.localId.replace(/\s/g, ''));
      flashButton(btnCopyId);
    });
  }

  const btnCopyPass = document.getElementById('btn-copy-pass');
  if (btnCopyPass) {
    btnCopyPass.addEventListener('click', () => {
      navigator.clipboard.writeText(state.localPasscode);
      flashButton(btnCopyPass);
    });
  }

  const btnRefreshPass = document.getElementById('btn-refresh-pass');
  if (btnRefreshPass) {
    btnRefreshPass.addEventListener('click', () => {
      state.localPasscode = generateRandomPasscode();
      if (elLocalPass) elLocalPass.textContent = state.localPasscode;
      rtc.updateCredentials(state.localPasscode);
      flashButton(btnRefreshPass);
    });
  }

  if (elRemoteIdInput) {
    elRemoteIdInput.addEventListener('input', (e) => {
      e.target.value = formatPartnerId(e.target.value);
    });
  }

  if (elBtnConnect) {
    elBtnConnect.addEventListener('click', async (e) => {
      e.preventDefault();

      // If already in an active session, clicking this button disconnects cleanly
      if (state.inSession) {
        rtc.disconnectSession('Du avsluttet økten.');
        return;
      }

      const targetId = elRemoteIdInput.value.trim();
      const pass = elRemotePassInput.value.trim();

      if (targetId.length < 9) {
        alert('Vennligst oppgi en gyldig 9-sifret partner-ID');
        return;
      }

      elBtnConnectText.textContent = 'Kobler til...';
      elBtnConnect.style.opacity = '0.7';

      try {
        if (elSessionOverlay) {
          if (elStreamPlaceholder) elStreamPlaceholder.style.display = 'flex';
          if (elRemoteVideo) elRemoteVideo.style.display = 'none';
          elSessionOverlay.classList.add('active');
        }
        await rtc.dial(targetId, pass);
        saveRecentConnection(targetId);
      } catch (err) {
        if (elSessionOverlay) elSessionOverlay.classList.remove('active');
        alert('Kunne ikke opprette tilkobling: ' + err.message);
        elBtnConnectText.textContent = 'Koble til enhet';
        elBtnConnect.style.opacity = '1';
      }
    });
  }

  // Operator Disconnect button in fullscreen overlay toolbar
  if (elBtnDisconnect) {
    elBtnDisconnect.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[PenDesk] Operator disconnect clicked');
      rtc.disconnectSession('Du koblet fra økten.');
    });
  }

  // Host Disconnect button in host session banner
  if (elBtnHostDisconnect) {
    elBtnHostDisconnect.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[PenDesk] Host disconnect clicked');
      rtc.disconnectSession('Verten avsluttet fjernstyringen.');
    });
  }

  // Host Dynamic Display Switcher
  if (elBtnHostSwitchScreen) {
    elBtnHostSwitchScreen.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        const newStream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 60, max: 60 }, cursor: 'always' },
          audio: false
        });
        await rtc.replaceMediaStream(newStream);
        showToast('Skjermkilde ble oppdatert!', 'success');
        playNotificationSound();
      } catch (err) {
        if (err.name !== 'NotAllowedError') {
          alert('Kunne ikke bytte skjerm: ' + err.message);
        }
      }
    });
  }

  // Drawer Toggles & Navigation
  if (elBtnCloseDrawer) {
    elBtnCloseDrawer.addEventListener('click', (e) => {
      e.preventDefault();
      closeDrawer();
    });
  }

  if (elBtnToggleChat) {
    elBtnToggleChat.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state.isDrawerOpen && state.activeDrawerTab === 'chat') {
        closeDrawer();
      } else {
        openDrawer('chat');
      }
    });
  }

  if (elBtnToggleFiles) {
    elBtnToggleFiles.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state.isDrawerOpen && state.activeDrawerTab === 'files') {
        closeDrawer();
      } else {
        openDrawer('files');
      }
    });
  }

  if (elBtnToggleClipboard) {
    elBtnToggleClipboard.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (state.isDrawerOpen && state.activeDrawerTab === 'clipboard') {
        closeDrawer();
      } else {
        openDrawer('clipboard');
      }
    });
  }

  if (elBtnHostToggleDrawer) {
    elBtnHostToggleDrawer.addEventListener('click', (e) => {
      e.preventDefault();
      if (state.isDrawerOpen) {
        closeDrawer();
      } else {
        openDrawer('chat');
      }
    });
  }

  if (elTabBtnChat) {
    elTabBtnChat.addEventListener('click', () => switchDrawerTab('chat'));
  }
  if (elTabBtnFiles) {
    elTabBtnFiles.addEventListener('click', () => switchDrawerTab('files'));
  }
  if (elTabBtnClipboard) {
    elTabBtnClipboard.addEventListener('click', () => switchDrawerTab('clipboard'));
  }

  // Chat Form Submission
  if (elChatInputForm) {
    elChatInputForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = (elChatInput ? elChatInput.value : '').trim();
      if (!text) return;
      try {
        const payload = rtc.sendChatMessage(text);
        appendChatMessage({ ...payload, isMe: true });
        if (elChatInput) elChatInput.value = '';
      } catch (err) {
        alert(err.message);
      }
    });
  }

  // File Transfer Handlers
  if (elBtnBrowseFile && elFileInputElem) {
    elBtnBrowseFile.addEventListener('click', (e) => {
      e.preventDefault();
      elFileInputElem.click();
    });
  }

  if (elFileInputElem) {
    elFileInputElem.addEventListener('change', (e) => {
      handleFilesSelected(e.target.files);
      e.target.value = '';
    });
  }

  if (elFileDropzone) {
    elFileDropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      elFileDropzone.classList.add('dragover');
    });
    elFileDropzone.addEventListener('dragleave', () => {
      elFileDropzone.classList.remove('dragover');
    });
    elFileDropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      elFileDropzone.classList.remove('dragover');
      if (e.dataTransfer && e.dataTransfer.files) {
        handleFilesSelected(e.dataTransfer.files);
      }
    });
  }

  // Clipboard Sync Handlers
  if (elBtnSendMyClipboard) {
    elBtnSendMyClipboard.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text) {
          alert('Utklippstavlen din er tom.');
          return;
        }
        rtc.sendClipboard(text);
        if (elClipboardPreview) elClipboardPreview.value = text;
        showToast('Utklippstavle sendt til partner!', 'success');
        playNotificationSound();
      } catch (err) {
        alert('Nettleseren blokkerte tilgang til utklippstavlen. Vennligst lim inn manuelt.');
      }
    });
  }

  if (elBtnCopyReceivedClip && elClipboardPreview) {
    elBtnCopyReceivedClip.addEventListener('click', () => {
      const text = elClipboardPreview.value;
      if (text) {
        navigator.clipboard.writeText(text);
        showToast('Kopiert til din utklippstavle!', 'success');
        playNotificationSound();
      }
    });
  }

  if (elBtnFullscreen) {
    elBtnFullscreen.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        elSessionOverlay.requestFullscreen().catch(() => {});
      } else {
        document.exitFullscreen().catch(() => {});
      }
    });
  }

  if (elBtnOpenSettings) {
    elBtnOpenSettings.addEventListener('click', () => {
      elSettingsModal.classList.add('active');
    });
  }

  if (elBtnCloseSettings) {
    elBtnCloseSettings.addEventListener('click', () => {
      elSettingsModal.classList.remove('active');
    });
  }

  if (elBtnSaveSettings) {
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
  }

  if (isTauri) {
    invokeTauri('check_permissions').then((perms) => {
      if (perms && (!perms.screen_recording || !perms.accessibility)) {
        if (elPermissionBanner) elPermissionBanner.style.display = 'flex';
      }
    });

    if (elBtnRequestPerms) {
      elBtnRequestPerms.addEventListener('click', () => {
        invokeTauri('open_permission_settings');
      });
    }
  }

  setupInputForwarding();
  renderRecentConnections();
  setupAuthAndDeviceListeners();
}

function setupAuthAndDeviceListeners() {
  // Initialize Unattended Access UI from state
  if (elToggleUnattended) {
    elToggleUnattended.checked = state.allowUnattended;
    if (elUnattendedInputs) {
      elUnattendedInputs.style.display = state.allowUnattended ? 'flex' : 'none';
    }
  }
  if (elUnattendedPassInput) {
    elUnattendedPassInput.value = state.permanentPassword;
  }

  // Toggle Unattended Access
  if (elToggleUnattended) {
    elToggleUnattended.addEventListener('change', (e) => {
      state.allowUnattended = e.target.checked;
      localStorage.setItem('pendesk_unattended_enabled', String(state.allowUnattended));
      if (elUnattendedInputs) {
        elUnattendedInputs.style.display = state.allowUnattended ? 'flex' : 'none';
      }
      rtc.updateCredentials(state.localPasscode, {
        allowUnattended: state.allowUnattended,
        permanentPassword: state.permanentPassword
      });
      if (state.allowUnattended) {
        showToast('Uovervåket tilgang aktivert for denne maskinen', 'info');
      } else {
        showToast('Uovervåket tilgang deaktivert', 'info');
      }
    });
  }

  // Save Permanent Password button
  if (elBtnSaveUnattended && elUnattendedPassInput) {
    elBtnSaveUnattended.addEventListener('click', (e) => {
      e.preventDefault();
      const pass = elUnattendedPassInput.value.trim();
      state.permanentPassword = pass;
      localStorage.setItem('pendesk_permanent_password', pass);
      rtc.updateCredentials(state.localPasscode, {
        allowUnattended: state.allowUnattended,
        permanentPassword: state.permanentPassword
      });
      showToast('Permanent passord er lagret og oppdatert!', 'success');
      playNotificationSound();
    });
  }

  // Toggle Permanent Password visibility
  if (elBtnToggleUnattendedPass && elUnattendedPassInput) {
    elBtnToggleUnattendedPass.addEventListener('click', (e) => {
      e.preventDefault();
      const isPass = elUnattendedPassInput.type === 'password';
      elUnattendedPassInput.type = isPass ? 'text' : 'password';
    });
  }

  // Navigation switching
  if (elNavRemote) {
    elNavRemote.addEventListener('click', () => switchView('desk'));
  }
  if (elNavDevices) {
    elNavDevices.addEventListener('click', () => switchView('devices'));
  }
  const elNavHistory = document.getElementById('nav-history');
  if (elNavHistory) {
    elNavHistory.addEventListener('click', () => {
      switchView('desk');
      const recentSection = document.querySelector('.recent-sessions');
      if (recentSection) {
        recentSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    });
  }
  const btnLogo = document.getElementById('btn-logo');
  if (btnLogo) {
    btnLogo.addEventListener('click', () => switchView('desk'));
  }

  // Top Bar Profile / Auth Button
  if (elBtnAuthUser) {
    elBtnAuthUser.addEventListener('click', (e) => {
      e.stopPropagation();
      if (state.currentUser) {
        if (elUserPopover) {
          const isVis = elUserPopover.style.display === 'flex';
          elUserPopover.style.display = isVis ? 'none' : 'flex';
        }
      } else {
        openAuthModal('login');
      }
    });
  }

  // Click outside to close user popover
  document.addEventListener('click', (e) => {
    if (elUserPopover && elUserPopover.style.display === 'flex') {
      if (!elUserPopover.contains(e.target) && e.target !== elBtnAuthUser) {
        elUserPopover.style.display = 'none';
      }
    }
  });

  // User popover items
  if (elPopoverBtnDevices) {
    elPopoverBtnDevices.addEventListener('click', () => {
      if (elUserPopover) elUserPopover.style.display = 'none';
      switchView('devices');
    });
  }
  if (elPopoverBtnLogout) {
    elPopoverBtnLogout.addEventListener('click', () => {
      handleLogout();
    });
  }

  // Devices View Actions
  if (elBtnCtaLogin) {
    elBtnCtaLogin.addEventListener('click', () => {
      openAuthModal('login');
    });
  }
  if (elBtnClaimCurrentDevice) {
    elBtnClaimCurrentDevice.addEventListener('click', () => {
      claimCurrentDevice();
    });
  }
  if (elBtnRefreshDevices) {
    elBtnRefreshDevices.addEventListener('click', () => {
      flashButton(elBtnRefreshDevices);
      loadDevices();
      showToast('Enhetsliste oppdatert', 'info');
    });
  }

  // Auth Modal tabs & close
  if (elBtnCloseAuth) {
    elBtnCloseAuth.addEventListener('click', closeAuthModal);
  }
  if (elAuthModal) {
    elAuthModal.addEventListener('click', (e) => {
      if (e.target === elAuthModal) closeAuthModal();
    });
  }
  if (elTabAuthLogin) {
    elTabAuthLogin.addEventListener('click', () => switchAuthTab('login'));
  }
  if (elTabAuthRegister) {
    elTabAuthRegister.addEventListener('click', () => switchAuthTab('register'));
  }

  // Login form submit
  if (elFormLogin) {
    elFormLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      setAuthAlert(null);
      const email = elLoginEmail ? elLoginEmail.value.trim() : '';
      const password = elLoginPassword ? elLoginPassword.value : '';
      const btn = document.getElementById('btn-submit-login');
      if (btn) { btn.textContent = 'Logger inn...'; btn.disabled = true; }
      try {
        await handleLogin(email, password);
      } catch (err) {
        setAuthAlert(err.message);
      } finally {
        if (btn) { btn.textContent = 'Logg inn'; btn.disabled = false; }
      }
    });
  }

  // Register form submit
  if (elFormRegister) {
    elFormRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      setAuthAlert(null);
      const name = elRegName ? elRegName.value.trim() : '';
      const email = elRegEmail ? elRegEmail.value.trim() : '';
      const password = elRegPassword ? elRegPassword.value : '';
      const btn = document.getElementById('btn-submit-register');
      if (btn) { btn.textContent = 'Oppretter konto...'; btn.disabled = true; }
      try {
        await handleRegister(name, email, password);
      } catch (err) {
        setAuthAlert(err.message);
      } finally {
        if (btn) { btn.textContent = 'Opprett gratis konto'; btn.disabled = false; }
      }
    });
  }

  // Add Device Modal
  if (elBtnOpenAddDevice) {
    elBtnOpenAddDevice.addEventListener('click', () => {
      if (!state.currentUser) {
        openAuthModal('login');
        return;
      }
      if (elAddDeviceModal) elAddDeviceModal.classList.add('active');
      if (elAddDeviceId) elAddDeviceId.focus();
    });
  }
  if (elBtnCloseAddDevice) {
    elBtnCloseAddDevice.addEventListener('click', closeAddDeviceModal);
  }
  if (elBtnCancelAddDevice) {
    elBtnCancelAddDevice.addEventListener('click', closeAddDeviceModal);
  }
  if (elAddDeviceModal) {
    elAddDeviceModal.addEventListener('click', (e) => {
      if (e.target === elAddDeviceModal) closeAddDeviceModal();
    });
  }
  if (elAddDeviceId) {
    elAddDeviceId.addEventListener('input', (e) => {
      e.target.value = formatPartnerId(e.target.value);
    });
  }
  if (elFormAddDevice) {
    elFormAddDevice.addEventListener('submit', async (e) => {
      e.preventDefault();
      const deviceId = elAddDeviceId ? elAddDeviceId.value.trim() : '';
      const alias = elAddDeviceAlias ? elAddDeviceAlias.value.trim() : '';
      const platform = elAddDevicePlatform ? elAddDevicePlatform.value : 'generic';
      const permanentPassword = elAddDevicePermPass ? elAddDevicePermPass.value.trim() : '';

      if (deviceId.length < 9) {
        alert('Oppgi en gyldig 9-sifret Penrose-ID');
        return;
      }

      try {
        await apiRequest('/api/devices', 'POST', {
          deviceId,
          alias,
          platform,
          permanentPassword
        });
        showToast(`Enheten "${alias}" ble lagret!`, 'success');
        closeAddDeviceModal();
        await loadDevices();
        switchView('devices');
      } catch (err) {
        alert('Kunne ikke lagre enhet: ' + err.message);
      }
    });
  }
}

function switchView(viewName) {
  state.activeView = viewName;
  if (elViewDesk) elViewDesk.style.display = viewName === 'desk' ? 'flex' : 'none';
  if (elViewDevices) elViewDevices.style.display = viewName === 'devices' ? 'flex' : 'none';

  if (elNavRemote) elNavRemote.classList.toggle('active', viewName === 'desk');
  if (elNavDevices) elNavDevices.classList.toggle('active', viewName === 'devices');

  if (elViewTitle) {
    elViewTitle.textContent = 'Penrose Fjernhjelp';
  }

  if (viewName === 'devices') {
    if (state.currentUser) {
      loadDevices();
    }
  }
}

function openAuthModal(tab = 'login') {
  if (!elAuthModal) return;
  setAuthAlert(null);
  switchAuthTab(tab);
  elAuthModal.classList.add('active');
  if (tab === 'login' && elLoginEmail) elLoginEmail.focus();
  if (tab === 'register' && elRegName) elRegName.focus();
}

function closeAuthModal() {
  if (elAuthModal) elAuthModal.classList.remove('active');
  setAuthAlert(null);
  if (elFormLogin) elFormLogin.reset();
  if (elFormRegister) elFormRegister.reset();
}

function switchAuthTab(tab = 'login') {
  if (elTabAuthLogin) elTabAuthLogin.classList.toggle('active', tab === 'login');
  if (elTabAuthRegister) elTabAuthRegister.classList.toggle('active', tab === 'register');
  if (elFormLogin) elFormLogin.style.display = tab === 'login' ? 'flex' : 'none';
  if (elFormRegister) elFormRegister.style.display = tab === 'register' ? 'flex' : 'none';
  setAuthAlert(null);
}

function setAuthAlert(msg) {
  if (!elAuthAlert) return;
  if (msg) {
    elAuthAlert.textContent = msg;
    elAuthAlert.style.display = 'block';
  } else {
    elAuthAlert.textContent = '';
    elAuthAlert.style.display = 'none';
  }
}

function closeAddDeviceModal() {
  if (elAddDeviceModal) elAddDeviceModal.classList.remove('active');
  if (elFormAddDevice) elFormAddDevice.reset();
}

// HTTP API Client
async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.authToken) {
    headers['Authorization'] = `Bearer ${state.authToken}`;
  }
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(endpoint, opts);
  const data = await res.json().catch(() => ({ error: 'Ugyldig svar fra server' }));
  if (!res.ok) {
    throw new Error(data.error || 'Serverfeil');
  }
  return data;
}

async function loadCurrentUser() {
  if (!state.authToken) {
    state.currentUser = null;
    updateUserAuthUI();
    return;
  }
  try {
    const data = await apiRequest('/api/auth/me');
    state.currentUser = data.user;
    updateUserAuthUI();
    loadDevices();
  } catch (err) {
    console.warn('[PenDesk] Token invalid or expired, resetting auth:', err);
    state.authToken = '';
    localStorage.removeItem('pendesk_auth_token');
    state.currentUser = null;
    updateUserAuthUI();
  }
}

function updateUserAuthUI() {
  if (state.currentUser) {
    if (elAuthUserLabel) elAuthUserLabel.textContent = state.currentUser.name;
    if (elBtnAuthUser) elBtnAuthUser.classList.add('logged-in');
    if (elUserDisplayName) elUserDisplayName.textContent = state.currentUser.name;
    if (elUserDisplayEmail) elUserDisplayEmail.textContent = state.currentUser.email;
    if (elDevicesAuthCta) elDevicesAuthCta.style.display = 'none';
    if (elDevicesContainer) elDevicesContainer.style.display = 'flex';
  } else {
    if (elAuthUserLabel) elAuthUserLabel.textContent = 'Logg inn';
    if (elBtnAuthUser) elBtnAuthUser.classList.remove('logged-in');
    if (elDevicesAuthCta) elDevicesAuthCta.style.display = 'flex';
    if (elDevicesContainer) elDevicesContainer.style.display = 'none';
  }
}

async function handleLogin(email, password) {
  const data = await apiRequest('/api/auth/login', 'POST', { email, password });
  state.authToken = data.token;
  localStorage.setItem('pendesk_auth_token', data.token);
  state.currentUser = data.user;
  updateUserAuthUI();
  await loadDevices();
  showToast(`Logget inn som ${data.user.name}`, 'success');
  closeAuthModal();
}

async function handleRegister(name, email, password) {
  const data = await apiRequest('/api/auth/register', 'POST', { name, email, password });
  state.authToken = data.token;
  localStorage.setItem('pendesk_auth_token', data.token);
  state.currentUser = data.user;
  updateUserAuthUI();
  await loadDevices();
  showToast(`Velkommen! Konto opprettet for ${data.user.name}`, 'success');
  closeAuthModal();
}

function handleLogout() {
  state.authToken = '';
  localStorage.removeItem('pendesk_auth_token');
  state.currentUser = null;
  state.devices = [];
  updateUserAuthUI();
  if (elUserPopover) elUserPopover.style.display = 'none';
  switchView('desk');
  showToast('Du er logget ut', 'info');
}

async function loadDevices() {
  if (!state.authToken) return;
  try {
    const data = await apiRequest('/api/devices');
    state.devices = data.devices || [];
    renderDevicesList();
  } catch (err) {
    console.error('[PenDesk] Failed to load devices:', err);
  }
}

function renderDevicesList() {
  if (!elDevicesList) return;
  elDevicesList.innerHTML = '';
  const onlineCount = state.devices.filter(d => d.isOnline).length;
  if (elDevicesCountLabel) {
    elDevicesCountLabel.textContent = `${state.devices.length} enheter registrert (${onlineCount} online nå)`;
  }

  if (state.devices.length === 0) {
    elDevicesList.innerHTML = `
      <div style="grid-column: 1 / -1; padding: 36px; text-align: center; color: var(--text-muted); background: var(--bg-surface); border: 1px dashed var(--border-subtle); border-radius: var(--radius-md);">
        <p style="font-size: 14px; margin-bottom: 8px;">Ingen enheter lagret i adresseboken din ennå.</p>
        <span style="font-size: 12px;">Legg til maskiner eller servere for å koble til med ett klikk uten engangskode.</span>
      </div>
    `;
    return;
  }

  state.devices.forEach((device) => {
    const card = document.createElement('div');
    card.className = 'device-card';

    const platformIcons = {
      macOS: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20.94c1.5 0 2.75-.75 3.5-.75.75 0 1.94.75 3.5.75 1.5 0 3-1.5 3.8-3.04-1.63-.95-2.02-3.14-1.02-4.63.78-1.15 2.12-1.78 2.22-1.83-1.03-1.5-2.61-1.7-3.16-1.72-1.4-.14-2.73.83-3.44.83-.71 0-1.8-.8-2.95-.78-1.53.02-2.93.89-3.71 2.25-1.59 2.75-.41 6.8 1.13 9.02.76 1.09 1.66 2.3 2.83 2.25z"></path></svg>`,
      Windows: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="8" height="8"></rect><rect x="13" y="3" width="8" height="8"></rect><rect x="3" y="13" width="8" height="8"></rect><rect x="13" y="13" width="8" height="8"></rect></svg>`,
      Linux: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2"></rect><rect x="2" y="14" width="20" height="8" rx="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>`,
      generic: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>`
    };

    const iconSvg = platformIcons[device.platform] || platformIcons.generic;
    const statusHtml = device.isOnline
      ? `<span class="badge-online"><span class="status-dot"></span>Online</span>`
      : `<span class="badge-offline">Offline</span>`;

    const unattendedHtml = device.hasPermanentPassword
      ? `<span style="color: var(--accent-success); font-size: 11px;">&#10003; Fast passord lagret</span>`
      : `<span style="color: var(--text-muted); font-size: 11px;">Mangler fast passord</span>`;

    card.innerHTML = `
      <div class="device-card-header">
        <div class="device-info">
          <div class="platform-icon">${iconSvg}</div>
          <div class="device-title-wrap">
            <h4>${escapeHtml(device.alias)}</h4>
            <div class="device-id-mono">${escapeHtml(device.deviceId)}</div>
          </div>
        </div>
        ${statusHtml}
      </div>

      <div class="device-meta-row">
        <span>${escapeHtml(device.platform || 'Server')}</span>
        ${unattendedHtml}
      </div>

      <div class="device-card-footer">
        <button class="btn-device-connect" id="btn-dial-dev-${device.id}" ${!device.isOnline ? 'title="Enheten er offline nå"' : ''}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M5 12h14"></path>
            <path d="M12 5l7 7-7 7"></path>
          </svg>
          <span>Fjernstyr ${device.hasPermanentPassword ? '(Uovervåket)' : ''}</span>
        </button>
        <button class="btn-device-delete" id="btn-del-dev-${device.id}" title="Fjern enhet">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    const btnDial = card.querySelector(`#btn-dial-dev-${device.id}`);
    if (btnDial) {
      btnDial.addEventListener('click', async () => {
        if (!device.isOnline) {
          if (!confirm('Maskinen er markert som offline på VPS. Vil du likevel prøve å koble til?')) {
            return;
          }
        }
        await autoConnectToDevice(device);
      });
    }

    const btnDel = card.querySelector(`#btn-del-dev-${device.id}`);
    if (btnDel) {
      btnDel.addEventListener('click', async () => {
        if (confirm(`Vil du fjerne "${device.alias}" (${device.deviceId}) fra listen din?`)) {
          try {
            await apiRequest(`/api/devices/${device.id}`, 'DELETE');
            showToast(`"${device.alias}" ble fjernet`, 'info');
            await loadDevices();
          } catch (err) {
            alert('Kunne ikke slette enhet: ' + err.message);
          }
        }
      });
    }

    elDevicesList.appendChild(card);
  });
}

async function autoConnectToDevice(device) {
  if (!device.hasPermanentPassword) {
    switchView('desk');
    if (elRemoteIdInput) elRemoteIdInput.value = device.deviceId;
    if (elRemotePassInput) {
      elRemotePassInput.value = '';
      elRemotePassInput.focus();
    }
    showToast(`Oppgi engangskode for ${device.alias}`, 'info');
    return;
  }

  try {
    if (elSessionOverlay) {
      if (elStreamPlaceholder) elStreamPlaceholder.style.display = 'flex';
      if (elRemoteVideo) elRemoteVideo.style.display = 'none';
      elSessionOverlay.classList.add('active');
    }
    showToast(`Kobler uovervåket til ${device.alias}...`, 'info');
    await rtc.dial(device.deviceId, device.permanentPassword);
    saveRecentConnection(device.deviceId);
  } catch (err) {
    if (elSessionOverlay) elSessionOverlay.classList.remove('active');
    alert(`Tilkobling til ${device.alias} mislyktes: ` + err.message);
  }
}

async function claimCurrentDevice() {
  if (!state.currentUser) {
    openAuthModal('login');
    return;
  }
  const currentId = state.localId;
  if (!currentId) {
    alert('Ingen aktiv Penrose-ID tildelt ennå.');
    return;
  }
  const defaultAlias = `Min ${navigator.platform.includes('Mac') ? 'Mac' : (navigator.platform.includes('Win') ? 'Windows PC' : 'Linux')} (${currentId.slice(0, 3)})`;
  const alias = prompt('Oppgi navn på denne maskinen i din liste:', defaultAlias);
  if (!alias) return;

  const platform = navigator.platform.includes('Mac') ? 'macOS' : (navigator.platform.includes('Win') ? 'Windows' : 'Linux');
  const permanentPassword = state.permanentPassword || '';

  try {
    await apiRequest('/api/devices', 'POST', {
      deviceId: currentId,
      alias,
      platform,
      permanentPassword
    });
    showToast(`Denne maskinen ble lagret som "${alias}"`, 'success');
    await loadDevices();
    switchView('devices');
  } catch (err) {
    alert('Kunne ikke gjøre krav på enheten: ' + err.message);
  }
}

function setupInputForwarding() {
  const container = document.getElementById('stream-container');
  if (!container) return;

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
  btn.style.borderColor = 'var(--accent-blue)';
  setTimeout(() => { btn.style.borderColor = orig; }, 300);
}

function saveRecentConnection(id) {
  if (!state.recentConnections.includes(id)) {
    state.recentConnections.unshift(id);
    if (state.recentConnections.length > 5) state.recentConnections.pop();
    try {
      localStorage.setItem('pendesk_recent', JSON.stringify(state.recentConnections));
    } catch {}
    renderRecentConnections();
  }
}

function renderRecentConnections() {
  if (!elRecentChips) return;
  if (state.recentConnections.length === 0) {
    elRecentChips.innerHTML = '<span style="font-size: 12px; color: var(--text-muted);">Ingen nylige økter ennå. Enheter du har koblet til vises her.</span>';
    if (elRecentCount) elRecentCount.textContent = '0 lagret';
    return;
  }

  if (elRecentCount) elRecentCount.textContent = `${state.recentConnections.length} lagret`;
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
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    loadCurrentUser();
    rtc.connectSignaling();
  });
} else {
  setupEventListeners();
  loadCurrentUser();
  rtc.connectSignaling();
}
