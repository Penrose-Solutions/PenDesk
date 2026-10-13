import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

function createPng(width, height, filePath) {
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // IHDR
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // bit depth
  ihdrData.writeUInt8(6, 9); // color type RGBA
  ihdrData.writeUInt8(0, 10);
  ihdrData.writeUInt8(0, 11);
  ihdrData.writeUInt8(0, 12);

  const ihdrCrc = crc32(Buffer.concat([Buffer.from('IHDR'), ihdrData]));
  const ihdrChunk = Buffer.concat([
    Buffer.alloc(4),
    Buffer.from('IHDR'),
    ihdrData,
    Buffer.alloc(4)
  ]);
  ihdrChunk.writeUInt32BE(13, 0);
  ihdrChunk.writeUInt32BE(ihdrCrc, 21);

  // IDAT
  const rawRows = [];
  const bytesPerRow = 1 + width * 4;
  const rowBuffer = Buffer.alloc(bytesPerRow * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * bytesPerRow;
    rowBuffer[rowOffset] = 0; // filter 0
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * 4;
      rowBuffer[pxOffset] = 0;     // R
      rowBuffer[pxOffset + 1] = 210; // G
      rowBuffer[pxOffset + 2] = 255; // B
      rowBuffer[pxOffset + 3] = 255; // A
    }
  }

  const compressed = zlib.deflateSync(rowBuffer);
  const idatCrc = crc32(Buffer.concat([Buffer.from('IDAT'), compressed]));
  const idatChunk = Buffer.concat([
    Buffer.alloc(4),
    Buffer.from('IDAT'),
    compressed,
    Buffer.alloc(4)
  ]);
  idatChunk.writeUInt32BE(compressed.length, 0);
  idatChunk.writeUInt32BE(idatCrc, 8 + compressed.length);

  // IEND
  const iendData = Buffer.from('IEND');
  const iendCrc = crc32(iendData);
  const iendChunk = Buffer.concat([
    Buffer.from([0, 0, 0, 0]),
    iendData,
    Buffer.alloc(4)
  ]);
  iendChunk.writeUInt32BE(iendCrc, 8);

  const png = Buffer.concat([pngHeader, ihdrChunk, idatChunk, iendChunk]);
  fs.writeFileSync(filePath, png);
}

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const iconsDir = path.resolve('client/src-tauri/icons');
fs.mkdirSync(iconsDir, { recursive: true });

createPng(32, 32, path.join(iconsDir, '32x32.png'));
createPng(128, 128, path.join(iconsDir, '128x128.png'));
createPng(256, 256, path.join(iconsDir, '128x128@2x.png'));
createPng(512, 512, path.join(iconsDir, 'icon.png'));
createPng(32, 32, path.join(iconsDir, 'icon.ico'));
createPng(128, 128, path.join(iconsDir, 'icon.icns'));

console.log('Successfully generated all Tauri icon assets in:', iconsDir);
