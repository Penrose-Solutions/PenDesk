use core_graphics::display::CGMainDisplayID;
use std::os::raw::c_void;

#[repr(C)]
#[derive(Clone, Copy)]
pub struct CGPoint {
    pub x: f64,
    pub y: f64,
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGDisplayPixelsWide(display: u32) -> usize;
    fn CGDisplayPixelsHigh(display: u32) -> usize;
    fn CGEventCreateMouseEvent(
        source: *mut c_void,
        mouse_type: u32,
        position: CGPoint,
        mouse_button: u32,
    ) -> *mut c_void;
    fn CGEventCreateScrollWheelEvent2(
        source: *mut c_void,
        units: u32,
        wheel_count: u32,
        wheel1: i32,
        wheel2: i32,
        wheel3: i32,
    ) -> *mut c_void;
    fn CGEventCreateKeyboardEvent(
        source: *mut c_void,
        virtual_key: u16,
        key_down: bool,
    ) -> *mut c_void;
    fn CGEventPost(tap: u32, event: *mut c_void);
    fn CFRelease(cf: *mut c_void);
}

const K_CG_HID_EVENT_TAP: u32 = 0;
const K_CG_EVENT_LEFT_MOUSE_DOWN: u32 = 1;
const K_CG_EVENT_LEFT_MOUSE_UP: u32 = 2;
const K_CG_EVENT_RIGHT_MOUSE_DOWN: u32 = 3;
const K_CG_EVENT_RIGHT_MOUSE_UP: u32 = 4;
const K_CG_EVENT_MOUSE_MOVED: u32 = 5;

fn get_display_dimensions() -> (f64, f64) {
    let main_id = unsafe { CGMainDisplayID() };
    let w = unsafe { CGDisplayPixelsWide(main_id) } as f64;
    let h = unsafe { CGDisplayPixelsHigh(main_id) } as f64;
    (w, h)
}

pub fn inject_mouse_move(norm_x: f64, norm_y: f64) {
    let (w, h) = get_display_dimensions();
    let point = CGPoint {
        x: norm_x * w,
        y: norm_y * h,
    };

    unsafe {
        let event = CGEventCreateMouseEvent(
            std::ptr::null_mut(),
            K_CG_EVENT_MOUSE_MOVED,
            point,
            0,
        );
        if !event.is_null() {
            CGEventPost(K_CG_HID_EVENT_TAP, event);
            CFRelease(event);
        }
    }
}

pub fn inject_mouse_click(norm_x: f64, norm_y: f64, button: u32, is_down: bool) {
    let (w, h) = get_display_dimensions();
    let point = CGPoint {
        x: norm_x * w,
        y: norm_y * h,
    };

    let event_type = match (button, is_down) {
        (0, true) => K_CG_EVENT_LEFT_MOUSE_DOWN,
        (0, false) => K_CG_EVENT_LEFT_MOUSE_UP,
        (2, true) => K_CG_EVENT_RIGHT_MOUSE_DOWN,
        (2, false) => K_CG_EVENT_RIGHT_MOUSE_UP,
        _ => if is_down { K_CG_EVENT_LEFT_MOUSE_DOWN } else { K_CG_EVENT_LEFT_MOUSE_UP },
    };

    unsafe {
        let event = CGEventCreateMouseEvent(
            std::ptr::null_mut(),
            event_type,
            point,
            button,
        );
        if !event.is_null() {
            CGEventPost(K_CG_HID_EVENT_TAP, event);
            CFRelease(event);
        }
    }
}

pub fn inject_scroll(delta_x: f64, delta_y: f64) {
    unsafe {
        let event = CGEventCreateScrollWheelEvent2(
            std::ptr::null_mut(),
            0, // pixels
            2,
            delta_y as i32,
            delta_x as i32,
            0,
        );
        if !event.is_null() {
            CGEventPost(K_CG_HID_EVENT_TAP, event);
            CFRelease(event);
        }
    }
}

pub fn inject_key(virtual_key: u16, is_down: bool) {
    unsafe {
        let event = CGEventCreateKeyboardEvent(std::ptr::null_mut(), virtual_key, is_down);
        if !event.is_null() {
            CGEventPost(K_CG_HID_EVENT_TAP, event);
            CFRelease(event);
        }
    }
}
