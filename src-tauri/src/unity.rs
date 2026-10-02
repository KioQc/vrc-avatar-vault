use crate::{db::Database, preferences};
use rusqlite::OptionalExtension;
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
};
fn read(path: &Path) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    if std::fs::metadata(path).map_err(|e| e.to_string())?.len() > 4 * 1024 * 1024 {
        return Err("Unity metadata exceeds 4 MB".into());
    }
    std::fs::read_to_string(path)
        .map(Some)
        .map_err(|e| e.to_string())
}
fn scan(path: &Path) -> Result<Value, String> {
    if !path.is_absolute()
        || !["Assets", "Packages", "ProjectSettings"]
            .iter()
            .all(|d| path.join(d).is_dir())
    {
        return Err(
            "Select a Unity project containing Assets, Packages and ProjectSettings".into(),
        );
    }
    let mut warnings = Vec::new();
    let version = read(&path.join("ProjectSettings/ProjectVersion.txt"))?.and_then(|t| {
        t.lines().find_map(|l| {
            l.strip_prefix("m_EditorVersion:")
                .map(|v| v.trim().to_owned())
        })
    });
    let mut packages = BTreeMap::<String, Value>::new();
    for file in ["manifest.json", "packages-lock.json", "vpm-manifest.json"] {
        let Some(text) = read(&path.join("Packages").join(file))? else {
            continue;
        };
        let data: Value = match serde_json::from_str(text.trim_start_matches('\u{feff}')) {
            Ok(v) => v,
            Err(_) => {
                warnings.push(format!("Invalid {file}; could not read dependencies"));
                continue;
            }
        };
        for field in ["dependencies", "locked"] {
            if let Some(deps) = data[field].as_object() {
                for (id, d) in deps {
                    let version = d
                        .as_str()
                        .or_else(|| d["version"].as_str())
                        .unwrap_or("Unknown");
                    packages.insert(id.clone(), json!({"name":id,"version":version,"source":file,"type":if file == "vpm-manifest.json" {"VPM"} else {"UPM"}}));
                }
            }
        }
    }
    let sdk = packages
        .get("com.vrchat.avatars")
        .map(|v| v["version"].clone())
        .unwrap_or(Value::Null);
    Ok(
        json!({"source":"filesystem","name":path.file_name().unwrap_or_default().to_string_lossy(),"unityVersion":version,"sdkVersion":sdk,"packages":packages.values().collect::<Vec<_>>(),"warnings":warnings}),
    )
}
#[tauri::command]
pub fn unity_project(
    db: tauri::State<Database>,
    operation: String,
    avatar_id: String,
    path: Option<String>,
) -> Result<Value, String> {
    if operation == "unlink" {
        db.conn
            .lock()
            .map_err(|e| e.to_string())?
            .execute(
                "DELETE FROM unity_projects WHERE avatar_id=?1",
                [&avatar_id],
            )
            .map_err(|e| e.to_string())?;
        return Ok(Value::Null);
    }
    let old: Option<(String, String)> = db
        .conn
        .lock()
        .map_err(|e| e.to_string())?
        .query_row(
            "SELECT path,data_json FROM unity_projects WHERE avatar_id=?1",
            [&avatar_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;
    let path = PathBuf::from(if operation == "link" {
        path.ok_or("Select a project")?
    } else {
        old.as_ref().ok_or("No linked project")?.0.clone()
    });
    if operation == "folder" {
        preferences::open_directory(path)?;
        return Ok(Value::Null);
    }
    if operation == "open" {
        scan(&path)?;
        let editor = preferences::setting(&db, "folder.unityEditor")?
            .filter(|v| !v.is_empty())
            .ok_or(
                "Choose Unity.exe in Settings first. Use the editor version shown by this project.",
            )?;
        let exe = PathBuf::from(editor);
        if !exe.is_file()
            || !exe
                .file_name()
                .is_some_and(|v| v.to_string_lossy().eq_ignore_ascii_case("Unity.exe"))
        {
            return Err("Configured Unity editor is unavailable".into());
        }
        std::process::Command::new(exe)
            .arg("-projectPath")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        db.conn.lock().map_err(|e| e.to_string())?.execute("UPDATE unity_projects SET last_opened=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE avatar_id=?1", [&avatar_id]).map_err(|e| e.to_string())?;
        return Ok(Value::Null);
    }
    if !["link", "scan"].contains(&operation.as_str()) {
        return Err("Unknown project operation".into());
    }
    let data = scan(&path)?;
    let encoded = data.to_string();
    let canonical = path
        .canonicalize()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();
    let changed = old
        .as_ref()
        .is_none_or(|(p, d)| p != &canonical || d != &encoded);
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute("INSERT INTO unity_projects(avatar_id,path,data_json) VALUES(?1,?2,?3) ON CONFLICT(avatar_id) DO UPDATE SET path=excluded.path,data_json=excluded.data_json,last_opened=CASE WHEN path=excluded.path THEN last_opened ELSE NULL END", [&avatar_id,&canonical,&encoded]).map_err(|e| e.to_string())?;
    if changed {
        let snapshot = json!({"path":canonical,"project":data}).to_string();
        tx.execute("INSERT INTO unity_dependency_snapshots VALUES(?1,?2,?3,strftime('%Y-%m-%dT%H:%M:%fZ','now'))", [uuid::Uuid::new_v4().to_string(),avatar_id.clone(),snapshot]).map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO activity_log VALUES(?1,?2,'unity','Unity project dependencies recorded',strftime('%Y-%m-%dT%H:%M:%fZ','now'))", [uuid::Uuid::new_v4().to_string(),avatar_id]).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(data)
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detects_versions_packages_and_missing_data_without_guessing() {
        let path = std::env::temp_dir().join(format!("vault-unity-{}", uuid::Uuid::new_v4()));
        assert!(scan(&path).is_err());
        for d in ["Assets", "Packages", "ProjectSettings"] {
            std::fs::create_dir_all(path.join(d)).unwrap();
        }
        assert!(scan(&path).unwrap()["unityVersion"].is_null());
        std::fs::write(
            path.join("ProjectSettings/ProjectVersion.txt"),
            "m_EditorVersion: 2022.3.22f1",
        )
        .unwrap();
        std::fs::write(
            path.join("Packages/manifest.json"),
            r#"{"dependencies":{"com.test":"1.2.0"}}"#,
        )
        .unwrap();
        std::fs::write(
            path.join("Packages/vpm-manifest.json"),
            r#"{"locked":{"com.vrchat.avatars":{"version":"3.9.0"}}}"#,
        )
        .unwrap();
        let data = scan(&path).unwrap();
        assert_eq!(data["unityVersion"], "2022.3.22f1");
        assert_eq!(data["sdkVersion"], "3.9.0");
        assert_eq!(data["packages"].as_array().unwrap().len(), 2);
        std::fs::write(path.join("Packages/manifest.json"), "bad json").unwrap();
        assert_eq!(
            scan(&path).unwrap()["warnings"].as_array().unwrap().len(),
            1
        );
    }
}
