mod commands;
mod stories;
mod window;

use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Position the bar window at the bottom of the screen
            if let Some(bar_window) = app.get_webview_window("bar") {
                window::position_bar_at_bottom(&bar_window);
            }

            // Build tray menu
            let show = MenuItemBuilder::with_id("show", "Show News Bar").build(app)?;
            let settings = MenuItemBuilder::with_id("settings", "Settings...").build(app)?;
            let refresh = MenuItemBuilder::with_id("refresh", "Refresh Stories").build(app)?;
            let quit = MenuItemBuilder::with_id("quit", "Quit NewsFlash").build(app)?;

            let menu = MenuBuilder::new(app)
                .items(&[&show, &settings, &refresh, &quit])
                .build()?;

            let _tray = TrayIconBuilder::new()
                .menu(&menu)
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("bar") {
                            let _ = w.show();
                        }
                    }
                    "settings" => {
                        window::open_settings(app);
                    }
                    "refresh" => {
                        // Frontend handles refresh via event
                        let _ = app.emit("refresh-stories", ());
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // Start periodic story fetching
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                stories::start_fetch_loop(app_handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_stories,
            commands::refresh_stories,
            commands::dismiss_bar,
            commands::dismiss_today,
            commands::get_dismissed_date,
            commands::reset_dismissal,
            commands::get_settings,
            commands::set_setting,
            commands::set_tier,
            commands::get_feed_source,
            commands::set_feed_source,
            commands::hide_bar,
            commands::show_bar,
            commands::open_settings,
            commands::trigger_test_flash,
            commands::complete_onboarding,
            commands::get_twitter_state,
            commands::start_twitter_oauth,
            commands::disconnect_twitter,
            commands::debug_log,
            commands::snap_bar_to_right,
            commands::get_snap_info,
            commands::set_bar_position,
            commands::save_bar_y,
            commands::resize_bar,
        ])
        .run(tauri::generate_context!())
        .expect("error while running NewsFlash");
}
