use crate::db::Database;
use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{collections::BTreeMap, path::Path, time::UNIX_EPOCH};
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct FileInfo {
    pub size: u64,
    pub modified: u64,
    pub hash: Option<String>,
    pub kind: String,
}
pub type Tree = BTreeMap<String, FileInfo>;
const EXTENSIONS: &[&str] = &[
    "unity",
    "prefab",
    "asset",
    "controller",
    "overridecontroller",
    "anim",
    "mat",
    "shader",
    "compute",
    "png",
    "jpg",
    "jpeg",
    "webp",
    "psd",
    "fbx",
    "blend",
    "cs",
    "asmdef",
    "meta",
    "json",
    "txt",
];
fn walk(
    root: &Path,
    path: &Path,
    old: &Tree,
    out: &mut Tree,
    budget: &mut u64,
    depth: usize,
) -> Result<(), String> {
    if depth > 48 {
        return Err("Project nesting exceeds 48 levels; scan cancelled".into());
    }
    for entry in std::fs::read_dir(path).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let file = entry.path();
        let metadata = std::fs::symlink_metadata(&file).map_err(|e| e.to_string())?;
        // Do not follow junctions or symlinks into another project or a recursive loop.
        #[cfg(windows)]
        {
            use std::os::windows::fs::MetadataExt;
            if metadata.file_attributes() & 0x400 != 0 {
                continue;
            }
        }
        if metadata.file_type().is_symlink() {
            continue;
        }
        if metadata.is_dir() {
            let name = entry.file_name().to_string_lossy().to_ascii_lowercase();
            if [
                "library",
                "temp",
                "logs",
                "obj",
                "build",
                "usersettings",
                ".vs",
                ".git",
            ]
            .contains(&name.as_str())
            {
                continue;
            }
            walk(root, &file, old, out, budget, depth + 1)?;
            continue;
        }
        let kind = file
            .extension()
            .and_then(|x| x.to_str())
            .unwrap_or("")
            .to_ascii_lowercase();
        if !EXTENSIONS.contains(&kind.as_str()) {
            continue;
        }
        if out.len() >= 50000 {
            return Err(
                "Project exceeds 50,000 tracked files; scan cancelled without changing baseline"
                    .into(),
            );
        }
        let relative = file
            .strip_prefix(root)
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let modified = metadata
            .modified()
            .map_err(|e| e.to_string())?
            .duration_since(UNIX_EPOCH)
            .map_err(|e| e.to_string())?
            .as_millis() as u64;
        let size = metadata.len();
        let previous = old.get(&relative);
        let critical = ["controller", "asset", "prefab", "mat", "json"].contains(&kind.as_str())
            && size <= 65536;
        let unchanged = previous.is_some_and(|p| p.size == size && p.modified == modified);
        let hash = if unchanged && !critical {
            previous.and_then(|p| p.hash.clone())
        } else if size <= 32 * 1024 * 1024 && *budget >= size {
            *budget -= size;
            let bytes = std::fs::read(&file).map_err(|e| e.to_string())?;
            let after = std::fs::metadata(&file).map_err(|e| e.to_string())?;
            if after.len() != size || after.modified().ok() != metadata.modified().ok() {
                return Err("Project is being written; retry after Unity finishes saving".into());
            }
            Some(format!("{:x}", Sha256::digest(bytes)))
        } else {
            None
        };
        out.insert(
            relative,
            FileInfo {
                size,
                modified,
                hash,
                kind,
            },
        );
    }
    Ok(())
}
pub fn scan(root: &Path, old: &Tree) -> Result<Tree, String> {
    if !root.join("Assets").is_dir() || !root.join("ProjectSettings").is_dir() {
        return Err("Linked Unity project unavailable".into());
    }
    let mut files = Tree::new();
    let mut budget = 64 * 1024 * 1024;
    for directory in ["Assets", "Packages", "ProjectSettings"] {
        let dir = root.join(directory);
        if dir.is_dir() {
            walk(root, &dir, old, &mut files, &mut budget, 0)?;
        }
    }
    Ok(files)
}
fn equivalent(a: &FileInfo, b: &FileInfo) -> bool {
    if let (Some(x), Some(y)) = (&a.hash, &b.hash) {
        a.size == b.size && x == y
    } else {
        a.size == b.size && a.modified == b.modified
    }
}
pub fn diff(old: &Tree, new: &Tree) -> Vec<Value> {
    let mut result = Vec::new();
    let mut moved = std::collections::BTreeSet::new();
    for (path, prev) in old {
        match new.get(path) {
            Some(next) if !equivalent(prev, next) => result.push(
                json!({"type":"Modified","path":path,"kind":next.kind,"before":prev,"after":next}),
            ),
            None => {
                let matches: Vec<_> = new
                    .iter()
                    .filter(|(p, n)| {
                        !old.contains_key(*p)
                            && prev.hash.is_some()
                            && n.hash == prev.hash
                            && n.size == prev.size
                    })
                    .collect();
                let old_count = old
                    .values()
                    .filter(|n| n.hash == prev.hash && n.size == prev.size)
                    .count();
                if matches.len() == 1 && old_count == 1 {
                    let (next, _) = matches[0];
                    moved.insert(next.clone());
                    result.push(
                        json!({"type":"Renamed","path":next,"oldPath":path,"kind":prev.kind}),
                    );
                } else {
                    result.push(json!({"type":"Deleted","path":path,"kind":prev.kind}));
                }
            }
            _ => {}
        }
    }
    for (path, info) in new {
        if !old.contains_key(path) && !moved.contains(path) {
            result.push(json!({"type":"Created","path":path,"kind":info.kind}));
        }
    }
    result
}
pub fn project_path(db: &Database, id: &str) -> Result<String, String> {
    db.conn
        .lock()
        .map_err(|e| e.to_string())?
        .query_row(
            "SELECT path FROM unity_projects WHERE avatar_id=?1",
            [id],
            |r| r.get(0),
        )
        .map_err(|_| "Link a Unity project first".into())
}
#[tauri::command]
pub fn scan_project(db: tauri::State<Database>, avatar_id: String) -> Result<Value, String> {
    let path = project_path(&db, &avatar_id)?;
    let baseline:Option<String>=db.conn.lock().map_err(|e|e.to_string())?.query_row("SELECT s.data_json FROM project_watch w JOIN studio_snapshots s ON s.id=w.baseline_id WHERE w.avatar_id=?1",[&avatar_id],|r|r.get(0)).optional().map_err(|e|e.to_string())?;
    let base: Tree = baseline
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .and_then(|v| serde_json::from_value(v["files"].clone()).ok())
        .unwrap_or_default();
    let files = scan(Path::new(&path), &base)?;
    let changes = diff(&base, &files);
    Ok(
        json!({"schemaVersion":1,"source":"filesystem","projectPath":path,"files":files,"changes":changes,"hasBaseline":!base.is_empty()}),
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detects_unique_rename_modification_and_deletion() {
        let f = FileInfo {
            size: 1,
            modified: 1,
            hash: Some("abc".into()),
            kind: "mat".into(),
        };
        let old = Tree::from([("Assets/a.mat".into(), f.clone())]);
        let new = Tree::from([("Assets/b.mat".into(), f.clone())]);
        assert_eq!(diff(&old, &new)[0]["type"], "Renamed");
        assert_eq!(diff(&old, &Tree::new())[0]["type"], "Deleted");
        let mut edited = f;
        edited.hash = Some("def".into());
        assert_eq!(
            diff(&old, &Tree::from([("Assets/a.mat".into(), edited)]))[0]["type"],
            "Modified"
        );
    }
    #[test]
    fn scans_assets_ignores_cache_and_hashes_small_critical_files() {
        let root = std::env::temp_dir().join(format!("vault-scan-{}", uuid::Uuid::new_v4()));
        for d in ["Assets/Library", "ProjectSettings", "Packages"] {
            std::fs::create_dir_all(root.join(d)).unwrap();
        }
        std::fs::write(root.join("Assets/body.mat"), "original").unwrap();
        std::fs::write(root.join("Assets/Library/skip.mat"), "skip").unwrap();
        let first = scan(&root, &Tree::new()).unwrap();
        assert_eq!(first.len(), 1);
        assert!(first["Assets/body.mat"].hash.is_some());
        assert!(diff(&first, &scan(&root, &first).unwrap()).is_empty());
        std::fs::write(root.join("Assets/body.mat"), "modified").unwrap();
        assert_eq!(diff(&first, &scan(&root, &first).unwrap()).len(), 1);
    }
}
