use serde::Serialize;
use std::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct PermissionStatus {
    pub screen_recording: bool,
    pub accessibility: bool,
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGPreflightScreenCaptureAccess() -> bool;
    fn CGRequestScreenCaptureAccess() -> bool;
}

#[link(name = "ApplicationServices", kind = "framework")]
extern "C" {
    fn AXIsProcessTrusted() -> bool;
}

pub fn check_macos_permissions() -> PermissionStatus {
    let screen = unsafe { CGPreflightScreenCaptureAccess() };
    let a11y = unsafe { AXIsProcessTrusted() };

    PermissionStatus {
        screen_recording: screen,
        accessibility: a11y,
    }
}

pub fn request_macos_permissions() -> PermissionStatus {
    let screen = unsafe { CGRequestScreenCaptureAccess() };
    let a11y = unsafe { AXIsProcessTrusted() };

    PermissionStatus {
        screen_recording: screen,
        accessibility: a11y,
    }
}

pub fn open_permission_settings() {
    let _ = Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")
        .spawn();
}
