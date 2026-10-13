pub mod capture;
pub mod input;
pub mod permissions;

use capture::DisplayInfo;
use input::InputEvent;
use permissions::AppPermissions;

#[tauri::command]
fn check_permissions() -> AppPermissions {
    permissions::check_system_permissions()
}

#[tauri::command]
fn open_permission_settings() {
    permissions::open_system_settings();
}

#[tauri::command]
fn inject_input(event: InputEvent) {
    input::handle_remote_input(event);
}

#[tauri::command]
fn get_displays() -> Vec<DisplayInfo> {
    capture::list_displays()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            check_permissions,
            open_permission_settings,
            inject_input,
            get_displays,
        ])
        .run(tauri::generate_context!())
        .expect("error while running PenDesk application");
}
