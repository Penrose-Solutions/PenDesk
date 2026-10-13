// Windows SendInput implementation stub for cross-platform compilation

pub fn inject_mouse_move(_norm_x: f64, _norm_y: f64) {
    #[cfg(target_os = "windows")]
    {
        // On Windows: SendInput with MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE
    }
}

pub fn inject_mouse_click(_norm_x: f64, _norm_y: f64, _button: u32, _is_down: bool) {
    #[cfg(target_os = "windows")]
    {
        // On Windows: SendInput with MOUSEEVENTF_LEFTDOWN / MOUSEEVENTF_LEFTUP
    }
}

pub fn inject_scroll(_delta_x: f64, _delta_y: f64) {
    #[cfg(target_os = "windows")]
    {
        // On Windows: SendInput with MOUSEEVENTF_WHEEL
    }
}

pub fn inject_key(_virtual_key: u16, _is_down: bool) {
    #[cfg(target_os = "windows")]
    {
        // On Windows: SendInput with KEYBDINPUT
    }
}
