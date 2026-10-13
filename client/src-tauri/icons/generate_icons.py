import struct
import zlib
import os

def create_png(width, height, path):
    # PNG signature
    png = b'\x89PNG\r\n\x1a\n'
    
    # IHDR
    ihdr_data = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    ihdr_crc = zlib.crc32(b'IHDR' + ihdr_data)
    png += struct.pack('>I', len(ihdr_data)) + b'IHDR' + ihdr_data + struct.pack('>I', ihdr_crc)
    
    # IDAT (cyan/blue gradient RGBA)
    raw_rows = []
    for y in range(height):
        row = b'\x00' # filter byte
        for x in range(width):
            r = int(0)
            g = int(180 * (1 - y / height))
            b = int(240 * (x / width) + 15)
            a = 255
            row += struct.pack('BBBB', r, g, b, a)
        raw_rows.append(row)
        
    compressed = zlib.compress(b''.join(raw_rows))
    idat_crc = zlib.crc32(b'IDAT' + compressed)
    png += struct.pack('>I', len(compressed)) + b'IDAT' + compressed + struct.pack('>I', idat_crc)
    
    # IEND
    iend_crc = zlib.crc32(b'IEND')
    png += struct.pack('>I', 0) + b'IEND' + struct.pack('>I', iend_crc)
    
    with open(path, 'wb') as f:
        f.write(png)

icons_dir = '/Users/eba/Documents/dev/Penrose Systems/PenDesk/client/src-tauri/icons'
create_png(32, 32, os.path.join(icons_dir, '32x32.png'))
create_png(128, 128, os.path.join(icons_dir, '128x128.png'))
create_png(256, 256, os.path.join(icons_dir, '128x128@2x.png'))
create_png(512, 512, os.path.join(icons_dir, 'icon.png'))
create_png(32, 32, os.path.join(icons_dir, 'icon.ico'))
create_png(128, 128, os.path.join(icons_dir, 'icon.icns'))

print("All PNG icons created successfully.")
