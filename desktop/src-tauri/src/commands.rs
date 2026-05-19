use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_store::StoreExt;

use crate::stories;
use crate::window;

/// Returns current stories — from cache/API, falling back to seeds.
#[tauri::command]
pub async fn get_stories(app: AppHandle) -> Result<stories::StoriesResponse, String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    let tier = store
        .get("tier")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "free".into());

    match stories::fetch_stories(&tier).await {
        Ok(response) if !response.stories.is_empty() => Ok(response),
        Ok(_) | Err(_) => {
            // Fallback to seed stories
            Ok(stories::StoriesResponse {
                date: String::new(),
                tier,
                stories: stories::seed_stories(),
                total_available: Some(5),
                is_seed_data: true,
                fallback: true,
                reason: Some("Using sample stories".into()),
            })
        }
    }
}

/// Force-refreshes stories from the API.
#[tauri::command]
pub async fn refresh_stories(app: AppHandle) -> Result<stories::StoriesResponse, String> {
    let store = app.store("settings.json").map_err(|e| e.to_string())?;
    let tier = store
        .get("tier")
        .and_then(|v| v.as_str().map(String::from))
        .unwrap_or_else(|| "free".into());
    stories::fetch_stories(&tier).await
}

/// Hides the bar window (dismiss for this session).
#[tauri::command]
pub fn dismiss_bar(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("bar") {
        w.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Hides the bar window.
#[tauri::command]
pub fn hide_bar(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("bar") {
        w.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Shows the bar window.
#[tauri::command]
pub fn show_bar(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("bar") {
        w.show().map_err(|e| e.to_string())?;
        window::position_bar_at_bottom(&w);
    }
    Ok(())
}

/// Opens the settings window.
#[tauri::command]
pub fn open_settings(app: AppHandle) -> Result<(), String> {
    window::open_settings(&app);
    Ok(())
}

/// Gets a setting value from the Tauri store.
#[tauri::command]
pub fn get_settings(app: AppHandle) -> Result<serde_json::Value, String> {
    let store = app.store("settings.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    let tier = store.get("tier").unwrap_or(serde_json::Value::String("free".into()));
    let bar_enabled = store.get("barEnabled").unwrap_or(serde_json::Value::Bool(true));
    let feed_source = store.get("feedSource").unwrap_or(serde_json::Value::String("curated".into()));
    let onboarding_shown = store.get("onboardingShown").unwrap_or(serde_json::Value::Bool(false));
    let dismissed_date = store.get("dismissedDate").unwrap_or(serde_json::Value::Null);
    let bar_y = store.get("barY").unwrap_or(serde_json::Value::Null);

    Ok(serde_json::json!({
        "tier": tier,
        "barEnabled": bar_enabled,
        "feedSource": feed_source,
        "onboardingShown": onboarding_shown,
        "dismissedDate": dismissed_date,
        "barY": bar_y,
    }))
}

/// Sets a single setting in the Tauri store.
#[tauri::command]
pub fn set_setting(app: AppHandle, key: String, value: serde_json::Value) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    store.set(&key, value);
    Ok(())
}

/// Gets the current feed source.
#[tauri::command]
pub fn get_feed_source(app: AppHandle) -> Result<String, String> {
    let store = app.store("settings.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    let source = store
        .get("feedSource")
        .and_then(|v: serde_json::Value| v.as_str().map(String::from))
        .unwrap_or_else(|| "curated".into());
    Ok(source)
}

/// Sets the feed source.
#[tauri::command]
pub fn set_feed_source(app: AppHandle, source: String) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    store.set("feedSource", serde_json::Value::String(source));
    Ok(())
}

/// Sets the user's tier (free/pro).
#[tauri::command]
pub fn set_tier(app: AppHandle, tier: String) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    store.set("tier", serde_json::Value::String(tier));
    Ok(())
}

/// Stores today's date as the dismissed date so the bar stays hidden for the rest of the day.
#[tauri::command]
pub fn dismiss_today(app: AppHandle) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    let today = today_string();
    store.set("dismissedDate", serde_json::Value::String(today));
    if let Some(w) = app.get_webview_window("bar") {
        w.hide().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Gets the dismissed date (if any).
#[tauri::command]
pub fn get_dismissed_date(app: AppHandle) -> Result<Option<String>, String> {
    let store = app.store("settings.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    let dismissed = store
        .get("dismissedDate")
        .and_then(|v| v.as_str().map(String::from));
    Ok(dismissed)
}

/// Resets the dismissed date so the bar reappears.
#[tauri::command]
pub fn reset_dismissal(app: AppHandle) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    store.set("dismissedDate", serde_json::Value::Null);
    Ok(())
}

/// Injects test stories and emits a refresh event to the bar.
#[tauri::command]
pub fn trigger_test_flash(app: AppHandle) -> Result<usize, String> {
    let test_stories = vec![
        stories::Story {
            rank: 1,
            headline: "[TEST] Breaking: Major AI breakthrough announced at surprise keynote".into(),
            detail: Some("This is a test story injected by the NewsFlash test harness. If you can see this in the bottom bar, the app is working correctly.".into()),
            sources: vec![
                stories::Source { handle: "test".into() },
                stories::Source { handle: "newsflash".into() },
            ],
            cluster_score: 0.99,
        },
        stories::Story {
            rank: 2,
            headline: "[TEST] Startup raises record seed round for quantum computing OS".into(),
            detail: Some("Another test story. The bottom bar should cycle through these every 6 seconds. Click a headline to expand details.".into()),
            sources: vec![stories::Source { handle: "demo".into() }],
            cluster_score: 0.85,
        },
        stories::Story {
            rank: 3,
            headline: "[TEST] New open-source model tops benchmarks, available today".into(),
            detail: Some("Third test story. You can dismiss the bar with the X button or press Escape. It will reappear next time you trigger the test.".into()),
            sources: vec![
                stories::Source { handle: "sample".into() },
                stories::Source { handle: "oss".into() },
            ],
            cluster_score: 0.78,
        },
    ];

    let count = test_stories.len();

    // Reset dismissal so bar shows
    let store = app.store("settings.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    store.set("dismissedDate", serde_json::Value::Null);

    let response = stories::StoriesResponse {
        date: today_string(),
        tier: "free".into(),
        stories: test_stories,
        total_available: Some(count as u32),
        is_seed_data: false,
        fallback: false,
        reason: None,
    };

    // Show the bar and emit refresh
    if let Some(w) = app.get_webview_window("bar") {
        let _ = w.show();
        window::position_bar_at_bottom(&w);
    }
    let _ = app.emit("stories-updated", &response);

    Ok(count)
}

/// Sets the onboarding as completed.
#[tauri::command]
pub fn complete_onboarding(app: AppHandle) -> Result<(), String> {
    let store = app.store("settings.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    store.set("onboardingShown", serde_json::Value::Bool(true));
    Ok(())
}

/// Gets Twitter connection state.
#[tauri::command]
pub fn get_twitter_state(app: AppHandle) -> Result<serde_json::Value, String> {
    let store = app.store("settings.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    let connected = store.get("twitterConnected").unwrap_or(serde_json::Value::Bool(false));
    let handle = store.get("twitterHandle").unwrap_or(serde_json::Value::Null);
    Ok(serde_json::json!({
        "twitterConnected": connected,
        "twitterHandle": handle,
    }))
}

/// Starts Twitter OAuth by opening the auth URL in the default browser.
#[tauri::command]
pub async fn start_twitter_oauth(app: AppHandle) -> Result<serde_json::Value, String> {
    // 1. Get the auth URL from backend
    let client = reqwest::Client::new();
    let res = client
        .get("http://localhost:3000/api/auth/twitter")
        .send()
        .await
        .map_err(|e| format!("Failed to get auth URL: {}", e))?;

    if !res.status().is_success() {
        return Err("Failed to get auth URL from backend".into());
    }

    let data: serde_json::Value = res.json().await.map_err(|e| format!("Parse error: {}", e))?;
    let url = data["url"].as_str().ok_or("No URL in response")?;

    // Extract state from the URL for polling
    let parsed = url::Url::parse(url).map_err(|e| format!("URL parse error: {}", e))?;
    let state = parsed.query_pairs()
        .find(|(k, _)| k == "state")
        .map(|(_, v)| v.to_string())
        .ok_or("No state in auth URL")?;

    // 2. Open in default browser
    let _ = app.shell().open(url, None);

    // 3. Poll the backend for completion (user completes OAuth in browser)
    let poll_url = format!("http://localhost:3000/api/auth/twitter/poll?state={}", state);
    for _ in 0..60 {
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;

        let poll_res = client.get(&poll_url).send().await;
        if let Ok(resp) = poll_res {
            if let Ok(poll_data) = resp.json::<serde_json::Value>().await {
                if poll_data["ok"].as_bool() == Some(true) {
                    // Store credentials
                    if let Ok(store) = app.store("settings.json") {
                        store.set("twitterConnected", serde_json::Value::Bool(true));
                        if let Some(handle) = poll_data["handle"].as_str() {
                            store.set("twitterHandle", serde_json::Value::String(handle.into()));
                        }
                        if let Some(token) = poll_data["accessToken"].as_str() {
                            store.set("twitterAccessToken", serde_json::Value::String(token.into()));
                        }
                        if let Some(refresh) = poll_data["refreshToken"].as_str() {
                            store.set("twitterRefreshToken", serde_json::Value::String(refresh.into()));
                        }
                    }

                    return Ok(serde_json::json!({
                        "ok": true,
                        "handle": poll_data["handle"],
                    }));
                }
            }
        }
    }

    Err("Twitter authentication timed out. Please try again.".into())
}

/// Disconnects Twitter and reverts to curated feed.
#[tauri::command]
pub async fn disconnect_twitter(app: AppHandle) -> Result<(), String> {
    // Try to notify backend
    let client = reqwest::Client::new();
    let _ = client.post("http://localhost:3000/api/auth/twitter/disconnect").send().await;

    let store = app.store("settings.json").map_err(|e: tauri_plugin_store::Error| e.to_string())?;
    store.set("twitterConnected", serde_json::Value::Bool(false));
    store.set("twitterHandle", serde_json::Value::Null);
    store.set("twitterAccessToken", serde_json::Value::Null);
    store.set("twitterRefreshToken", serde_json::Value::Null);
    store.set("feedSource", serde_json::Value::String("curated".into()));
    Ok(())
}

/// Debug logging from JS to Rust terminal.
#[tauri::command]
pub fn debug_log(msg: String) {
    eprintln!("[JS] {}", msg);
}

/// Snaps the bar window to the right edge of the screen, keeping current Y.
#[tauri::command]
pub fn snap_bar_to_right(app: AppHandle) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("bar") {
        if let Ok(Some(monitor)) = w.primary_monitor() {
            let screen = monitor.size();
            let scale = w.scale_factor().unwrap_or(1.0);
            if let Ok(size) = w.outer_size() {
                if let Ok(pos) = w.outer_position() {
                    let margin = (16.0 * scale) as i32;
                    let right_x = screen.width as i32 - size.width as i32 - margin;
                    let _ = w.set_position(tauri::PhysicalPosition::new(right_x, pos.y));
                    // Save Y position
                    let logical_y = (pos.y as f64 / scale) as i64;
                    if let Ok(store) = app.store("settings.json") {
                        store.set("barY", serde_json::json!(logical_y));
                    }
                }
            }
        }
    }
    Ok(())
}

/// Returns the current window position and the target snap X (physical pixels).
#[tauri::command]
pub fn get_snap_info(app: AppHandle) -> Result<serde_json::Value, String> {
    if let Some(w) = app.get_webview_window("bar") {
        if let Ok(Some(monitor)) = w.primary_monitor() {
            let screen = monitor.size();
            let scale = w.scale_factor().unwrap_or(1.0);
            if let Ok(size) = w.outer_size() {
                if let Ok(pos) = w.outer_position() {
                    let margin = (16.0 * scale) as i32;
                    let target_x = screen.width as i32 - size.width as i32 - margin;
                    return Ok(serde_json::json!({
                        "currentX": pos.x,
                        "currentY": pos.y,
                        "targetX": target_x,
                    }));
                }
            }
        }
    }
    Err("Could not get snap info".into())
}

/// Sets the bar window position (physical pixels).
#[tauri::command]
pub fn set_bar_position(app: AppHandle, x: i32, y: i32) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("bar") {
        let _ = w.set_position(tauri::PhysicalPosition::new(x, y));
    }
    Ok(())
}

/// Saves the bar Y position to settings.
#[tauri::command]
pub fn save_bar_y(app: AppHandle, y: i32) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("bar") {
        let scale = w.scale_factor().unwrap_or(1.0);
        let logical_y = (y as f64 / scale) as i64;
        if let Ok(store) = app.store("settings.json") {
            store.set("barY", serde_json::json!(logical_y));
        }
    }
    Ok(())
}

/// Resizes the bar window while keeping the bottom-right corner fixed.
/// `width` and `height` are in logical pixels.
#[tauri::command]
pub fn resize_bar(app: AppHandle, width: u32, height: u32) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("bar") {
        let scale = w.scale_factor().unwrap_or(1.0);
        let phys_w = (width as f64 * scale) as u32;
        let phys_h = (height as f64 * scale) as u32;

        // Get current position and size to keep bottom-right corner fixed
        if let (Ok(pos), Ok(size)) = (w.outer_position(), w.outer_size()) {
            let right_edge = pos.x + size.width as i32;
            let bottom_edge = pos.y + size.height as i32;
            let new_x = right_edge - phys_w as i32;
            let new_y = bottom_edge - phys_h as i32;

            let _ = w.set_size(tauri::PhysicalSize::new(phys_w, phys_h));
            let _ = w.set_position(tauri::PhysicalPosition::new(new_x, new_y));
        }
    }
    Ok(())
}

fn today_string() -> String {
    // Use system time to get YYYY-MM-DD
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    // Calculate date components
    let days = (now / 86400) as i64;
    let mut y = 1970i64;
    let mut remaining = days;
    loop {
        let days_in_year = if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) { 366 } else { 365 };
        if remaining < days_in_year { break; }
        remaining -= days_in_year;
        y += 1;
    }
    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let days_in_months = if leap {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut m = 0usize;
    for (i, &dim) in days_in_months.iter().enumerate() {
        if remaining < dim as i64 { m = i; break; }
        remaining -= dim as i64;
    }
    format!("{:04}-{:02}-{:02}", y, m + 1, remaining + 1)
}
