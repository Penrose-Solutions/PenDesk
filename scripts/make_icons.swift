import Foundation
import CoreGraphics
import ImageIO
import AppKit

let uploadedPath = "/Users/eba/.gemini/antigravity-ide/brain/f4050987-5252-4cd5-a337-299d72386114/.user_uploaded/media_1791976315486.png"
let iconsDir = "/Users/eba/Documents/dev/Penrose Systems/PenDesk/client/src-tauri/icons"

let logoUrl = URL(fileURLWithPath: uploadedPath)
guard let source = CGImageSourceCreateWithURL(logoUrl as CFURL, nil),
      let origLogo = CGImageSourceCreateImageAtIndex(source, 0, nil) else {
    print("Error: Could not load source logo from \(uploadedPath)")
    exit(1)
}

let lw = origLogo.width
let lh = origLogo.height
let colorSpace = CGColorSpaceCreateDeviceRGB()

var raw = [UInt8](repeating: 0, count: lw * lh * 4)
let loadCtx = CGContext(data: &raw, width: lw, height: lh, bitsPerComponent: 8, bytesPerRow: lw * 4, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
loadCtx.draw(origLogo, in: CGRect(x: 0, y: 0, width: lw, height: lh))

// Convert black strokes on white background to antialiased transparent PNG
var transparentData = [UInt8](repeating: 0, count: lw * lh * 4)
for i in stride(from: 0, to: raw.count, by: 4) {
    let r = Float(raw[i])
    let g = Float(raw[i+1])
    let b = Float(raw[i+2])
    let lum = (r + g + b) / 3.0
    // If lum is 255 (white), alpha is 0. If lum is 0 (black), alpha is 255.
    let alpha = max(0.0, min(255.0, (252.0 - lum) * (255.0 / 240.0)))
    let aByte = UInt8(alpha)
    // Dark ink #0C0E12
    transparentData[i] = UInt8(Float(12) * (alpha / 255.0))
    transparentData[i+1] = UInt8(Float(14) * (alpha / 255.0))
    transparentData[i+2] = UInt8(Float(18) * (alpha / 255.0))
    transparentData[i+3] = aByte
}

let transCtx = CGContext(data: &transparentData, width: lw, height: lh, bitsPerComponent: 8, bytesPerRow: lw * 4, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
guard let transparentLogo = transCtx.makeImage() else {
    print("Error: Failed to create transparent logo image")
    exit(1)
}

// Function to render the 1024x1024 master icon
func renderMasterIcon(size: Int) -> CGImage {
    let s = CGFloat(size)
    let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4, space: colorSpace, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
    
    // Scale factor
    let scale = s / 1024.0
    
    // Tile geometry (Apple standard: 824x824 at 1024, centered at 100,100)
    let tileMargin: CGFloat = 100.0 * scale
    let tileSize: CGFloat = 824.0 * scale
    let cornerRadius: CGFloat = 185.0 * scale
    let tileRect = CGRect(x: tileMargin, y: tileMargin, width: tileSize, height: tileSize)
    let squirclePath = CGPath(roundedRect: tileRect, cornerWidth: cornerRadius, cornerHeight: cornerRadius, transform: nil)
    
    // 1. Draw subtle macOS drop shadow
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -16.0 * scale), blur: 26.0 * scale, color: CGColor(red: 0, green: 0, blue: 0, alpha: 0.18))
    ctx.addPath(squirclePath)
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    ctx.fillPath()
    ctx.restoreGState()
    
    // 2. Draw second contact shadow for crisp edge
    ctx.saveGState()
    ctx.setShadow(offset: CGSize(width: 0, height: -4.0 * scale), blur: 8.0 * scale, color: CGColor(red: 0, green: 0, blue: 0, alpha: 0.10))
    ctx.addPath(squirclePath)
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    ctx.fillPath()
    ctx.restoreGState()
    
    // 3. Fill squircle with subtle gallery paper vertical gradient (#FFFFFF -> #F3F2EC)
    ctx.saveGState()
    ctx.addPath(squirclePath)
    ctx.clip()
    
    let gradientColors = [
        CGColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0),
        CGColor(red: 0.953, green: 0.949, blue: 0.925, alpha: 1.0)
    ] as CFArray
    let gradient = CGGradient(colorsSpace: colorSpace, colors: gradientColors, locations: [0.0, 1.0])!
    ctx.drawLinearGradient(gradient, start: CGPoint(x: 0, y: tileRect.maxY), end: CGPoint(x: 0, y: tileRect.minY), options: [])
    
    // 4. Subtle top inner highlight
    ctx.setStrokeColor(CGColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 0.8))
    ctx.setLineWidth(2.0 * scale)
    ctx.addPath(squirclePath)
    ctx.strokePath()
    
    // 5. Draw Penrose Tribar in center
    let logoAspect = CGFloat(lw) / CGFloat(lh)
    let targetLogoH = 475.0 * scale
    let targetLogoW = targetLogoH * logoAspect
    let logoX = (s - targetLogoW) / 2.0
    let logoY = (s - targetLogoH) / 2.0
    let logoRect = CGRect(x: logoX, y: logoY, width: targetLogoW, height: targetLogoH)
    
    ctx.interpolationQuality = .high
    ctx.draw(transparentLogo, in: logoRect)
    
    ctx.restoreGState()
    
    // 6. Hairline border stroke
    ctx.saveGState()
    ctx.setStrokeColor(CGColor(red: 12.0/255.0, green: 14.0/255.0, blue: 18.0/255.0, alpha: 0.08))
    ctx.setLineWidth(1.5 * scale)
    ctx.addPath(squirclePath)
    ctx.strokePath()
    ctx.restoreGState()
    
    return ctx.makeImage()!
}

