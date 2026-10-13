use serde::Serialize;
use core_graphics::display::CGMainDisplayID;

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGDisplayPixelsWide(display: u32) -> usize;
    fn CGDisplayPixelsHigh(display: u32) -> usize;
}

#[derive(Debug, Serialize, Clone)]
pub struct DisplayInfo {
    pub id: u32,
    pub width: usize,
    pub height: usize,
    pub is_primary: bool,
}

pub fn get_available_displays() -> Vec<DisplayInfo> {
    let main_id = unsafe { CGMainDisplayID() };
    let w = unsafe { CGDisplayPixelsWide(main_id) };
    let h = unsafe { CGDisplayPixelsHigh(main_id) };

    vec![DisplayInfo {
        id: main_id,
        width: w,
        height: h,
        is_primary: true,
    }]
}
