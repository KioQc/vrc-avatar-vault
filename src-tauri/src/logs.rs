use std::io::Write;
use tauri::Manager;
pub fn event(app: &tauri::AppHandle, name: &str) {
    let db = app.state::<crate::db::Database>();
    let enabled = db
        .conn
        .lock()
        .ok()
        .and_then(|c| {
            c.query_row("SELECT value FROM settings WHERE key='debug'", [], |r| {
                r.get::<_, String>(0)
            })
            .ok()
        })
        .map(|s| s == "true")
        .unwrap_or(false);
    if !enabled {
        return;
    }
    let path = db.root.join("logs/events.log");
    if std::fs::metadata(&path)
        .map(|m| m.len() > 2 * 1024 * 1024)
        .unwrap_or(false)
    {
        let _ = std::fs::rename(&path, db.root.join("logs/events.previous.log"));
    }
    if let Ok(mut file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
    {
        let time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let _ = writeln!(file, "{time} {name}");
    }
}
