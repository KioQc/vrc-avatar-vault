use crate::{
    db::Database,
    project_scan::{self, Tree},
};
use rusqlite::{Connection, OptionalExtension};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
    time::Duration,
};
pub fn now(conn: &Connection) -> Result<String, String> {
    conn.query_row("SELECT strftime('%Y-%m-%dT%H:%M:%fZ','now')", [], |r| {
        r.get(0)
    })
    .map_err(|e| e.to_string())
}
pub fn text<'a>(v: &'a Value, key: &str, max: usize) -> Result<&'a str, String> {
    let s = v[key].as_str().ok_or(format!("Missing {key}"))?;
    if s.len() > max {
        return Err(format!("{key} is too long"));
    }
    Ok(s)
}
pub fn avatar_exists(conn: &Connection, id: &str) -> Result<(), String> {
    if !conn
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM avatars WHERE id=?1)",
            [id],
            |r| r.get::<_, bool>(0),
        )
        .map_err(|e| e.to_string())?
    {
        return Err("Avatar not found".into());
    }
    Ok(())
}
pub fn validate_snapshot(data: &Value) -> Result<(), String> {
    if data["schemaVersion"] != 1 {
        return Err("Unsupported snapshot schema; protocol v1 required".into());
    }
    if !["unity_editor_plugin", "unity_asset_parser"]
        .contains(&data["source"].as_str().unwrap_or(""))
    {
        return Err("Technical snapshot must declare its Unity source".into());
    }
    if !["PC", "Quest", "iOS", "Unknown"].contains(&data["platform"].as_str().unwrap_or("")) {
        return Err("Invalid snapshot platform".into());
    }
    for key in [
        "hierarchy",
        "parameters",
        "menus",
        "controllers",
        "materials",
        "textures",
    ] {
        if let Some(v) = data.get(key) {
            if !v.is_null() && (!v.is_array() || v.as_array().is_some_and(|a| a.len() > 20000)) {
                return Err(format!("Invalid or oversized {key}"));
            }
        }
    }
    if data.to_string().len() > 8 * 1024 * 1024 {
        return Err("Snapshot exceeds 8 MB".into());
    }
    Ok(())
}
pub fn operation(db: &Database, op: &str, p: &Value) -> Result<Value, String> {
    let avatar = p["avatarId"].as_str().unwrap_or("");
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    if ![
        "session_pause",
        "session_stop",
        "session_resume",
        "session_discard",
        "batch_ignore",
        "snapshot_delete",
        "snapshot_rename",
    ]
    .contains(&op)
    {
        avatar_exists(&conn, avatar)?;
    }
    let time = now(&conn)?;
    match op {
        "watch" => {
            let enabled = p["enabled"].as_bool().ok_or("enabled required")?;
            conn.execute("INSERT INTO project_watch(avatar_id,enabled) VALUES(?1,?2) ON CONFLICT(avatar_id) DO UPDATE SET enabled=excluded.enabled",rusqlite::params![avatar,enabled]).map_err(|e|e.to_string())?;
            Ok(Value::Null)
        }
        "snapshot" => {
            let data = &p["data"];
            let kind = text(p, "kind", 40)?;
            if kind == "technical" {
                validate_snapshot(data)?;
            } else if kind != "filesystem" {
                return Err("Unknown snapshot kind".into());
            }
            if kind == "filesystem" {
                serde_json::from_value::<Tree>(data["files"].clone())
                    .map_err(|_| "Invalid filesystem snapshot")?;
            }
            let label = text(p, "label", 250)?;
            if label.trim().is_empty() {
                return Err("Snapshot label required".into());
            }
            let id = uuid::Uuid::new_v4().to_string();
            let release = p["releaseId"].as_str();
            if let Some(r) = release {
                if !conn
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM releases WHERE id=?1 AND avatar_id=?2)",
                        [r, avatar],
                        |r| r.get::<_, bool>(0),
                    )
                    .map_err(|e| e.to_string())?
                {
                    return Err("Release does not belong to avatar".into());
                }
            }
            let tx = conn.transaction().map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT INTO studio_snapshots VALUES(?1,?2,?3,?4,?5,?6,?7,1,?8,?9)",
                rusqlite::params![
                    id,
                    avatar,
                    release,
                    kind,
                    label,
                    data["platform"].as_str().unwrap_or("Unknown"),
                    data["source"].as_str().unwrap_or("filesystem"),
                    data.to_string(),
                    time
                ],
            )
            .map_err(|e| e.to_string())?;
            if kind == "filesystem" && p["baseline"] == true {
                tx.execute("INSERT INTO project_watch(avatar_id,baseline_id) VALUES(?1,?2) ON CONFLICT(avatar_id) DO UPDATE SET baseline_id=excluded.baseline_id",[avatar,&id]).map_err(|e|e.to_string())?;
            }
            tx.execute(
                "INSERT INTO activity_log VALUES(?1,?2,'snapshot',?3,?4)",
                rusqlite::params![
                    uuid::Uuid::new_v4().to_string(),
                    avatar,
                    format!("Snapshot created: {label}"),
                    time
                ],
            )
            .map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
            Ok(json!({"id":id}))
        }
        "snapshot_rename" => {
            conn.execute(
                "UPDATE studio_snapshots SET label=?1 WHERE id=?2",
                [text(p, "label", 250)?, text(p, "id", 80)?],
            )
            .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "snapshot_delete" => {
            let id = text(p, "id", 80)?;
            let tx = conn.transaction().map_err(|e| e.to_string())?;
            tx.execute(
                "UPDATE project_watch SET baseline_id=NULL WHERE baseline_id=?1",
                [id],
            )
            .map_err(|e| e.to_string())?;
            tx.execute("DELETE FROM studio_snapshots WHERE id=?1", [id])
                .map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "baseline" => {
            let id = text(p, "id", 80)?;
            if !conn.query_row("SELECT EXISTS(SELECT 1 FROM studio_snapshots WHERE id=?1 AND avatar_id=?2 AND kind='filesystem')",[id,avatar],|r|r.get::<_,bool>(0)).map_err(|e|e.to_string())?{return Err("Select a filesystem snapshot for this avatar".into());}
            conn.execute("INSERT INTO project_watch(avatar_id,baseline_id) VALUES(?1,?2) ON CONFLICT(avatar_id) DO UPDATE SET baseline_id=excluded.baseline_id",[avatar,id]).map_err(|e|e.to_string())?;
            Ok(Value::Null)
        }
        "batch_ignore" => {
            conn.execute(
                "UPDATE development_batches SET status='Ignored' WHERE id=?1",
                [text(p, "id", 80)?],
            )
            .map_err(|e| e.to_string())?;
            Ok(Value::Null)
        }
        "session_start" => {
            let id = uuid::Uuid::new_v4().to_string();
            conn.execute("INSERT INTO work_sessions VALUES(?1,?2,(SELECT custom_version FROM avatars WHERE id=?2),?3,'Running',?4,?4,NULL,0)",rusqlite::params![id,avatar,p["description"].as_str().unwrap_or(""),time]).map_err(|_|"Another session is running. Pause or stop it first.")?;
            Ok(json!({"id":id}))
        }
        "session_pause" | "session_stop" | "session_resume" | "session_discard" => {
            let id = text(p, "id", 80)?;
            if op == "session_discard" {
                conn.execute("DELETE FROM work_sessions WHERE id=?1", [id])
                    .map_err(|e| e.to_string())?;
                return Ok(Value::Null);
            }
            let status: String = conn
                .query_row("SELECT status FROM work_sessions WHERE id=?1", [id], |r| {
                    r.get(0)
                })
                .map_err(|_| "Session not found")?;
            if status == "Stopped" {
                return Err("This session is finished".into());
            }
            if status == "Running" && op != "session_resume" {
                conn.execute("UPDATE work_sessions SET duration_seconds=duration_seconds+MIN(15,MAX(0,ROUND((julianday('now')-julianday(heartbeat_at))*86400))),heartbeat_at=?1 WHERE id=?2",[&time,id]).map_err(|e|e.to_string())?;
            }
            // Only active heartbeats accrue time. Interrupted sessions end at their last heartbeat.
            let next = match op {
                "session_resume" => "Running",
                "session_pause" => "Paused",
                _ => "Stopped",
            };
            conn.execute("UPDATE work_sessions SET status=?1,ended_at=CASE WHEN ?1='Stopped' THEN heartbeat_at ELSE NULL END,heartbeat_at=CASE WHEN ?1='Running' THEN ?2 ELSE heartbeat_at END WHERE id=?3",[next,&time,id]).map_err(|_|"Another work session is running")?;
            Ok(Value::Null)
        }
        "change" => {
            let title = text(p, "title", 250)?;
            if title.trim().is_empty() {
                return Err("Title required".into());
            }
            let description = p["description"].as_str().unwrap_or("");
            if description.len() > 20000 {
                return Err("Description too long".into());
            }
            let category = p["category"].as_str().unwrap_or("Changed");
            if !["Added", "Changed", "Fixed", "Optimized", "Removed", "Other"].contains(&category) {
                return Err("Unknown category".into());
            }
            let id = uuid::Uuid::new_v4().to_string();
            let tx = conn.transaction().map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT INTO changelog_entries VALUES(?1,?2,NULL,?3,?4,'Normal','All',?5,?5)",
                rusqlite::params![id, avatar, title, description, time],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT OR IGNORE INTO changelog_categories VALUES(?1,?1)",
                [category],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT INTO changelog_entry_categories VALUES(?1,?2)",
                [&id, category],
            )
            .map_err(|e| e.to_string())?;
            tx.execute(
                "INSERT INTO activity_log VALUES(?1,?2,'change',?3,?4)",
                rusqlite::params![uuid::Uuid::new_v4().to_string(), avatar, title, time],
            )
            .map_err(|e| e.to_string())?;
            tx.commit().map_err(|e| e.to_string())?;
            Ok(json!({"id":id}))
        }
        _ => Err("Unknown studio operation".into()),
    }
}
#[tauri::command]
pub fn studio(
    db: tauri::State<Database>,
    operation_name: String,
    payload: Value,
) -> Result<Value, String> {
    operation(&db, &operation_name, &payload)
}
pub struct Worker {
    stop: Arc<AtomicBool>,
}
impl Drop for Worker {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
    }
}
struct Observation {
    path: String,
    settled: Tree,
    pending: Option<Tree>,
}
pub fn start(db: Database) -> Worker {
    if let Ok(conn) = db.conn.lock() {
        let _ = conn.execute(
            "UPDATE work_sessions SET status='Interrupted' WHERE status='Running'",
            [],
        );
    }
    let stop = Arc::new(AtomicBool::new(false));
    let flag = stop.clone();
    std::thread::spawn(move || {
        let mut observed = HashMap::<String, Observation>::new();
        let mut elapsed = std::time::Instant::now();
        while !flag.load(Ordering::Relaxed) {
            for _ in 0..10 {
                if flag.load(Ordering::Relaxed) {
                    return;
                }
                std::thread::sleep(Duration::from_millis(500));
            }
            let seconds = elapsed.elapsed().as_secs().min(15);
            elapsed = std::time::Instant::now();
            let projects: Vec<(String, String)> = match db.conn.lock() {
                Ok(conn) => {
                    let _=conn.execute("UPDATE work_sessions SET duration_seconds=duration_seconds+MIN(?1,MAX(0,ROUND((julianday('now')-julianday(heartbeat_at))*86400))),heartbeat_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status='Running'",[seconds]);
                    match conn.prepare("SELECT w.avatar_id,p.path FROM project_watch w JOIN unity_projects p ON p.avatar_id=w.avatar_id WHERE w.enabled=1") {Ok(mut st)=>st.query_map([],|r|Ok((r.get(0)?,r.get(1)?))).and_then(|rows|rows.collect()).unwrap_or_default(),Err(_)=>Vec::new()}
                }
                Err(_) => Vec::new(),
            };
            observed.retain(|id, _| projects.iter().any(|(a, _)| a == id));
            for (id, path) in projects {
                if observed.get(&id).is_some_and(|s| s.path != path) {
                    observed.remove(&id);
                }
                let old = observed
                    .get(&id)
                    .map(|v| v.settled.clone())
                    .unwrap_or_default();
                let scan = project_scan::scan(std::path::Path::new(&path), &old);
                let current = match scan {
                    Ok(v) => v,
                    Err(error) => {
                        if let Ok(conn) = db.conn.lock() {
                            let _ = conn.execute(
                                "UPDATE project_watch SET error=?1 WHERE avatar_id=?2",
                                [&error, &id],
                            );
                        }
                        continue;
                    }
                };
                if let Ok(conn) = db.conn.lock() {
                    let _=conn.execute("UPDATE project_watch SET error=NULL,last_scan=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE avatar_id=?1",[&id]);
                }
                let Some(previous) = observed.get_mut(&id) else {
                    observed.insert(
                        id,
                        Observation {
                            path,
                            settled: current,
                            pending: None,
                        },
                    );
                    continue;
                };
                if previous.pending.as_ref() != Some(&current) {
                    previous.pending = Some(current);
                    continue;
                }
                let changes = project_scan::diff(&previous.settled, &current);
                if changes.is_empty() {
                    previous.settled = current;
                    continue;
                }
                if let Ok(conn) = db.conn.lock() {
                    let existing:Option<(String,String)>=conn.query_row("SELECT id,data_json FROM development_batches WHERE avatar_id=?1 AND status='Review' ORDER BY updated_at DESC LIMIT 1",[&id],|r|Ok((r.get(0)?,r.get(1)?))).optional().unwrap_or(None);
                    let mut base = previous.settled.clone();
                    let mut batch_id = uuid::Uuid::new_v4().to_string();
                    if let Some((bid, data)) = existing {
                        if let Ok(v) = serde_json::from_str::<Value>(&data) {
                            if v["projectPath"] == path {
                                if let Ok(tree) = serde_json::from_value(v["base"].clone()) {
                                    base = tree;
                                    batch_id = bid;
                                }
                            }
                        }
                    }
                    let changes = project_scan::diff(&base, &current);
                    let data=json!({"source":"filesystem","projectPath":path,"base":base,"changes":changes}).to_string();
                    let _=conn.execute("INSERT INTO development_batches VALUES(?1,?2,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),'Review',?3) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json,updated_at=excluded.updated_at",[&batch_id,&id,&data]);
                }
                previous.settled = current;
                previous.pending = None;
            }
        }
    });
    Worker { stop }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn sessions_recover_without_counting_time_away_and_enforce_single_running() {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(include_str!("../migrations/001_initial.sql"))
            .unwrap();
        c.execute_batch(include_str!("../migrations/003_studio.sql"))
            .unwrap();
        c.execute("INSERT INTO avatars(id,name,created_at,updated_at,data_json) VALUES('a','A','now','now','{}')",[]).unwrap();
        let db = Database {
            conn: Arc::new(std::sync::Mutex::new(c)),
            root: std::path::PathBuf::new(),
        };
        let session = operation(&db, "session_start", &json!({"avatarId":"a"})).unwrap();
        let id = session["id"].as_str().unwrap();
        assert!(operation(&db, "session_start", &json!({"avatarId":"a"})).is_err());
        db.conn.lock().unwrap().execute("UPDATE work_sessions SET status='Interrupted',heartbeat_at='2020-01-01T00:00:00Z',duration_seconds=42",[]).unwrap();
        operation(&db, "session_stop", &json!({"id":id})).unwrap();
        let c = db.conn.lock().unwrap();
        let row: (i64, String) = c
            .query_row(
                "SELECT duration_seconds,ended_at FROM work_sessions",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap();
        assert_eq!(row, (42, "2020-01-01T00:00:00Z".into()));
        drop(c);
        assert!(operation(&db, "session_resume", &json!({"id":id})).is_err());
    }
    #[test]
    fn rejects_unknown_and_oversized_technical_schema() {
        assert!(validate_snapshot(&json!({"schemaVersion":2})).is_err());
        assert!(validate_snapshot(&json!({"schemaVersion":1,"source":"unity_editor_plugin","platform":"PC","parameters":{}})).is_err());
        assert!(validate_snapshot(&json!({"schemaVersion":1,"source":"unity_editor_plugin","platform":"PC","parameters":[]})).is_ok());
    }
}
