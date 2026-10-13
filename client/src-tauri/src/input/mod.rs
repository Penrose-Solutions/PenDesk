pub mod macos;
pub mod windows;

use serde::Deserialize;

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum InputEvent {
    #[serde(rename = "mousemove")]
    MouseMove { x: f64, y: f64 },

    #[serde(rename = "mousedown")]
    MouseDown { x: f64, y: f64, button: u32 },

    #[serde(rename = "mouseup")]
    MouseUp { x: f64, y: f64, button: u32 },

    #[serde(rename = "wheel")]
    Scroll {
        #[serde(rename = "deltaX")]
        delta_x: f64,
        #[serde(rename = "deltaY")]
        delta_y: f64,
    },

    #[serde(rename = "keydown")]
    KeyDown { key: String, code: Option<String> },

    #[serde(rename = "keyup")]
    KeyUp { key: String, code: Option<String> },
}

pub fn handle_remote_input(event: InputEvent) {
    match event {
        InputEvent::MouseMove { x, y } => {
            #[cfg(target_os = "macos")]
            macos::inject_mouse_move(x, y);

            #[cfg(target_os = "windows")]
            windows::inject_mouse_move(x, y);
        }

        InputEvent::MouseDown { x, y, button } => {
            #[cfg(target_os = "macos")]
            macos::inject_mouse_click(x, y, button, true);

            #[cfg(target_os = "windows")]
            windows::inject_mouse_click(x, y, button, true);
        }

        InputEvent::MouseUp { x, y, button } => {
            #[cfg(target_os = "macos")]
            macos::inject_mouse_click(x, y, button, false);

            #[cfg(target_os = "windows")]
            windows::inject_mouse_click(x, y, button, false);
        }

        InputEvent::Scroll { delta_x, delta_y } => {
            #[cfg(target_os = "macos")]
            macos::inject_scroll(delta_x, delta_y);

            #[cfg(target_os = "windows")]
            windows::inject_scroll(delta_x, delta_y);
        }

        InputEvent::KeyDown { key, code: _ } => {
            let keycode = map_key_to_code(&key);
            #[cfg(target_os = "macos")]
            macos::inject_key(keycode, true);

            #[cfg(target_os = "windows")]
            windows::inject_key(keycode, true);
        }

        InputEvent::KeyUp { key, code: _ } => {
            let keycode = map_key_to_code(&key);
            #[cfg(target_os = "macos")]
            macos::inject_key(keycode, false);

            #[cfg(target_os = "windows")]
            windows::inject_key(keycode, false);
        }
    }
}

// Maps standard key names to virtual keycodes (macOS ANSI layout mapping)
fn map_key_to_code(key: &str) -> u16 {
    match key.to_lowercase().as_str() {
        "a" => 0x00,
        "s" => 0x01,
        "d" => 0x02,
        "f" => 0x03,
        "h" => 0x04,
        "g" => 0x05,
        "z" => 0x06,
        "x" => 0x07,
        "c" => 0x08,
        "v" => 0x09,
        "b" => 0x0B,
        "q" => 0x0C,
        "w" => 0x0D,
        "e" => 0x0E,
        "r" => 0x0F,
        "y" => 0x10,
        "t" => 0x11,
        "1" => 0x12,
        "2" => 0x13,
        "3" => 0x14,
        "4" => 0x15,
        "6" => 0x16,
        "5" => 0x17,
        "=" => 0x18,
        "9" => 0x19,
        "7" => 0x1A,
        "-" => 0x1B,
        "8" => 0x1C,
        "0" => 0x1D,
        "]" => 0x1E,
        "o" => 0x1F,
        "u" => 0x20,
        "[" => 0x21,
        "i" => 0x22,
        "p" => 0x23,
        "enter" | "return" => 0x24,
        "l" => 0x25,
        "j" => 0x26,
        "k" => 0x28,
        ";" => 0x29,
        "\\" => 0x2A,
        "," => 0x2B,
        "/" => 0x2C,
        "n" => 0x2D,
        "m" => 0x2E,
        "." => 0x2F,
        "tab" => 0x30,
        " " | "space" => 0x31,
        "backspace" => 0x33,
        "escape" => 0x35,
        "command" | "meta" => 0x37,
        "shift" => 0x38,
        "capslock" => 0x39,
        "option" | "alt" => 0x3A,
        "control" => 0x3B,
        _ => 0x31,
    }
}