// Helper to save CGImage as PNG
func savePNG(image: CGImage, path: String) {
    let url = URL(fileURLWithPath: path)
    guard let dest = CGImageDestinationCreateWithURL(url as CFURL, "public.png" as CFString, 1, nil) else {
        print("Failed to create destination for \(path)")
        return
    }
    CGImageDestinationAddImage(dest, image, nil)
    CGImageDestinationFinalize(dest)
}

print("Rendering master 1024x1024 icon...")
let master1024 = renderMasterIcon(size: 1024)

// Create temporary iconset folder for iconutil
let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent("PenDesk.iconset")
try? FileManager.default.removeItem(at: tempDir)
try! FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)

let iconSizes: [(String, Int)] = [
    ("icon_16x16.png", 16),
    ("icon_16x16@2x.png", 32),
    ("icon_32x32.png", 32),
    ("icon_32x32@2x.png", 64),
    ("icon_128x128.png", 128),
    ("icon_128x128@2x.png", 256),
    ("icon_256x256.png", 256),
    ("icon_256x256@2x.png", 512),
    ("icon_512x512.png", 512),
    ("icon_512x512@2x.png", 1024)
]

for (name, sz) in iconSizes {
    let img = renderMasterIcon(size: sz)
    let filePath = tempDir.appendingPathComponent(name).path
    savePNG(image: img, path: filePath)
}

// Generate icon.icns via iconutil
let icnsPath = "\(iconsDir)/icon.icns"
let p = Process()
p.executableURL = URL(fileURLWithPath: "/usr/bin/iconutil")
p.arguments = ["-c", "icns", tempDir.path, "-o", icnsPath]
try! p.run()
p.waitUntilExit()

print("iconutil exit code: \(p.terminationStatus)")

// Save Tauri specific PNG files
savePNG(image: renderMasterIcon(size: 32), path: "\(iconsDir)/32x32.png")
savePNG(image: renderMasterIcon(size: 128), path: "\(iconsDir)/128x128.png")
savePNG(image: renderMasterIcon(size: 256), path: "\(iconsDir)/128x128@2x.png")
savePNG(image: renderMasterIcon(size: 512), path: "\(iconsDir)/icon.png")

// Generate multi-resolution Windows icon.ico
let icoSizes = [16, 32, 48, 64, 128, 256]
var pngDatas: [(Int, Data)] = []

for sz in icoSizes {
    let img = renderMasterIcon(size: sz)
    let tmpPath = tempDir.appendingPathComponent("ico_\(sz).png").path
    savePNG(image: img, path: tmpPath)
    if let d = try? Data(contentsOf: URL(fileURLWithPath: tmpPath)) {
        pngDatas.append((sz, d))
    }
}

var icoData = Data()
// ICONDIR header
icoData.append(contentsOf: [0x00, 0x00]) // Reserved
icoData.append(contentsOf: [0x01, 0x00]) // Type 1 = ICO
let count = UInt16(pngDatas.count)
icoData.append(contentsOf: withUnsafeBytes(of: count.littleEndian) { Array($0) })

var offset = UInt32(6 + 16 * pngDatas.count)

for (sz, d) in pngDatas {
    // ICONDIRENTRY
    let w: UInt8 = sz >= 256 ? 0 : UInt8(sz)
    let h: UInt8 = sz >= 256 ? 0 : UInt8(sz)
    icoData.append(w)
    icoData.append(h)
    icoData.append(0) // Color count
    icoData.append(0) // Reserved
    let planes: UInt16 = 1
    icoData.append(contentsOf: withUnsafeBytes(of: planes.littleEndian) { Array($0) })
    let bitCount: UInt16 = 32
    icoData.append(contentsOf: withUnsafeBytes(of: bitCount.littleEndian) { Array($0) })
    let byteCount = UInt32(d.count)
    icoData.append(contentsOf: withUnsafeBytes(of: byteCount.littleEndian) { Array($0) })
    icoData.append(contentsOf: withUnsafeBytes(of: offset.littleEndian) { Array($0) })
    offset += byteCount
}

for (_, d) in pngDatas {
    icoData.append(d)
}

try! icoData.write(to: URL(fileURLWithPath: "\(iconsDir)/icon.ico"))
print("Generated Windows icon.ico successfully (\(icoData.count) bytes)")

// Clean up temporary iconset
try? FileManager.default.removeItem(at: tempDir)

print("All icons generated successfully in \(iconsDir)!")

