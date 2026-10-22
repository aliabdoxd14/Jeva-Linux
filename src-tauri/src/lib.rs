// Jeva — Linux port
//
// The upstream project (github.com/tearerry/Jeva) is a Tauri v2 application
// whose entire user interface is a pre-built web bundle embedded in the
// Windows binary. This crate provides the native shell that hosts it.
//
// The web UI talks to the Jellyfin / Emby / Plex REST API directly with
// `fetch()`, and only reaches for the native layer through a handful of Tauri
// plugin commands:
//
//   plugin:opener|open_url      open a link in the user's browser
//   plugin:process|restart      restart the app after an update
//   plugin:updater|check        check for a newer release
//   plugin:event|emit|listen    cross-window messaging
//   plugin:window|*             window management for the in-app title bar
//
// so the native side is intentionally thin.

use std::env;

use serde_json::json;
use tauri::Url;

/// Upstream ships a self-hosted update feed on the author's NAS that only
/// publishes Windows installers. A fork must not offer those, so the built-in
/// endpoint list is empty (the web UI treats a failed check as "no update
/// available") and a fork can point at its own feed with this variable.
const UPDATER_ENDPOINT_ENV: &str = "JEVA_UPDATER_ENDPOINT";

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build());

    // The plugin snapshots its configuration while the app is being built, so
    // the endpoint has to be injected into the app config before that happens.
    let mut context = tauri::generate_context!();
    if let Some(endpoint) = env::var(UPDATER_ENDPOINT_ENV)
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        let url: Url = endpoint
            .parse()
            .expect("JEVA_UPDATER_ENDPOINT is not a valid URL");

        let config = context.config_mut();
        let mut plugin = config
            .plugins
            .0
            .get("updater")
            .cloned()
            .filter(|value| value.is_object())
            .unwrap_or_else(|| json!({}));
        plugin["endpoints"] = json!([url.as_str()]);
        // Self-hosted feeds are commonly served over plain HTTP.
        plugin["dangerousInsecureTransportProtocol"] = json!(true);
        config.plugins.0.insert("updater".to_string(), plugin);
    }

    builder
        .run(context)
        .expect("error while building the Jeva application");
}
