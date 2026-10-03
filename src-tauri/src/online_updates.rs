use crate::{db::Database, preferences};
use base64::Engine;
use serde::Deserialize;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use std::time::Duration;
use tauri::{Emitter, Manager};
use tauri_plugin_updater::{Update, UpdaterExt};

#[derive(Default)]
pub struct OnlineUpdates(
    tokio::sync::Mutex<Option<(Update, Option<Vec<u8>>)>>,
    std::sync::Mutex<String>,
);
impl OnlineUpdates {
    pub fn summary(&self) -> String {
        self.1
            .lock()
            .map(|s| {
                if s.is_empty() {
                    "Not checked this session".into()
                } else {
                    s.clone()
                }
            })
            .unwrap_or("Unavailable".into())
    }
}
const MAX_INSTALLER: u64 = 200 * 1024 * 1024;
#[derive(Deserialize)]
struct Artifact {
    size: u64,
    sha256: String,
}
fn artifact(raw: &Value, version: &str) -> Result<Artifact, String> {
    let parsed = semver::Version::parse(version).map_err(|_| "Invalid update version")?;
    if !parsed.pre.is_empty() || !parsed.build.is_empty() {
        return Err("Only stable updates are supported".into());
    }
    let data: Artifact = serde_json::from_value(raw["platforms"]["windows-x86_64"].clone()).map_err(|_| "Update manifest is missing installer size or SHA-256. Ask the publisher to regenerate latest.json.")?;
    if data.size < 2
        || data.size > MAX_INSTALLER
        || data.sha256.len() != 64
        || !data.sha256.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err("Invalid installer size or SHA-256 in update manifest".into());
    }
    Ok(data)
}
fn verify_bytes(bytes: &[u8], expected: &Artifact) -> Result<(), String> {
    if bytes.len() as u64 != expected.size {
        return Err("Incomplete update download: installer size does not match manifest.".into());
    }
    if format!("{:x}", Sha256::digest(bytes)) != expected.sha256.to_lowercase() {
        return Err("Update verification failed: downloaded installer does not match the expected SHA-256 hash.".into());
    }
    if !bytes.starts_with(b"MZ") {
        return Err("Update is not a Windows installer".into());
    }
    Ok(())
}
pub(crate) fn verify_signature(bytes: &[u8], encoded: &str, version: &str) -> Result<(), String> {
    let config: Value = serde_json::from_str(include_str!("../tauri.conf.json"))
        .map_err(|_| "Invalid embedded updater configuration")?;
    let decode = |v: &str| -> Result<String, String> {
        String::from_utf8(
            base64::engine::general_purpose::STANDARD
                .decode(v.trim())
                .map_err(|_| "Invalid signature encoding")?,
        )
        .map_err(|_| "Invalid signature text".into())
    };
    let key = minisign_verify::PublicKey::decode(&decode(
        config["plugins"]["updater"]["pubkey"]
            .as_str()
            .ok_or("Missing public key")?,
    )?)
    .map_err(|_| "Invalid updater public key")?;
    let signature = minisign_verify::Signature::decode(&decode(encoded)?)
        .map_err(|_| "Missing or invalid update signature")?;
    key.verify(bytes, &signature, true)
        .map_err(|_| "Update signature verification failed. Installation blocked.")?;
    // Every future update must bind its version in the cryptographically verified trusted comment.
    let mut version_bound = false;
    for part in signature.trusted_comment().split('\t') {
        if let Some(signed) = part.strip_prefix("version:") {
            version_bound = true;
            if signed.trim_start_matches('v') != version {
                return Err("Signed installer version does not match manifest".into());
            }
        }
    }
    if !version_bound {
        return Err("Update signature does not bind the installer version".into());
    }
    Ok(())
}
fn network_error(e: reqwest::Error) -> String {
    if e.is_timeout() {
        "GitHub request timed out. Retry when the connection is stable.".into()
    } else if e.is_connect() {
        "Cannot connect to GitHub. Check Internet, DNS or proxy settings.".into()
    } else {
        "GitHub download interrupted. No installer was prepared; retry the download.".into()
    }
}

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
        && url.port().is_none()
        && url.query().is_none()
        && url.fragment().is_none()
        && url.username().is_empty()
        && url.password().is_none()
        && url
            .path()
            .starts_with(&format!("/{}/{}/releases/download/", parts[0], parts[1]))
}
async fn download(app: &tauri::AppHandle, update: &Update) -> Result<Vec<u8>, String> {
    let expected = artifact(&update.raw_json, &update.version)?;
    let root = &app.state::<Database>().root;
    let dir = root.join("updates");
    std::fs::create_dir_all(&dir).map_err(|_| "Cannot create update staging folder")?;
    let mut staged = tempfile::Builder::new()
        .prefix("vav-download-")
        .suffix(".tmp")
        .tempfile_in(&dir)
        .map_err(|_| "Cannot stage update; check disk space and permissions")?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let allowed = attempt.url().scheme() == "https"
                && matches!(
                    attempt.url().host_str(),
                    Some(
                        "github.com"
                            | "release-assets.githubusercontent.com"
                            | "objects.githubusercontent.com"
                    )
                );
            if allowed && attempt.previous().len() < 5 {
                attempt.follow()
            } else {
                attempt.error("Unsafe update redirect")
            }
        }))
        .build()
        .map_err(|_| "Cannot initialize updater network client")?;
    let mut response = client
        .get(update.download_url.clone())
        .send()
        .await
        .map_err(network_error)?;
    if !response.status().is_success() {
        return Err(format!("GitHub download returned HTTP {}. Check availability or retry after the rate limit expires.", response.status().as_u16()));
    }
    if response
        .content_length()
        .is_some_and(|n| n != expected.size)
    {
        return Err("Server download size differs from release manifest".into());
    }
    let mut downloaded = 0u64;
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        downloaded = downloaded.saturating_add(chunk.len() as u64);
        if downloaded > expected.size {
            return Err("Download exceeds declared installer size; discarded".into());
        }
        staged
            .write_all(&chunk)
            .map_err(|_| "Cannot save update; check free disk space")?;
        let _ = app.emit(
            "app-update-progress",
            json!({"downloaded":downloaded,"total":expected.size}),
        );
    }
    staged
        .as_file()
        .sync_all()
        .map_err(|_| "Cannot flush downloaded update")?;
    let mut bytes = Vec::new();
    staged
        .reopen()
        .map_err(|_| "Cannot read staged update")?
        .read_to_end(&mut bytes)
        .map_err(|_| "Cannot read staged update")?;
    verify_bytes(&bytes, &expected)?;
    verify_signature(&bytes, &update.signature, &update.version)?;
    crate::logs::write(
        root,
        "INFO",
        "Updater",
        "Installer size, SHA-256 and signature verified",
    );
    // The temporary file is removed on every return. Only verified in-memory bytes reach install().
    Ok(bytes)
}
async fn operate(
    app: tauri::AppHandle,
    operation: String,
    version: Option<String>,
) -> Result<Value, String> {
    let Some(feed) = endpoint() else {
        return Ok(json!({"configured":false,"available":false}));
    };
    let state = app.state::<OnlineUpdates>();
    let mut pending = state
        .0
        .try_lock()
        .map_err(|_| "An update operation is already running. Wait for it to finish.")?;
    let db = app.state::<Database>();
    if operation == "check" {
        crate::logs::write(&db.root, "INFO", "Updater", "Update check started");
        let found = app
            .updater_builder()
            .timeout(Duration::from_secs(60))
            .build()
            .map_err(|e| e.to_string())?
            .check()
            .await
            .map_err(|e| e.to_string())?;
        if let Some(update) = found {
            artifact(&update.raw_json, &update.version)?;
            if update.signature.trim().is_empty() {
                return Err("Update signature is missing".into());
            }
            if !allowed_download(&update.download_url, &feed) {
                return Err(
                    "Update download must belong to the configured GitHub release repository"
                        .into(),
                );
            }
            if pending.as_ref().is_none_or(|(old, _)| {
                old.version != update.version
                    || old.signature != update.signature
                    || old.raw_json != update.raw_json
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
            verify_bytes(bytes, &artifact(&update.raw_json, &update.version)?)?;
            verify_signature(bytes, &update.signature, &update.version)?;
            {
                let conn = db.conn.lock().map_err(|_| "Database lock unavailable")?;
                crate::data_safety::backup(&conn, &db.root, true)?;
            }
            crate::logs::write(
                &db.root,
                "INFO",
                "Updater",
                "Verified backup created; starting installer",
            );
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

pub fn cleanup_partial(root: &std::path::Path) {
    let Ok(entries) = std::fs::read_dir(root.join("updates")) else {
        return;
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with("vav-download-")
            && name.ends_with(".tmp")
            && entry.file_type().is_ok_and(|t| t.is_file())
        {
            // Protect another running process's download; stale partials are never reused.
            if entry
                .metadata()
                .ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.elapsed().ok())
                .is_some_and(|age| age > Duration::from_secs(3600))
            {
                let _ = std::fs::remove_file(entry.path());
            }
        }
    }
}

#[cfg(test)]
mod maintenance_tests {
    use super::*;
    #[test]
    fn manifest_hash_size_and_semver_are_checked() {
        let raw = json!({"platforms":{"windows-x86_64":{"size":6,"sha256":format!("{:x}",Sha256::digest(b"MZtest"))}}});
        let expected = artifact(&raw, "0.8.3").unwrap();
        assert!(verify_bytes(b"MZtest", &expected).is_ok());
        assert!(verify_bytes(b"MZevil", &expected)
            .unwrap_err()
            .contains("SHA-256"));
        assert!(verify_bytes(b"MZ", &expected).is_err());
        assert!(artifact(&json!({}), "0.8.3").is_err());
        assert!(artifact(&raw, "").is_err());
        assert!(artifact(&raw, "0.8.3-beta.1").is_err());
        let mut invalid = raw.clone();
        invalid["platforms"]["windows-x86_64"]["sha256"] = json!("z".repeat(64));
        assert!(artifact(&invalid, "0.8.3").is_err());
        assert!(verify_signature(b"MZtest", "", "0.8.3").is_err());
        for (old, new) in [
            ("0.8.2", "0.8.3"),
            ("0.8.9", "0.8.10"),
            ("0.9.9", "1.0.0"),
            ("0.99.99", "1.0.0"),
        ] {
            assert!(semver::Version::parse(old).unwrap() < semver::Version::parse(new).unwrap());
        }
    }
}

#[cfg(test)]
mod signed_tests {
    use super::*;
    #[test]
    fn rejects_tampered_wrong_version_missing_and_invalid_signatures() {
        let bytes = include_bytes!("../tests/fixtures/update-test.bin");
        let signature = include_str!("../tests/fixtures/update-test.bin.sig");
        verify_signature(bytes, signature, "0.8.3").unwrap();
        assert!(verify_signature(b"MZwrong", signature, "0.8.3").is_err());
        assert!(verify_signature(bytes, signature, "0.9.0").is_err());
        assert!(verify_signature(bytes, "invalid", "0.8.3").is_err());
    }
}

#[tauri::command]
pub async fn online_update(
    app: tauri::AppHandle,
    operation: String,
    version: Option<String>,
) -> Result<Value, String> {
    let result = operate(app.clone(), operation.clone(), version).await;
    let state = app.state::<OnlineUpdates>();
    let message = match &result {
        Ok(value) => format!(
            "{}: {} ({})",
            operation,
            if value["ready"] == true {
                "Ready, verified"
            } else if value["available"] == true {
                "Available"
            } else {
                "No update prepared"
            },
            httpdate::fmt_http_date(std::time::SystemTime::now())
        ),
        Err(error) => format!("{} failed: {}", operation, crate::logs::sanitize(error)),
    };
    if let Ok(mut status) = state.1.lock() {
        *status = message.clone();
    }
    if let Some(db) = app.try_state::<Database>() {
        crate::logs::write(
            &db.root,
            if result.is_ok() { "INFO" } else { "ERROR" },
            "Updater",
            &message,
        );
    }
    result
}
