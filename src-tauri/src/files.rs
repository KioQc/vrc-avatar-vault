use crate::db::Database;
use base64::Engine;
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use tauri::Manager;
#[tauri::command]
pub fn open_community() -> Result<(), String> {
    let url = "https://discord.gg/evvAZQzjPt";
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        std::process::Command::new("rundll32.exe")
            .args(["url.dll,FileProtocolHandler", url])
            .creation_flags(0x08000000)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg(url)
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(target_os = "linux")]
    std::process::Command::new("xdg-open")
        .arg(url)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
fn attachment(root: &Path, name: &str) -> Result<PathBuf, String> {
    if name.contains('/') || name.contains('\\') || name.contains(':') || name.starts_with('.') {
        return Err("Invalid attachment name".into());
    }
    let extension = Path::new(name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    if !["png", "jpg", "jpeg", "webp"].contains(&extension) {
        return Err("Unsupported image format".into());
    }
    Ok(root.join("attachments").join(name))
}
#[tauri::command]
pub fn add_attachment(
    db: tauri::State<Database>,
    name: String,
    bytes: Vec<u8>,
) -> Result<String, String> {
    if bytes.len() > 20 * 1024 * 1024 {
        return Err("Images must be smaller than 20 MB".into());
    }
    let ext = Path::new(&name)
        .extension()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_lowercase();
    let valid = match ext.as_str() {
        "png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "jpg" | "jpeg" => bytes.starts_with(&[255, 216, 255]),
        "webp" => bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP"),
        _ => false,
    };
    if !valid {
        return Err("Image content does not match PNG, JPEG or WebP".into());
    }
    let filename = format!("{}.{}", uuid::Uuid::new_v4(), ext);
    std::fs::write(attachment(&db.root, &filename)?, bytes).map_err(|e| e.to_string())?;
    Ok(filename)
}
#[tauri::command]
pub fn file_transfer(
    db: tauri::State<Database>,
    operation: String,
    path: String,
    content: Option<String>,
) -> Result<String, String> {
    match operation.as_str() {
        "read" => {
            let p = Path::new(&path);
            if std::fs::metadata(p).map_err(|e| e.to_string())?.len() > 200 * 1024 * 1024 {
                return Err("Backup exceeds 200 MB limit".into());
            }
            std::fs::read_to_string(p).map_err(|e| e.to_string())
        }
        "write" => {
            atomic_write(
                Path::new(&path),
                content.ok_or("Missing content")?.as_bytes(),
            )?;
            Ok(String::new())
        }
        "attachment" => {
            let bytes = std::fs::read(attachment(&db.root, &path)?).map_err(|e| e.to_string())?;
            Ok(base64::engine::general_purpose::STANDARD.encode(bytes))
        }
        _ => Err("Invalid file operation".into()),
    }
}
fn osc_dir(db: &Database, user: &str) -> Result<PathBuf, String> {
    if !user.is_empty() && (!user.starts_with("usr_") || uuid::Uuid::parse_str(&user[4..]).is_err())
    {
        return Err("Connect a VRChat account to locate its OSC directory".into());
    }
    #[cfg(target_os = "windows")]
    {
        let root = crate::preferences::folder(db, "osc")?;
        Ok(if user.is_empty() {
            root
        } else {
            root.join(user).join("Avatars")
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        Err("Automatic OSC discovery is available on Windows. Import an OSC JSON file on this platform.".into())
    }
}
#[tauri::command]
pub fn read_osc(db: tauri::State<Database>, user: String, avatar: String) -> Result<Value, String> {
    if !avatar.starts_with("avtr_") || uuid::Uuid::parse_str(&avatar[5..]).is_err() {
        return Err("Invalid avatar ID".into());
    }
    let path = if user.is_empty() {
        let root = osc_dir(&db, "")?;
        let mut found = Vec::new();
        if root.exists() {
            for entry in std::fs::read_dir(root).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let name = entry.file_name().to_string_lossy().to_string();
                if !name.starts_with("usr_") || uuid::Uuid::parse_str(&name[4..]).is_err() {
                    continue;
                }
                let candidate = entry.path().join("Avatars").join(format!("{avatar}.json"));
                if candidate.is_file() {
                    found.push(candidate);
                }
            }
        }
        if found.len() > 1 {
            return Err("Multiple OSC profiles contain this avatar. Connect the matching VRChat account or import its JSON file.".into());
        }
        match found.pop() {
            Some(p) => p,
            None => return Ok(Value::Null),
        }
    } else {
        osc_dir(&db, &user)?.join(format!("{avatar}.json"))
    };
    if !path.exists() {
        return Ok(Value::Null);
    }
    if std::fs::metadata(&path).map_err(|e| e.to_string())?.len() > 5 * 1024 * 1024 {
        return Err("OSC file exceeds 5 MB".into());
    }
    parse_osc_json(&std::fs::read_to_string(path).map_err(|e| e.to_string())?)
}
fn parse_osc_json(text: &str) -> Result<Value, String> {
    serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|_| "Invalid OSC JSON".into())
}
#[cfg(test)]
mod osc_tests {
    use super::parse_osc_json;
    #[test]
    fn accepts_vrchat_utf8_bom() {
        assert_eq!(
            parse_osc_json("\u{feff}{\"parameters\":[]}").unwrap()["parameters"],
            serde_json::json!([])
        );
        assert!(parse_osc_json("not json").is_err());
    }
}
#[tauri::command]
pub fn storage_info(db: tauri::State<Database>) -> Value {
    json!({"database":db.root.join("database.sqlite"),"attachments":db.root.join("attachments"),"root":db.root})
}
#[tauri::command]
pub fn open_folder(
    app: tauri::AppHandle,
    db: tauri::State<Database>,
    kind: String,
    user: Option<String>,
) -> Result<(), String> {
    let path = if kind == "vrchat" {
        crate::game_info::root()?
    } else if kind == "osc" {
        osc_dir(&db, user.as_deref().unwrap_or(""))?
    } else {
        if !["logs", "backups", "attachments", "cache", "data"].contains(&kind.as_str()) {
            return Err("Invalid folder".into());
        }
        let root = app.path().app_data_dir().map_err(|e| e.to_string())?;
        if kind == "data" {
            root
        } else {
            root.join(kind)
        }
    };
    if !path.exists() {
        return Err("Folder does not exist yet".into());
    }
    #[cfg(target_os = "windows")]
    let program = "explorer";
    #[cfg(target_os = "linux")]
    let program = "xdg-open";
    #[cfg(target_os = "macos")]
    let program = "open";
    std::process::Command::new(program)
        .arg(path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    use std::io::Write;
    let parent = path.parent().ok_or("Missing destination directory")?;
    let mut file = tempfile::NamedTempFile::new_in(parent)
        .map_err(|_| "Cannot create temporary export file")?;
    file.write_all(bytes)
        .map_err(|_| "Export write failed; original file preserved")?;
    file.as_file()
        .sync_all()
        .map_err(|_| "Export flush failed; original file preserved")?;
    file.persist(path)
        .map_err(|_| "Cannot replace export; original file preserved")?;
    Ok(())
}
