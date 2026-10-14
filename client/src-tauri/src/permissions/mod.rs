#[cfg(target_os = "macos")]
pub mod macos;

use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct AppPermissions {
    pub screen_recording: bool,
    pub accessibility: bool,
}

pub fn check_system_permissions() -> AppPermissions {
    #[cfg(target_os = "macos")]
    {
        let status = macos::check_macos_permissions();
        AppPermissions {
            screen_recording: status.screen_recording,
            accessibility: status.accessibility,
        }
    }

    #[cfg(not(target_os = "macos"))]
    {
        // Windows and Linux do not require macOS TCC permissions
        AppPermissions {
            screen_recording: true,
            accessibility: true,
        }
    }
}

pub fn open_system_settings() {
    #[cfg(target_os = "macos")]
    {
        macos::open_permission_settings();
    }
}
