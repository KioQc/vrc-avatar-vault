use crate::{db::Database, preferences};
use semver::Version;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};

const MANIFEST: &str = "latest.vault-update.json";
const MAX_INSTALLER: u64 = 200 * 1024 * 1024;
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Release {
    product: String,
    version: String,
    installer: String,
    sha256: String,
    size: u64,
    notes: String,
}
struct Prepared {
    token: String,
    path: PathBuf,
    release: Release,
    at: Instant,
}
#[derive(Default)]
pub struct Updates(Mutex<Option<Prepared>>);

fn validate(release: &Release) -> Result<Version, String> {
    if release.product != "local.vrc-avatar-vault.app" {
        return Err("This package is for another application".into());
    }
    let version = Version::parse(&release.version).map_err(|_| "Invalid release version")?;
    if !version.pre.is_empty() || !version.build.is_empty() {
        return Err("Only stable releases are supported".into());
    }
    if release.installer != format!("VRC-Avatar-Vault-{}-Setup.exe", release.version) {
        return Err("Unexpected installer filename".into());
    }
    if release.size == 0
        || release.size > MAX_INSTALLER
        || release.sha256.len() != 64
        || !release.sha256.bytes().all(|b| b.is_ascii_hexdigit())
    {
        return Err("Invalid installer size or SHA-256".into());
    }
    Ok(version)
}
fn read_release(folder: &Path) -> Result<Release, String> {
    let file = fs::File::open(folder.join(MANIFEST))
        .map_err(|_| "No latest.vault-update.json found in this folder")?;
    let mut bytes = Vec::new();
    file.take(65537)
        .read_to_end(&mut bytes)
        .map_err(|e| e.to_string())?;
    if bytes.len() > 65536 {
        return Err("Release manifest is too large".into());
    }
    let release: Release =
        serde_json::from_slice(&bytes).map_err(|_| "Invalid release manifest")?;
    validate(&release)?;
    Ok(release)
}
fn verify(path: &Path, release: &Release) -> Result<(), String> {
    let mut file = fs::File::open(path).map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() != release.size {
        return Err("Installer size mismatch. Download the complete package again.".into());
    }
    let mut header = [0; 2];
    file.read_exact(&mut header).map_err(|e| e.to_string())?;
    if header != *b"MZ" {
        return Err("Not a Windows executable".into());
    }
    let mut hash = Sha256::new();
    hash.update(header);
    let mut buffer = [0; 65536];
    loop {
        let n = file.read(&mut buffer).map_err(|e| e.to_string())?;
        if n == 0 {
            break;
        }
        hash.update(&buffer[..n]);
    }
    if format!("{:x}", hash.finalize()) != release.sha256.to_lowercase() {
        return Err("Installer SHA-256 mismatch. Installation blocked.".into());
    }
    Ok(())
}

