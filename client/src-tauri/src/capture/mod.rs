pub mod macos;

use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct DisplayInfo {
    pub id: u32,
    pub width: usize,
    pub height: usize,
    pub is_primary: bool,
}

pub fn list_displays() -> Vec<DisplayInfo> {
    #[cfg(target_os = "macos")]
    {
        macos::get_available_displays()
            .into_iter()
            .map(|d| DisplayInfo {
                id: d.id,
                width: d.width,
                height: d.height,
                is_primary: d.is_primary,
            })
            .collect()
    }

    #[cfg(not(target_os = "macos"))]
    {
        vec![DisplayInfo {
            id: 1,
            width: 1920,
            height: 1080,
            is_primary: true,
        }]
    }
}
