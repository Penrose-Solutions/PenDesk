/**
 * PenDesk WebRTC and Signaling Session Manager
 * Orchestrates P2P connection, STUN/TURN traversal, media streaming, and low-latency input sync.
 */

export class WebRtcManager {
  constructor(options = {}) {
    this.signalingUrl = options.signalingUrl || 'wss://hjelp.penrose.no/ws';
    this.clientId = options.clientId || null;
    this.password = options.password || '';
    this.deviceName = options.deviceName || 'PenDesk Client';

    this.ws = null;
    this.peerConnection = null;
    this.controlChannel = null;
    this.reliableChannel = null;
    this.localStream = null;
    this.iceServers = [];
    this.iceCandidateQueue = [];
    this.activePartnerId = null;
    this.isHost = false;
    this._incomingFiles = new Map();

    this.onStatusChange = options.onStatusChange || (() => {});
    this.onRegistered = options.onRegistered || (() => {});
    this.onIncomingCall = options.onIncomingCall || (() => {});
    this.onRemoteTrack = options.onRemoteTrack || (() => {});
    this.onDataMessage = options.onDataMessage || (() => {});
    this.onTelemetryUpdate = options.onTelemetryUpdate || (() => {});
    this.onSessionEnded = options.onSessionEnded || (() => {});
    this.onChatMessage = options.onChatMessage || (() => {});
    this.onClipboardReceived = options.onClipboardReceived || (() => {});
    this.onFileTransferStart = options.onFileTransferStart || (() => {});
    this.onFileTransferProgress = options.onFileTransferProgress || (() => {});
    this.onFileTransferComplete = options.onFileTransferComplete || (() => {});
    this.onReliableStateChange = options.onReliableStateChange || (() => {});

    this.telemetryInterval = null;
  }

  connectSignaling() {
    this.onStatusChange('connecting', 'Connecting to VPS Signaling...');

    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }

    try {
      this.ws = new WebSocket(this.signalingUrl);
    } catch (err) {
      this.onStatusChange('offline', 'Feil ved tilkobling: ' + err.message);
      this._scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      this.onStatusChange('connected', 'Tilkoblet VPS | Tildeler ID...');
      this.ws.send(
        JSON.stringify({
          type: 'register',
          clientId: this.clientId,
          password: this.password,
          deviceName: this.deviceName
        })
      );
      this._startHeartbeat();
    };

