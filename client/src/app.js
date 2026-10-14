import { WebRtcManager } from './webrtc-manager.js?v=2027_v5';

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
  activeDrawerTab: 'chat'
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
  deviceName: isTauri ? 'PenDesk Mac Desktop' : 'PenDesk Web Klient',

  onStatusChange: (status, message) => {
    if (elStatusPill) elStatusPill.className = 'status-pill ' + (status === 'ready' ? '' : status);
    if (elStatusText) elStatusText.textContent = message;
    if (elVpsLabel) elVpsLabel.textContent = `VPS: ${state.signalingUrl}`;
  },

  onRegistered: (assignedId) => {
    state.localId = assignedId;
    storage.setItem('pendesk_device_id', assignedId);
    if (elLocalId) elLocalId.textContent = assignedId;
  },

  onIncomingCall: async ({ fromId, deviceName, accept, reject }) => {
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
    if (elStatusText) elStatusText.textContent = 'Tilkoblet VPS | Klar';

    // Refresh one-time passcode for security
    state.localPasscode = generateRandomPasscode();
    if (elLocalPass) elLocalPass.textContent = state.localPasscode;
    rtc.updateCredentials(state.localPasscode);

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
    rtc.connectSignaling();
  });
} else {
  setupEventListeners();
  rtc.connectSignaling();
}
