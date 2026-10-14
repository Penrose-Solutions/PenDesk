// Windows SendInput implementation for PenDesk remote control

#[cfg(target_os = "windows")]
use windows::Win32::UI::Input::KeyboardAndMouse::{
    SendInput, INPUT, INPUT_0, INPUT_KEYBOARD, INPUT_MOUSE,
    KEYBDINPUT, KEYEVENTF_KEYUP, KEYBD_EVENT_FLAGS,
    MOUSEINPUT, MOUSEEVENTF_ABSOLUTE, MOUSEEVENTF_MOVE,
    MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP,
    MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP,
    MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP,
    MOUSEEVENTF_WHEEL,
    VIRTUAL_KEY,
};

pub fn inject_mouse_move(norm_x: f64, norm_y: f64) {
    #[cfg(target_os = "windows")]
    {
        let dx = (norm_x.clamp(0.0, 1.0) * 65535.0).round() as i32;
        let dy = (norm_y.clamp(0.0, 1.0) * 65535.0).round() as i32;

        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx,
                    dy,
                    mouseData: 0,
                    dwFlags: MOUSEEVENTF_ABSOLUTE | MOUSEEVENTF_MOVE,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };

        unsafe {
            let _ = SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (norm_x, norm_y);
    }
}

pub fn inject_mouse_click(norm_x: f64, norm_y: f64, button: u32, is_down: bool) {
    #[cfg(target_os = "windows")]
    {
        let dx = (norm_x.clamp(0.0, 1.0) * 65535.0).round() as i32;
        let dy = (norm_y.clamp(0.0, 1.0) * 65535.0).round() as i32;

        let dw_flags = match (button, is_down) {
            (0, true) => MOUSEEVENTF_LEFTDOWN,
            (0, false) => MOUSEEVENTF_LEFTUP,
            (1, true) => MOUSEEVENTF_MIDDLEDOWN,
            (1, false) => MOUSEEVENTF_MIDDLEUP,
            (2, true) => MOUSEEVENTF_RIGHTDOWN,
            (2, false) => MOUSEEVENTF_RIGHTUP,
            _ => if is_down { MOUSEEVENTF_LEFTDOWN } else { MOUSEEVENTF_LEFTUP },
        };

        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx,
                    dy,
                    mouseData: 0,
                    dwFlags: MOUSEEVENTF_ABSOLUTE | dw_flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };

        unsafe {
            let _ = SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (norm_x, norm_y, button, is_down);
    }
}

pub fn inject_scroll(_delta_x: f64, delta_y: f64) {
    #[cfg(target_os = "windows")]
    {
        // Windows wheel clicks: 120 units per click
        let wheel_delta = (-delta_y.signum() * 120.0) as i32;

        let input = INPUT {
            r#type: INPUT_MOUSE,
            Anonymous: INPUT_0 {
                mi: MOUSEINPUT {
                    dx: 0,
                    dy: 0,
                    mouseData: wheel_delta as u32,
                    dwFlags: MOUSEEVENTF_WHEEL,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };

        unsafe {
            let _ = SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (delta_x, delta_y);
    }
}

pub fn inject_key(virtual_key: u16, is_down: bool) {
    #[cfg(target_os = "windows")]
    {
        let dw_flags = if is_down {
            KEYBD_EVENT_FLAGS(0)
        } else {
            KEYEVENTF_KEYUP
        };

        let input = INPUT {
            r#type: INPUT_KEYBOARD,
            Anonymous: INPUT_0 {
                ki: KEYBDINPUT {
                    wVk: VIRTUAL_KEY(virtual_key),
                    wScan: 0,
                    dwFlags: dw_flags,
                    time: 0,
                    dwExtraInfo: 0,
                },
            },
        };

        unsafe {
            let _ = SendInput(&[input], std::mem::size_of::<INPUT>() as i32);
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = (virtual_key, is_down);
    }
}
