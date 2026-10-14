#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
echo "=========================================="
echo " Packaging PenDesk for Windows (.exe)"
echo "=========================================="

export PATH="/Users/eba/.rustup/toolchains/stable-aarch64-apple-darwin/lib/rustlib/aarch64-apple-darwin/bin:/Users/eba/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH"

cd "$DIR/client/src-tauri"
~/.cargo/bin/cargo-xwin xwin build --release --target x86_64-pc-windows-msvc

mkdir -p "$DIR/dist/Windows"
cp "$DIR/client/src-tauri/target/x86_64-pc-windows-msvc/release/pendesk.exe" "$DIR/dist/Windows/Penrose-Fjernhjelp-Windows.exe"

echo "=========================================="
echo " Successfully created PenDesk Windows exe:"
ls -lh "$DIR/dist/Windows/Penrose-Fjernhjelp-Windows.exe"
echo "=========================================="
