use crate::{db::Database, logs};
use serde_json::{json, Value};
use std::io::{Read, Write};
use tauri::Manager;

pub struct Startup {
    pub error: Option<String>,
}
#[tauri::command]
pub fn startup_status(state: tauri::State<Startup>) -> Value {
    json!({"error":state.error})
}
#[tauri::command]
pub fn recovery_folder(app: tauri::AppHandle, kind: String) -> Result<(), String> {
    let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let path = match kind.as_str() {
        "data" => root,
        "backups" | "logs" => root.join(kind),
        _ => return Err("Invalid folder".into()),
    };
    crate::preferences::open_directory(path)
}

pub fn report(db: &Database) -> Result<String, String> {
    let conn = db.conn.lock().map_err(|_| "Database lock unavailable")?;
    let schema: i64 = conn
        .query_row("PRAGMA user_version", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let health = crate::data_safety::integrity(&conn)
        .map(|_| "OK".to_string())
        .unwrap_or_else(|e| e);
    // Allowlisted operational data only. Never export settings, avatar names, profiles or credentials.
    Ok(logs::sanitize(&format!("VRC Avatar Vault Diagnostics\nVersion: {}\nOS: {}\nArchitecture: {}\nGenerated: {}\n\nDatabase: {}\nSchema: {}\nDatabase path: {}\nBackup folder: {}\nLog folder: {}\nStorage: shared AppData (installed and portable)\n",
        env!("CARGO_PKG_VERSION"), std::env::consts::OS, std::env::consts::ARCH,
        httpdate::fmt_http_date(std::time::SystemTime::now()), health, schema,
        db.root.join("database.sqlite").display(), db.root.join("backups").display(), db.root.join("logs").display())))
}

fn bundle(db: &Database, report: &str) -> Result<Vec<u8>, String> {
    let mut zip = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
    let options =
        zip::write::SimpleFileOptions::default().compression_method(zip::CompressionMethod::Stored);
    zip.start_file("diagnostics.txt", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(report.as_bytes())
        .map_err(|e| e.to_string())?;
    for name in ["vav.log", "vav.1.log", "vav.2.log", "vav.3.log"] {
        let path = db.root.join("logs").join(name);
        if !std::fs::symlink_metadata(&path).is_ok_and(|m| m.file_type().is_file()) {
            continue;
        }
        let mut text = String::new();
        std::fs::File::open(path)
            .map_err(|_| "Cannot read application log")?
            .take(1100000)
            .read_to_string(&mut text)
            .map_err(|_| "Cannot read application log")?;
        zip.start_file(format!("logs/{name}"), options)
            .map_err(|e| e.to_string())?;
        zip.write_all(logs::sanitize(&text).as_bytes())
            .map_err(|e| e.to_string())?;
    }
    Ok(zip.finish().map_err(|e| e.to_string())?.into_inner())
}

#[tauri::command]
pub async fn diagnostics(
    app: tauri::AppHandle,
    operation: String,
    path: Option<String>,
) -> Result<Value, String> {
    let db = app
        .try_state::<Database>()
        .ok_or("Database not open. Use recovery folders.")?
        .inner()
        .clone();
    if operation == "ui_error" {
        logs::write(
            &db.root,
            "ERROR",
            "Interface",
            "Unexpected interface error; reload requested or recovery screen shown",
        );
        return Ok(Value::Null);
    }
    if operation != "report" && operation != "export" {
        return Err("Unknown diagnostic operation".into());
    }
    let mut text = tauri::async_runtime::spawn_blocking({
        let db = db.clone();
        move || report(&db)
    })
    .await
    .map_err(|_| "Diagnostic task failed")??;
    let update = app
        .state::<crate::online_updates::OnlineUpdates>()
        .summary();
    let bridge = app
        .state::<crate::integration::Integration>()
        .0
        .try_lock()
        .map(|s| if s.is_some() { "Running" } else { "Stopped" })
        .unwrap_or("Busy");
    text.push_str(&format!("\nUpdater: {update}\nUnity Bridge local API: {bridge}\nProtocol: 1\nVRChat: consult account panel for authentication status; no network request made by diagnostics\n"));
    if operation == "export" {
        let path = path.ok_or("Choose a destination ZIP file")?;
        if !std::path::Path::new(&path).is_absolute() || !path.to_lowercase().ends_with(".zip") {
            return Err("Choose an absolute .zip path".into());
        }
        tauri::async_runtime::spawn_blocking(move || {
            let bytes = bundle(&db, &text)?;
            crate::files::atomic_write(std::path::Path::new(&path), &bytes)
        })
        .await
        .map_err(|_| "Support export task failed")??;
        Ok(json!({"exported":true}))
    } else {
        Ok(json!({"text":text}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn support_zip_excludes_database_and_credentials() {
        let root = std::env::temp_dir().join(format!("vav-support-{}", uuid::Uuid::new_v4()));
        let db = Database::open(root.clone()).unwrap();
        std::fs::write(
            root.join("logs/vav.log"),
            "Authorization: Bearer not-for-export",
        )
        .unwrap();
        std::fs::write(root.join("logs/private.txt"), "never-export").unwrap();
        let bytes = bundle(&db, &report(&db).unwrap()).unwrap();
        let mut zip = zip::ZipArchive::new(std::io::Cursor::new(bytes)).unwrap();
        assert_eq!(zip.len(), 2);
        assert!(zip.by_name("database.sqlite").is_err());
        let mut content = String::new();
        zip.by_name("logs/vav.log")
            .unwrap()
            .read_to_string(&mut content)
            .unwrap();
        assert!(!content.contains("not-for-export"));
    }
}
