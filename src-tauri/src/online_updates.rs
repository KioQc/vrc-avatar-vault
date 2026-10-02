use crate::{db::Database, preferences};
use serde_json::{json, Value};
use std::time::Duration;
use tauri::{Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct OnlineUpdates(tokio::sync::Mutex<Option<(Update, Option<Vec<u8>>)>>);

fn endpoint() -> Option<String> {
    let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).ok()?;
    config["plugins"]["updater"]["endpoints"][0]
        .as_str()
        .map(str::to_owned)
}
fn allowed_download(url: &url::Url, feed: &str) -> bool {
    let Ok(feed) = url::Url::parse(feed) else {
        return false;
    };
    let parts: Vec<_> = feed.path().split('/').filter(|s| !s.is_empty()).collect();
    parts.len() >= 2
        && url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url.username().is_empty()
        && url.password().is_none()
        && url
            .path()
            .starts_with(&format!("/{}/{}/releases/download/", parts[0], parts[1]))
}
async fn download(app: &tauri::AppHandle, update: &Update) -> Result<Vec<u8>, String> {
    let mut downloaded = 0_u64;
    let mut last = std::time::Instant::now();
    let bytes = update
        .download(
            |size, total| {
                downloaded += size as u64;
                if last.elapsed() >= Duration::from_millis(150) {
                    let _ = app.emit(
                        "app-update-progress",
                        json!({"downloaded":downloaded,"total":total}),
                    );
                    last = std::time::Instant::now();
                }
            },
            || {},
        )
        .await
        .map_err(|e| e.to_string())?;
    let _ = app.emit(
        "app-update-progress",
        json!({"downloaded":bytes.len(),"total":bytes.len()}),
    );
    Ok(bytes)
}
#[tauri::command]
pub async fn online_update(
    app: tauri::AppHandle,
    operation: String,
    version: Option<String>,
) -> Result<Value, String> {
    let Some(feed) = endpoint() else {
        return Ok(json!({"configured":false,"available":false}));
    };
    let state = app.state::<OnlineUpdates>();
    let mut pending = state.0.lock().await;
    let db = app.state::<Database>();
    if operation == "check" {
        let found = app
            .updater_builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| e.to_string())?
            .check()
            .await
            .map_err(|e| e.to_string())?;
        if let Some(update) = found {
            if !allowed_download(&update.download_url, &feed) {
                return Err(
                    "Update download must belong to the configured GitHub release repository"
                        .into(),
                );
            }
            if pending.as_ref().is_none_or(|(old, _)| {
                old.version != update.version || old.signature != update.signature
            }) {
                *pending = Some((update, None));
            }
            if preferences::setting(&db, "updates.autoDownload")?.as_deref() != Some("false") {
                let (update, bytes) = pending.as_mut().ok_or("Missing update")?;
                if bytes.is_none() {
                    *bytes = Some(download(&app, update).await?);
                }
            }
        } else {
            *pending = None;
        }
    } else if operation == "download" || operation == "install" {
        let (update, bytes) = pending.as_mut().ok_or("Check for updates first")?;
        if version.as_ref() != Some(&update.version) {
            return Err("The available version changed. Review the update again.".into());
        }
        if operation == "download" {
            if bytes.is_none() {
                *bytes = Some(download(&app, update).await?);
            }
        } else {
            let bytes = bytes
                .as_ref()
                .ok_or("Download and verify the update first")?;
            // Only bytes returned by the official signature-verifying downloader reach installation.
            let backup = db.root.join("backups").join(format!(
                "before-online-update-{}.sqlite",
                uuid::Uuid::new_v4()
            ));
            db.conn
                .lock()
                .map_err(|_| "Database lock unavailable")?
                .backup("main", &backup, None)
                .map_err(|e| e.to_string())?;
            let saved = rusqlite::Connection::open(&backup).map_err(|e| e.to_string())?;
            let health: String = saved
                .query_row("PRAGMA quick_check", [], |r| r.get(0))
                .map_err(|e| e.to_string())?;
            if health != "ok" {
                return Err("Database safety backup verification failed".into());
            }
            update.install(bytes).map_err(|e| e.to_string())?;
        }
    } else {
        return Err("Unknown online update action".into());
    }
    Ok(match pending.as_ref() {
        Some((update, bytes)) => {
            json!({"configured":true,"available":true,"version":update.version,"notes":update.body,"ready":bytes.is_some(),"feed":feed})
        }
        None => json!({"configured":true,"available":false,"feed":feed}),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn only_configured_github_release_assets_are_allowed() {
        let feed = "https://github.com/owner/vault/releases/latest/download/latest.json";
        assert!(allowed_download(
            &"https://github.com/owner/vault/releases/download/v1.0.0/app.exe"
                .parse()
                .unwrap(),
            feed
        ));
        for url in [
            "http://github.com/owner/vault/releases/download/v1/app.exe",
            "https://evil.example/owner/vault/releases/download/v1/app.exe",
            "https://github.com/owner/other/releases/download/v1/app.exe",
            "https://github.com/owner/vault-evil/releases/download/v1/app.exe",
            "https://user:password@github.com/owner/vault/releases/download/v1/app.exe",
        ] {
            assert!(!allowed_download(&url.parse().unwrap(), feed));
        }
    }
}
