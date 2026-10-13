import crypto from 'node:crypto';
import EventEmitter from 'node:events';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

export class WebSocketConnection extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.buffer = Buffer.alloc(0);
    this.isAlive = true;

    socket.on('data', (chunk) => this._onData(chunk));
    socket.on('close', () => this.emit('close'));
    socket.on('error', (err) => this.emit('error', err));
  }

  send(data) {
    if (this.socket.destroyed) return;
    const payload = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
    const len = payload.length;

    let header;
    if (len < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81; // FIN + text opcode
      header[1] = len;
    } else if (len <= 0xffff) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = 126;
      header.writeUInt16BE(len, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = 127;
      header.writeBigUInt64BE(BigInt(len), 2);
    }

    this.socket.write(Buffer.concat([header, payload]));
  }

  close(code = 1000) {
    if (this.socket.destroyed) return;
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(code, 0);
    const frame = Buffer.concat([Buffer.from([0x88, 2]), payload]);
    this.socket.write(frame, () => this.socket.end());
  }

  _onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (this.buffer.length >= 2) {
      const byte0 = this.buffer[0];
      const byte1 = this.buffer[1];

      const opcode = byte0 & 0x0f;
      const isMasked = (byte1 & 0x80) !== 0;
      let payloadLen = byte1 & 0x7f;
      let offset = 2;

      if (payloadLen === 126) {
        if (this.buffer.length < offset + 2) break;
        payloadLen = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (payloadLen === 127) {
        if (this.buffer.length < offset + 8) break;
        payloadLen = Number(this.buffer.readBigUInt64BE(offset));
        offset += 8;
      }

      let maskKey = null;
      if (isMasked) {
        if (this.buffer.length < offset + 4) break;
        maskKey = this.buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      if (this.buffer.length < offset + payloadLen) break;

      const payload = Buffer.from(this.buffer.subarray(offset, offset + payloadLen));
      this.buffer = this.buffer.subarray(offset + payloadLen);

      if (isMasked && maskKey) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }

      // Handle OpCodes
      if (opcode === 0x01) { // Text
        this.emit('message', payload.toString('utf8'));
      } else if (opcode === 0x02) { // Binary
        this.emit('message', payload);
      } else if (opcode === 0x08) { // Close
        this.close();
        this.emit('close');
        break;
      } else if (opcode === 0x09) { // Ping
        const pong = Buffer.from([0x8a, 0x00]);
        this.socket.write(pong);
      } else if (opcode === 0x0a) { // Pong
        this.isAlive = true;
      }
    }
  }
}

export class WebSocketServer extends EventEmitter {
  constructor() {
    super();
  }

  handleUpgrade(req, socket, head) {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const acceptKey = crypto
      .createHash('sha1')
      .update(key + GUID)
      .digest('base64');

    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '\r\n'
    ];

    socket.write(headers.join('\r\n'));
    const ws = new WebSocketConnection(socket);
    if (head && head.length > 0) {
      ws._onData(head);
    }

    this.emit('connection', ws, req);
  }
}
