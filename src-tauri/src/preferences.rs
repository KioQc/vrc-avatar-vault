use crate::db::Database;
use rusqlite::OptionalExtension;
use serde_json::{json, Value};
use std::path::PathBuf;
pub fn setting(db: &Database, key: &str) -> Result<Option<String>, String> {
    db.conn
        .lock()
        .map_err(|e| e.to_string())?
        .query_row("SELECT value FROM settings WHERE key=?1", [key], |r| {
            r.get(0)
        })
        .optional()
        .map_err(|e| e.to_string())
}
pub fn folder(db: &Database, kind: &str) -> Result<PathBuf, String> {
    if let Some(v) = setting(db, &format!("folder.{kind}"))?.filter(|v| !v.is_empty()) {
        return Ok(PathBuf::from(v));
    }
    match kind {
        "exports" | "backupExports" => Ok(db.root.join("backups")),
        "osc" => Ok(crate::game_info::root()?.join("OSC")),
        "screenshots" => Ok(PathBuf::from(
            std::env::var("USERPROFILE").map_err(|e| e.to_string())?,
        )
        .join("Pictures/VRChat")),
        "unityProjects" => Ok(PathBuf::from(
            std::env::var("USERPROFILE").map_err(|e| e.to_string())?,
        )
        .join("Documents")),
        _ => Err("Unknown folder preference".into()),
    }
}
pub fn open_directory(path: PathBuf) -> Result<(), String> {
    if !path.is_dir() {
        return Err("Folder does not exist or is disconnected".into());
    }
    std::process::Command::new("explorer.exe")
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
#[tauri::command]
pub fn path_preferences(
    db: tauri::State<Database>,
    operation: String,
    kind: Option<String>,
    path: Option<String>,
) -> Result<Value, String> {
    const KEYS: [&str; 6] = [
        "exports",
        "backupExports",
        "osc",
        "screenshots",
        "unityProjects",
        "unityEditor",
    ];
    if operation == "get" {
        let mut result = serde_json::Map::new();
        for k in KEYS {
            let value = if k == "unityEditor" {
                setting(&db, "folder.unityEditor")?.unwrap_or_default()
            } else {
                folder(&db, k)?.to_string_lossy().to_string()
            };
            result.insert(k.into(), json!({"path":value,"exists":std::path::Path::new(&value).exists(),"custom":setting(&db,&format!("folder.{k}"))?.is_some_and(|v| !v.is_empty())}));
        }
        return Ok(Value::Object(result));
    }
    let k = kind.ok_or("Missing preference")?;
    if !KEYS.contains(&k.as_str()) {
        return Err("Unknown preference".into());
    }
    if operation == "open" {
        open_directory(folder(&db, &k)?)?;
        return Ok(Value::Null);
    }
    if operation != "set" {
        return Err("Unknown operation".into());
    }
    let raw = path.unwrap_or_default();
    let value = if raw.is_empty() {
        String::new()
    } else {
        let p = PathBuf::from(raw);
        if !p.is_absolute() {
            return Err("Choose an absolute path".into());
        }
        if k == "unityEditor" {
            if !p.is_file()
                || !p
                    .file_name()
                    .is_some_and(|n| n.to_string_lossy().eq_ignore_ascii_case("Unity.exe"))
            {
                return Err("Select the Unity.exe editor executable".into());
            }
        } else if !p.is_dir() {
            return Err("Choose an existing directory".into());
        }
        p.canonicalize()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .to_string()
    };
    db.conn.lock().map_err(|e| e.to_string())?.execute("INSERT INTO settings(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [format!("folder.{k}"),value]).map_err(|e| e.to_string())?;
    Ok(Value::Null)
}
