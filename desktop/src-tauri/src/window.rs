use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Positions the bar window at the bottom-right of the primary monitor,
/// above the macOS Dock / Windows taskbar with comfortable margin.
pub fn position_bar_at_bottom(window: &tauri::WebviewWindow) {
    if let Ok(Some(monitor)) = window.primary_monitor() {
        let screen = monitor.size();
        let scale = monitor.scale_factor();

        let margin = 16.0;
        let dock_clearance = 80.0; // clears macOS Dock & Windows taskbar
        // Start collapsed — just enough for the orb + minimal padding
        let bar_width = 62.0;
        let bar_height = 62.0;

        let x = (screen.width as f64 / scale) - bar_width - margin;
        let y = (screen.height as f64 / scale) - bar_height - dock_clearance;

        let _ = window.set_size(tauri::LogicalSize::new(bar_width, bar_height));
        let _ = window.set_position(tauri::LogicalPosition::new(x, y));
    }
}

/// Opens the settings window (or focuses it if already open).
pub fn open_settings(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.set_focus();
        return;
    }

    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App("settings/index.html".into()))
        .title("NewsFlash")
        .inner_size(380.0, 580.0)
        .resizable(false)
        .center()
        .build();
}