#[tauri::command]
pub async fn app_updates(
    db: tauri::State<'_, Database>,
    state: tauri::State<'_, Updates>,
    operation: String,
    folder: Option<String>,
    token: Option<String>,
) -> Result<Value, String> {
    // Blocking file work runs off the UI thread. Commands are serialized by the preparation lock.
    let db = db.inner().clone();
    let mut pending = state.0.lock().map_err(|_| "Update lock unavailable")?;
    let current = env!("CARGO_PKG_VERSION");
    let selected = preferences::setting(&db, "updates.folder")?.unwrap_or_default();
    match operation.as_str() {
        "folder" => {
            let folder = folder.ok_or("Missing folder")?;
            if !folder.is_empty()
                && (!Path::new(&folder).is_absolute() || !Path::new(&folder).is_dir())
            {
                return Err("Choose an existing absolute folder".into());
            }
            db.conn.lock().map_err(|_| "Database lock unavailable")?.execute("INSERT INTO settings(key,value) VALUES('updates.folder',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [&folder]).map_err(|e| e.to_string())?;
            if let Some(old) = pending.take() {
                let _ = fs::remove_file(old.path);
            }
            Ok(json!({"folder":folder}))
        }
        "status" => {
            let mut result =
                json!({"current":current,"folder":selected,"release":null,"available":false});
            if !selected.is_empty() {
                match read_release(Path::new(&selected)) {
                    Ok(release) => {
                        result["available"] = json!(
                            validate(&release)?
                                > Version::parse(current).map_err(|e| e.to_string())?
                        );
                        result["release"] = json!(release);
                    }
                    Err(error) => result["warning"] = json!(error),
                }
            }
            Ok(result)
        }
        "prepare" => {
            let release = read_release(Path::new(&selected))?;
            if validate(&release)? <= Version::parse(current).map_err(|e| e.to_string())? {
                return Err("This version is already installed or older".into());
            }
            let source = Path::new(&selected).join(&release.installer);
            verify(&source, &release)?;
            let destination = db.root.join("updates");
            fs::create_dir_all(&destination).map_err(|e| e.to_string())?;
            let token = uuid::Uuid::new_v4().to_string();
            let staged = destination.join(format!("{token}-Setup.exe"));
            fs::copy(source, &staged).map_err(|e| e.to_string())?;
            if let Err(error) = verify(&staged, &release) {
                let _ = fs::remove_file(staged);
                return Err(error);
            }
            if let Some(old) = pending.take() {
                let _ = fs::remove_file(old.path);
            }
            *pending = Some(Prepared {
                token: token.clone(),
                path: staged,
                release: release.clone(),
                at: Instant::now(),
            });
            Ok(json!({"token":token,"release":release}))
        }
        "install" => {
            let prepared = pending.as_ref().ok_or("Verify the update first")?;
            if Some(&prepared.token) != token.as_ref()
                || prepared.at.elapsed() > Duration::from_secs(600)
            {
                return Err("Update confirmation expired. Verify the package again.".into());
            }
            verify(&prepared.path, &prepared.release)?;
            let backup = db
                .root
                .join("backups")
                .join(format!("before-install-{}.sqlite", uuid::Uuid::new_v4()));
            db.conn
                .lock()
                .map_err(|_| "Database lock unavailable")?
                .backup("main", &backup, None)
                .map_err(|e| e.to_string())?;
            let copy = rusqlite::Connection::open(&backup).map_err(|e| e.to_string())?;
            let health: String = copy
                .query_row("PRAGMA quick_check", [], |r| r.get(0))
                .map_err(|e| e.to_string())?;
            if health != "ok" {
                return Err("Safety backup verification failed".into());
            }
            std::process::Command::new(&prepared.path)
                .spawn()
                .map_err(|e| format!("Could not open the installer: {e}"))?;
            let version = prepared.release.version.clone();
            pending.take();
            Ok(json!({"backup":backup,"version":version}))
        }
        _ => Err("Unknown update action".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    fn release() -> Release {
        Release {
            product: "local.vrc-avatar-vault.app".into(),
            version: "1.2.0".into(),
            installer: "VRC-Avatar-Vault-1.2.0-Setup.exe".into(),
            sha256: format!("{:x}", Sha256::digest(b"MZtest")),
            size: 6,
            notes: "Changes".into(),
        }
    }
    #[test]
    fn rejects_other_apps_and_path_traversal() {
        let mut r = release();
        assert!(validate(&r).is_ok());
        r.installer = "../evil.exe".into();
        assert!(validate(&r).is_err());
        r = release();
        r.product = "other".into();
        assert!(validate(&r).is_err());
    }
    #[test]
    fn rejects_invalid_hash_size_and_prerelease() {
        let mut r = release();
        r.sha256 = "x".repeat(64);
        assert!(validate(&r).is_err());
        r = release();
        r.size = MAX_INSTALLER + 1;
        assert!(validate(&r).is_err());
        r = release();
        r.version = "1.2.0-beta.1".into();
        assert!(validate(&r).is_err());
    }
    #[test]
    fn tampered_installer_is_rejected() {
        let path = std::env::temp_dir().join(format!("update-test-{}", uuid::Uuid::new_v4()));
        fs::write(&path, b"MZtest").unwrap();
        assert!(verify(&path, &release()).is_ok());
        fs::write(&path, b"MZevil").unwrap();
        assert!(verify(&path, &release()).is_err());
        fs::write(&path, b"MZtruncated").unwrap();
        assert!(verify(&path, &release()).is_err());
        fs::remove_file(path).unwrap();
    }
    #[test]
    fn version_comparison_is_numeric() {
        assert!(Version::parse("0.10.0").unwrap() > Version::parse("0.9.0").unwrap());
    }
}
