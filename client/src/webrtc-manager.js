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
    this.dataChannel = null;
    this.iceServers = [];
    this.iceCandidateQueue = [];
    this.activePartnerId = null;
    this.isHost = false;

    this.onStatusChange = options.onStatusChange || (() => {});
    this.onRegistered = options.onRegistered || (() => {});
    this.onIncomingCall = options.onIncomingCall || (() => {});
    this.onRemoteTrack = options.onRemoteTrack || (() => {});
    this.onDataMessage = options.onDataMessage || (() => {});
    this.onTelemetryUpdate = options.onTelemetryUpdate || (() => {});
    this.onSessionEnded = options.onSessionEnded || (() => {});

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
        this.onSessionEnded(msg.reason);
        this._teardownPeer();
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
    this.dataChannel = this.peerConnection.createDataChannel('pendesk-control', {
      ordered: true,
      maxPacketLifeTime: 100 // low latency prioritized
    });

    this.dataChannel.onopen = () => {
      console.log('[WebRTC] DataChannel open for remote control!');
    };

    this.dataChannel.onmessage = (event) => {
      this.onDataMessage(event.data);
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
    this.peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers
    });

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

    // Attach local screen capture tracks if available
    if (localMediaStream) {
      for (const track of localMediaStream.getTracks()) {
        this.peerConnection.addTrack(track, localMediaStream);
      }
    }

    // Host receives data channel from caller
    this.peerConnection.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.dataChannel.onmessage = (msgEvent) => {
        this.onDataMessage(msgEvent.data);
      };
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
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(eventData));
    }
  }

  disconnectSession() {
    if (this.activePartnerId && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(
        JSON.stringify({
          type: 'hangup',
          targetId: this.activePartnerId
        })
      );
    }
    this._teardownPeer();
    this.onSessionEnded('Session terminated by user');
  }

  _teardownPeer() {
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.activePartnerId = null;
    this.isHost = false;
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