    this.ws.onmessage = async (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        await this._handleSignalingMessage(msg);
      } catch (e) {
        console.error('[WebRTC] Message parse error:', e);
      }
    };

    this.ws.onclose = () => {
      this._stopHeartbeat();
      this.onStatusChange('offline', 'Frakoblet fra VPS. Prøver igjen...');
      this._teardownPeer();
      this._scheduleReconnect();
    };

    this.ws.onerror = (err) => {
      console.warn('[WebRTC] Signaling socket error:', err);
    };
  }

  _startHeartbeat() {
    this._stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'heartbeat' }));
      }
    }, 25000);
  }

  _stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  _scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('[WebRTC] Attempting reconnection to:', this.signalingUrl);
      this.connectSignaling();
    }, 3000);
  }

  updateCredentials(password) {
    this.password = password;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'register',
          clientId: this.clientId,
          password: this.password,
          deviceName: this.deviceName
        })
      );
    }
  }

  async _handleSignalingMessage(msg) {
    switch (msg.type) {
      case 'registered': {
        this.clientId = msg.clientId;
        this.iceServers = msg.iceServers || [{ urls: ['stun:stun.l.google.com:19302'] }];
        this.onStatusChange('ready', 'Connected to VPS | Ready');
        this.onRegistered(this.clientId);
        break;
      }

      case 'dial_response': {
        if (!msg.success) {
          alert('Connection failed: ' + (msg.reason || 'Remote rejected request'));
          this._teardownPeer();
          return;
        }

        if (msg.sdpAnswer && this.peerConnection) {
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdpAnswer));
          await this._drainIceCandidates();
          this.onStatusChange('in_session', `I økt med ${msg.targetId}`);
          this._startTelemetryLoop();
        }
        break;
      }

      case 'incoming_connection': {
        // Target host receives incoming call from operator
        this.activePartnerId = msg.fromId;
        this.isHost = true;
        this.onIncomingCall({
          fromId: msg.fromId,
          deviceName: msg.deviceName,
          accept: async (localMediaStream) => {
            await this._acceptIncoming(msg.fromId, msg.sdpOffer, localMediaStream);
          },
          reject: (reason) => {
            this.ws.send(
              JSON.stringify({
                type: 'dial_answer',
                targetId: msg.fromId,
                accepted: false,
                reason: reason || 'Verten avviste tilkoblingsforespørselen.'
              })
            );
          }
        });
        break;
      }

      case 'ice_candidate': {
        if (this.peerConnection && this.peerConnection.remoteDescription && msg.candidate) {
          try {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
          } catch (e) {
            console.warn('[WebRTC] Error adding ICE candidate:', e);
          }
        } else if (msg.candidate) {
          this.iceCandidateQueue.push(msg.candidate);
        }
        break;
      }

      case 'session_ended': {
        this._teardownPeer();
        this.onStatusChange('ready', 'Tilkoblet VPS | Klar');
        this.onSessionEnded(msg.reason || 'Partneren avsluttet økten.');
        break;
      }
    }
  }

  async dial(targetId, password) {
    this.activePartnerId = targetId;
    this.isHost = false;
    this.onStatusChange('connecting', `Dialing ${targetId}...`);

    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle'
    });

    this.peerConnection.onconnectionstatechange = () => {
      const connState = this.peerConnection ? this.peerConnection.connectionState : 'closed';
      console.log('[WebRTC] Operator connection state:', connState);
      if (connState === 'disconnected' || connState === 'failed') {
        this.disconnectSession('WebRTC-tilkoblingen ble avbrutt.');
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const iceState = this.peerConnection ? this.peerConnection.iceConnectionState : 'closed';
      console.log('[WebRTC] Operator ICE state:', iceState);
      if (iceState === 'disconnected' || iceState === 'failed') {
        this.disconnectSession('Nettverksforbindelsen ble avbrutt.');
      }
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.send(
          JSON.stringify({
            type: 'ice_candidate',
            targetId,
            candidate: event.candidate
          })
        );
      }
    };

    this.peerConnection.ontrack = (event) => {
      console.log('[WebRTC] Received remote media track:', event.track.kind);
      this.onRemoteTrack(event.streams[0] || new MediaStream([event.track]));
    };

    // Create high-speed DataChannel for input events
    this.controlChannel = this.peerConnection.createDataChannel('pendesk-control', {
      ordered: true,
      maxPacketLifeTime: 100 // low latency prioritized
    });

    this.controlChannel.onopen = () => {
      console.log('[WebRTC] Control DataChannel open!');
    };

    this.controlChannel.onmessage = (event) => {
      this.onDataMessage(event.data);
    };

    // Create reliable DataChannel for chat, files, and clipboard
    this.reliableChannel = this.peerConnection.createDataChannel('pendesk-reliable', {
      ordered: true
    });

    this.reliableChannel.onopen = () => {
      console.log('[WebRTC] Reliable DataChannel open!');
      this.onReliableStateChange(true);
    };

    this.reliableChannel.onclose = () => {
      this.onReliableStateChange(false);
    };

    this.reliableChannel.onmessage = (event) => {
      this._handleReliableMessage(event.data);
    };

    // Explicitly add recvonly transceivers so SDP offer allocates media lines
    try {
      this.peerConnection.addTransceiver('video', { direction: 'recvonly' });
      this.peerConnection.addTransceiver('audio', { direction: 'recvonly' });
    } catch (e) {
      console.warn('[WebRTC] addTransceiver warning:', e);
    }

    // Create offer
    const offer = await this.peerConnection.createOffer({
      offerToReceiveVideo: true,
      offerToReceiveAudio: true
    });
    await this.peerConnection.setLocalDescription(offer);

    // Send offer to VPS signaling broker
    this.ws.send(
      JSON.stringify({
        type: 'dial',
        targetId,
        password,
        sdpOffer: offer,
        deviceName: this.deviceName
      })
    );
  }

  async _acceptIncoming(callerId, sdpOffer, localMediaStream) {
    this.localStream = localMediaStream;
    this.activePartnerId = callerId;

    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers
    });

    this.peerConnection.onconnectionstatechange = () => {
      const connState = this.peerConnection ? this.peerConnection.connectionState : 'closed';
      console.log('[WebRTC] Host connection state:', connState);
      if (connState === 'disconnected' || connState === 'failed') {
        this.disconnectSession('WebRTC-tilkoblingen ble avbrutt.');
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const iceState = this.peerConnection ? this.peerConnection.iceConnectionState : 'closed';
      console.log('[WebRTC] Host ICE state:', iceState);
      if (iceState === 'disconnected' || iceState === 'failed') {
        this.disconnectSession('Nettverksforbindelsen ble avbrutt.');
      }
    };

    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.send(
          JSON.stringify({
            type: 'ice_candidate',
            targetId: callerId,
            candidate: event.candidate
          })
        );
      }
    };

    // Attach local screen capture tracks if available and hook track.onended
    if (localMediaStream) {
      for (const track of localMediaStream.getTracks()) {
        track.onended = () => {
          console.log('[WebRTC] Host local media track ended by user');
          this.disconnectSession('Skjermdeling ble stoppet av verten.');
        };
        this.peerConnection.addTrack(track, localMediaStream);
      }
    }

    // Host receives data channels from caller
    this.peerConnection.ondatachannel = (event) => {
      const ch = event.channel;
      if (ch.label === 'pendesk-control') {
        this.controlChannel = ch;
        ch.onmessage = (msgEvent) => {
          this.onDataMessage(msgEvent.data);
        };
      } else if (ch.label === 'pendesk-reliable') {
        this.reliableChannel = ch;
        ch.onopen = () => this.onReliableStateChange(true);
        ch.onclose = () => this.onReliableStateChange(false);
        ch.onmessage = (msgEvent) => {
          this._handleReliableMessage(msgEvent.data);
        };
      } else {
        // Fallback for single generic channel
        this.controlChannel = ch;
        this.reliableChannel = ch;
        ch.onmessage = (msgEvent) => {
          try {
            const data = JSON.parse(msgEvent.data);
            if (['chat', 'clipboard', 'file_start', 'file_chunk', 'file_end'].includes(data.type)) {
              this._handleReliableMessage(msgEvent.data);
            } else {
              this.onDataMessage(msgEvent.data);
            }
          } catch {
            this.onDataMessage(msgEvent.data);
          }
        };
      }
    };

    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(sdpOffer));
    await this._drainIceCandidates();
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);

    this.ws.send(
      JSON.stringify({
        type: 'dial_answer',
        targetId: callerId,
        accepted: true,
        sdpAnswer: answer
      })
    );

    this.onStatusChange('in_session', `Fjernstyres av ${callerId}`);
    this._startTelemetryLoop();
  }

  async _drainIceCandidates() {
    while (this.iceCandidateQueue.length > 0) {
      const candidate = this.iceCandidateQueue.shift();
      try {
        if (this.peerConnection && this.peerConnection.remoteDescription) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (e) {
        console.warn('[WebRTC] Error adding queued candidate:', e);
      }
    }
  }

  sendInputEvent(eventData) {
    const ch = this.controlChannel || this.reliableChannel;
    if (ch && ch.readyState === 'open') {
      ch.send(JSON.stringify(eventData));
    }
  }

  _handleReliableMessage(rawData) {
    try {
      const msg = JSON.parse(rawData);
      switch (msg.type) {
        case 'chat': {
          this.onChatMessage({
            text: msg.text,
            senderId: msg.senderId || this.activePartnerId,
            timestamp: msg.timestamp || Date.now(),
            isMe: false
          });
          break;
        }

        case 'clipboard': {
          this.onClipboardReceived(msg.text);
          break;
        }

        case 'file_start': {
          this._incomingFiles.set(msg.fileId, {
            fileId: msg.fileId,
            name: msg.name,
            size: msg.size,
            mimeType: msg.mimeType,
            receivedChunks: [],
            receivedBytes: 0,
            totalChunks: msg.totalChunks
          });
          this.onFileTransferStart({
            fileId: msg.fileId,
            name: msg.name,
            size: msg.size,
            direction: 'download'
          });
          break;
        }

        case 'file_chunk': {
          const fileRecord = this._incomingFiles.get(msg.fileId);
          if (fileRecord) {
            fileRecord.receivedChunks.push(msg.chunk);
            fileRecord.receivedBytes += msg.chunkSize;
            const progress = Math.min(100, Math.round((fileRecord.receivedBytes / fileRecord.size) * 100));
            this.onFileTransferProgress({
              fileId: msg.fileId,
              receivedBytes: fileRecord.receivedBytes,
              totalBytes: fileRecord.size,
              progress,
              direction: 'download'
            });
          }
          break;
        }

        case 'file_end': {
          const fileRecord = this._incomingFiles.get(msg.fileId);
          if (fileRecord) {
            const byteArrays = fileRecord.receivedChunks.map((b64) => {
              const bin = atob(b64);
              const bytes = new Uint8Array(bin.length);
              for (let i = 0; i < bin.length; i++) {
                bytes[i] = bin.charCodeAt(i);
              }
              return bytes;
            });
            const blob = new Blob(byteArrays, { type: fileRecord.mimeType || 'application/octet-stream' });
            const downloadUrl = URL.createObjectURL(blob);
            this._incomingFiles.delete(msg.fileId);
            this.onFileTransferComplete({
              fileId: msg.fileId,
              name: fileRecord.name,
              size: fileRecord.size,
              blob,
              downloadUrl,
              direction: 'download'
            });
          }
          break;
        }
      }
    } catch (e) {
      console.warn('[WebRTC] Error handling reliable message:', e);
    }
  }

  sendChatMessage(text) {
    const ch = this.reliableChannel || this.controlChannel;
    if (ch && ch.readyState === 'open') {
      const payload = {
        type: 'chat',
        text,
        timestamp: Date.now(),
        senderId: this.clientId
      };
      ch.send(JSON.stringify(payload));
      return payload;
    } else {
      throw new Error('Chat-kanalen er ikke tilkoblet.');
    }
  }

  sendClipboard(text) {
    const ch = this.reliableChannel || this.controlChannel;
    if (ch && ch.readyState === 'open') {
      ch.send(
        JSON.stringify({
          type: 'clipboard',
          text
        })
      );
    }
  }

  async sendFile(file, onProgress) {
    const ch = this.reliableChannel || this.controlChannel;
    if (!ch || ch.readyState !== 'open') {
      throw new Error('Datakanalen er ikke tilkoblet for filoverføring.');
    }

    const fileId = Math.random().toString(36).substring(2, 9);
    const CHUNK_SIZE = 16384; // 16 KB safe chunk size
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);

    ch.send(
      JSON.stringify({
        type: 'file_start',
        fileId,
        name: file.name,
        size: file.size,
        mimeType: file.type || 'application/octet-stream',
        totalChunks
      })
    );

    let offset = 0;
    let chunkIndex = 0;

    const readChunk = (start, end) => {
      return new Promise((resolve, reject) => {
        const slice = file.slice(start, end);
        const reader = new FileReader();
        reader.onload = (e) => {
          const bytes = new Uint8Array(e.target.result);
          let binary = '';
          const len = bytes.byteLength;
          for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          const base64 = btoa(binary);
          resolve({ base64, size: len });
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(slice);
      });
    };

    while (offset < file.size) {
      if (ch.bufferedAmount > 256 * 1024) {
        await new Promise((resolve) => {
          const onLow = () => {
            ch.removeEventListener('bufferedamountlow', onLow);
            resolve();
          };
          ch.addEventListener('bufferedamountlow', onLow);
        });
      }

      const end = Math.min(offset + CHUNK_SIZE, file.size);
      const { base64, size } = await readChunk(offset, end);

      ch.send(
        JSON.stringify({
          type: 'file_chunk',
          fileId,
          chunkIndex,
          chunkSize: size,
          chunk: base64
        })
      );

      offset += size;
      chunkIndex++;

      const progress = Math.min(100, Math.round((offset / file.size) * 100));
      if (onProgress) {
        onProgress({ fileId, offset, total: file.size, progress });
      }
    }

    ch.send(
      JSON.stringify({
        type: 'file_end',
        fileId
      })
    );

    return { fileId, name: file.name, size: file.size };
  }

  async replaceMediaStream(newStream) {
    if (!this.peerConnection) return;
    const newTrack = newStream.getVideoTracks()[0];
    if (!newTrack) return;

    const senders = this.peerConnection.getSenders();
    const videoSender = senders.find((s) => s.track && s.track.kind === 'video');

    if (videoSender) {
      await videoSender.replaceTrack(newTrack);
    }

    if (this.localStream) {
      this.localStream.getVideoTracks().forEach((t) => {
        t.onended = null;
        t.stop();
      });
    }

    this.localStream = newStream;
    newTrack.onended = () => {
      console.log('[WebRTC] Switched display track ended by user');
      this.disconnectSession('Skjermdeling ble stoppet av verten.');
    };
  }

  disconnectSession(reason = 'Økten ble avsluttet.') {
    const partnerId = this.activePartnerId;
    if (partnerId && this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(
          JSON.stringify({
            type: 'hangup',
            targetId: partnerId,
            reason
          })
        );
      } catch (e) {
        console.warn('[WebRTC] Error sending hangup:', e);
      }
    }
    this._teardownPeer();
    this.onStatusChange('ready', 'Tilkoblet VPS | Klar');
    this.onSessionEnded(reason);
  }

  _teardownPeer() {
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }
    if (this.localStream) {
      try {
        this.localStream.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
      } catch (e) {
        console.warn('[WebRTC] Error stopping local tracks:', e);
      }
      this.localStream = null;
    }
    if (this.controlChannel) {
      try { this.controlChannel.close(); } catch {}
      this.controlChannel = null;
    }
    if (this.reliableChannel) {
      try { this.reliableChannel.close(); } catch {}
      this.reliableChannel = null;
    }
    this._incomingFiles.clear();
    if (this.peerConnection) {
      try {
        this.peerConnection.onconnectionstatechange = null;
        this.peerConnection.oniceconnectionstatechange = null;
        this.peerConnection.ontrack = null;
        this.peerConnection.onicecandidate = null;
        this.peerConnection.close();
      } catch {}
      this.peerConnection = null;
    }
    this.activePartnerId = null;
    this.isHost = false;
    this.iceCandidateQueue = [];
  }

  _startTelemetryLoop() {
    if (this.telemetryInterval) clearInterval(this.telemetryInterval);

    this.telemetryInterval = setInterval(async () => {
      if (!this.peerConnection) return;
      try {
        const stats = await this.peerConnection.getStats();
        let rtt = null;
        let fps = 60;
        let transport = 'WebRTC P2P';

        stats.forEach((report) => {
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            if (report.currentRoundTripTime !== undefined) {
              rtt = Math.round(report.currentRoundTripTime * 1000);
            }
          }
          if (report.type === 'inbound-rtp' && report.kind === 'video') {
            if (report.framesPerSecond !== undefined) {
              fps = Math.round(report.framesPerSecond);
            }
          }
        });

        this.onTelemetryUpdate({ rtt, fps, transport });
      } catch {
        // stats error
      }
    }, 1000);
  }
}
