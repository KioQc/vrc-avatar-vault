use std::{
    io::Write,
    path::Path,
    sync::{Mutex, OnceLock},
};
use tauri::Manager;
static LOCK: Mutex<()> = Mutex::new(());
const LIMIT: u64 = 1024 * 1024;
pub fn sanitize(value: &str) -> String {
    static SECRET: OnceLock<regex::Regex> = OnceLock::new();
    static PROFILE: OnceLock<regex::Regex> = OnceLock::new();
    let secret = SECRET.get_or_init(|| regex::Regex::new(r"(?i)\bauth\b|password|passwd|authorization|cookie|token|secret|api.?key|two.?factor|2fa|webhooks?/|bearer\s|gh[pousr]_|github_pat_|sk-[a-z0-9]").unwrap());
    if secret.is_match(value) {
        return "[REDACTED: sensitive diagnostic data]".into();
    }
    let profile = PROFILE
        .get_or_init(|| regex::Regex::new(r#"(?i)[a-z]:[\\/]+Users[\\/]+[^\\/\r\n\"]+"#).unwrap());
    profile
        .replace_all(value, "%USERPROFILE%")
        .chars()
        .take(32768)
        .collect()
}
pub fn write(root: &Path, level: &str, module: &str, message: &str) {
    let Ok(_guard) = LOCK.lock() else {
        return;
    };
    let dir = root.join("logs");
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }
    let path = dir.join("vav.log");
    if std::fs::metadata(&path).is_ok_and(|m| m.len() >= LIMIT) {
        let _ = std::fs::remove_file(dir.join("vav.3.log"));
        for i in (1..3).rev() {
            let _ = std::fs::rename(
                dir.join(format!("vav.{i}.log")),
                dir.join(format!("vav.{}.log", i + 1)),
            );
        }
        let _ = std::fs::rename(&path, dir.join("vav.1.log"));
    }
    let level = match level {
        "DEBUG" | "INFO" | "WARN" | "ERROR" => level,
        _ => "INFO",
    };
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let timestamp = httpdate::fmt_http_date(std::time::SystemTime::now());
        let _ = writeln!(
            file,
            "{timestamp} [{level}] [{}] {}",
            sanitize(module),
            sanitize(message).replace(['\r', '\n'], " ")
        );
    }
}
pub fn event(app: &tauri::AppHandle, name: &str) {
    if let Some(db) = app.try_state::<crate::db::Database>() {
        if crate::preferences::setting(&db, "debug")
            .ok()
            .flatten()
            .as_deref()
            == Some("true")
        {
            write(&db.root, "DEBUG", "VRChat", name);
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn removes_credentials_and_private_profile_paths() {
        for input in [
            "Authorization: Bearer example-value",
            "password=example-value",
            "{\"apiKey\":\"example-value\"}",
            "2FA\nexample-value",
            "https://discord.com/api/webhooks/123/example-value",
            "Cookie: auth=example-value",
            "localToken example-value",
        ] {
            assert!(!sanitize(input).contains("example-value"));
        }
        assert_eq!(
            sanitize(r"C:\Users\Élodie\OneDrive\Avatar"),
            r"%USERPROFILE%\OneDrive\Avatar"
        );
    }
    #[test]
    fn rotates_bounded_log_files() {
        let root = std::env::temp_dir().join(format!("vav-logs-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("logs")).unwrap();
        for _ in 0..6 {
            std::fs::write(root.join("logs/vav.log"), vec![b'x'; LIMIT as usize]).unwrap();
            write(&root, "INFO", "Test", "rotation");
        }
        assert_eq!(std::fs::read_dir(root.join("logs")).unwrap().count(), 4);
    }
}
