#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$DIR/dist/macOS"
APP_DIR="$DIST_DIR/PenDesk.app"
CONTENTS="$APP_DIR/Contents"
MACOS="$CONTENTS/MacOS"
RESOURCES="$CONTENTS/Resources"

echo "=========================================="
echo " Packaging PenDesk for macOS (Apple Silicon)"
echo "=========================================="

rm -rf "$DIST_DIR"
mkdir -p "$MACOS" "$RESOURCES"

# 1. Copy release binary
cp "$DIR/client/src-tauri/target/release/pendesk" "$MACOS/PenDesk"
chmod +x "$MACOS/PenDesk"

# 2. Copy icon
if [ -f "$DIR/client/src-tauri/icons/icon.icns" ]; then
  cp "$DIR/client/src-tauri/icons/icon.icns" "$RESOURCES/icon.icns"
fi

# 3. Create Info.plist with permissions
cat << 'EOF' > "$CONTENTS/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>PenDesk</string>
    <key>CFBundleIdentifier</key>
    <string>com.penrose.pendesk</string>
    <key>CFBundleName</key>
    <string>PenDesk</string>
    <key>CFBundleDisplayName</key>
    <string>PenDesk</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>NSSupportsAutomaticGraphicsSwitching</key>
    <true/>
    <key>NSScreenCaptureUsageDescription</key>
    <string>PenDesk trenger tilgang til skjermopptak for å overføre skjermbilde under fjernstyring.</string>
    <key>NSAccessibilityUsageDescription</key>
    <string>PenDesk trenger tilgjengelighetstilgang for at partner kan styre mus og tastatur.</string>
</dict>
</plist>
EOF
# 3.5. Code sign the application bundle
echo "Code signing PenDesk.app..."
codesign --force --deep -s - "$APP_DIR"

codesign --verify --deep --strict --verbose=2 "$APP_DIR"
# 4. Create DMG staging folder with Applications shortcut
STAGING="$DIR/dist/dmg-staging"
rm -rf "$STAGING"
mkdir -p "$STAGING"
cp -r "$APP_DIR" "$STAGING/"
ln -s /Applications "$STAGING/Applications"

if [ -f "$RESOURCES/icon.icns" ]; then
  cp "$RESOURCES/icon.icns" "$STAGING/.VolumeIcon.icns"
  SetFile -a C "$STAGING" 2>/dev/null || true
fi

DMG_OUT="$DIR/dist/Penrose-Fjernhjelp-macOS-AppleSilicon.dmg"
rm -f "$DMG_OUT"

echo "Creating compressed DMG with hdiutil..."
hdiutil create -volname "PenDesk" -srcfolder "$STAGING" -ov -format UDZO "$DMG_OUT"
rm -rf "$STAGING"

echo "Code signing DMG disk image..."
codesign --force -s - "$DMG_OUT" 2>/dev/null || true


echo "=========================================="
echo " Successfully created PenDesk DMG:"
ls -lh "$DMG_OUT"
echo "=========================================="
