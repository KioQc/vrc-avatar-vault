use rusqlite::{
    types::{Value as SqlValue, ValueRef},
    Connection, OptionalExtension,
};
use serde::Deserialize;
use serde_json::Value;
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
#[derive(Clone)]
pub struct Database {
    pub conn: Arc<Mutex<Connection>>,
    pub root: PathBuf,
}
#[derive(Deserialize)]
pub struct Statement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<Value>,
}
fn values(p: Vec<Value>) -> Result<Vec<SqlValue>, String> {
    p.into_iter()
        .map(|v| match v {
            Value::Null => Ok(SqlValue::Null),
            Value::Bool(b) => Ok(SqlValue::Integer(b as i64)),
            Value::Number(n) => n
                .as_i64()
                .map(SqlValue::Integer)
                .or_else(|| n.as_f64().map(SqlValue::Real))
                .ok_or("Invalid number".into()),
            Value::String(s) => Ok(SqlValue::Text(s)),
            _ => Err("SQL parameters must be scalar".into()),
        })
        .collect()
}
impl Database {
    pub fn open(root: PathBuf) -> Result<Self, Box<dyn std::error::Error>> {
        Self::open_for_version(root, env!("CARGO_PKG_VERSION"))
    }
    fn open_for_version(
        root: PathBuf,
        app_version: &str,
    ) -> Result<Self, Box<dyn std::error::Error>> {
        for dir in ["attachments", "cache", "backups", "logs"] {
            std::fs::create_dir_all(root.join(dir))?;
        }
        let existed = root.join("database.sqlite").is_file();
        let mut conn = Connection::open(root.join("database.sqlite"))?;
        conn.execute_batch(
            "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
        )?;
        let version: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version > 3 {
            return Err("Database was created by a newer application version".into());
        }
        let previous: Option<String> = if version >= 1 {
            conn.query_row(
                "SELECT value FROM settings WHERE key='__app_version'",
                [],
                |r| r.get(0),
            )
            .optional()?
        } else {
            None
        };
        if existed && (version < 3 || previous.as_deref() != Some(app_version)) {
            let backup = root
                .join("backups")
                .join(format!("before-update-{}.sqlite", uuid::Uuid::new_v4()));
            // SQLite's backup API includes committed WAL pages; copying only database.sqlite would not.
            conn.backup("main", &backup, None)?;
            let copy = Connection::open(&backup)?;
            let health: String = copy.query_row("PRAGMA quick_check", [], |r| r.get(0))?;
            if health != "ok" {
                return Err("Safety backup verification failed; update stopped".into());
            }
        }
        let tx = conn.transaction()?;
        if version < 1 {
            tx.execute_batch(include_str!("../migrations/001_initial.sql"))?;
        }
        if version < 2 {
            tx.execute_batch(include_str!("../migrations/002_unity.sql"))?;
        }
        if version < 3 {
            tx.execute_batch(include_str!("../migrations/003_studio.sql"))?;
        }
        tx.execute("INSERT INTO settings(key,value) VALUES('__app_version',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [app_version])?;
        tx.commit()?;
        Ok(Self {
            conn: Arc::new(Mutex::new(conn)),
            root,
        })
    }
}
#[cfg(test)]
mod persistence_tests {
    use super::*;
    #[test]
    fn update_preserves_data_and_makes_one_verified_backup() {
        let root = std::env::temp_dir().join(format!("vault-update-test-{}", uuid::Uuid::new_v4()));
        let first = Database::open_for_version(root.clone(), "0.1.0").unwrap();
        first
            .conn
            .lock()
            .unwrap()
            .execute("INSERT INTO settings VALUES('test-note','keep me')", [])
            .unwrap();
        std::fs::write(root.join("attachments/test.png"), b"retained attachment").unwrap();
        drop(first);
        let upgraded = Database::open_for_version(root.clone(), "0.2.0").unwrap();
        let note: String = upgraded
            .conn
            .lock()
            .unwrap()
            .query_row(
                "SELECT value FROM settings WHERE key='test-note'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(note, "keep me");
        assert_eq!(
            std::fs::read(root.join("attachments/test.png")).unwrap(),
            b"retained attachment"
        );
        let backups: Vec<_> = std::fs::read_dir(root.join("backups"))
            .unwrap()
            .map(|x| x.unwrap().path())
            .filter(|p| p.extension().and_then(|s| s.to_str()) == Some("sqlite"))
            .collect();
        assert_eq!(backups.len(), 1);
        let saved = Connection::open(&backups[0]).unwrap();
        assert_eq!(
            saved
                .query_row(
                    "SELECT value FROM settings WHERE key='__app_version'",
                    [],
                    |r| r.get::<_, String>(0)
                )
                .unwrap(),
            "0.1.0"
        );
        assert_eq!(
            saved
                .query_row(
                    "SELECT value FROM settings WHERE key='test-note'",
                    [],
                    |r| r.get::<_, String>(0)
                )
                .unwrap(),
            "keep me"
        );
        drop(upgraded);
        let _reopened = Database::open_for_version(root.clone(), "0.2.0").unwrap();
        assert_eq!(
            std::fs::read_dir(root.join("backups"))
                .unwrap()
                .filter(|e| e
                    .as_ref()
                    .unwrap()
                    .path()
                    .extension()
                    .and_then(|s| s.to_str())
                    == Some("sqlite"))
                .count(),
            1
        );
    }
    #[test]
    fn migrates_v1_and_preserves_settings_with_backup() {
        let root =
            std::env::temp_dir().join(format!("vault-migration-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let conn = Connection::open(root.join("database.sqlite")).unwrap();
        conn.execute_batch(include_str!("../migrations/001_initial.sql"))
            .unwrap();
        conn.execute(
            "INSERT INTO settings VALUES('releaseIncrement','0.1.0')",
            [],
        )
        .unwrap();
        drop(conn);
        let db = Database::open_for_version(root.clone(), "0.4.0").unwrap();
        let conn = db.conn.lock().unwrap();
        assert_eq!(
            conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            3
        );
        assert_eq!(
            conn.query_row(
                "SELECT value FROM settings WHERE key='releaseIncrement'",
                [],
                |r| r.get::<_, String>(0)
            )
            .unwrap(),
            "0.1.0"
        );
        assert_eq!(
            conn.query_row("SELECT count(*) FROM unity_projects", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            0
        );
        assert_eq!(std::fs::read_dir(root.join("backups")).unwrap().count(), 1);
    }
    #[test]
    fn newer_database_is_refused_without_resetting_it() {
        let root = std::env::temp_dir().join(format!("vault-newer-test-{}", uuid::Uuid::new_v4()));
        let db = Database::open_for_version(root.clone(), "0.2.0").unwrap();
        db.conn
            .lock()
            .unwrap()
            .execute_batch("PRAGMA user_version=99;")
            .unwrap();
        drop(db);
        assert!(Database::open_for_version(root.clone(), "0.1.0").is_err());
        let conn = Connection::open(root.join("database.sqlite")).unwrap();
        assert_eq!(
            conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            99
        );
    }
}
#[tauri::command]
pub fn db_query(db: tauri::State<Database>, statement: Statement) -> Result<Vec<Value>, String> {
    let conn = db.conn.lock().map_err(|_| "Database lock unavailable")?;
    let mut stmt = conn.prepare(&statement.sql).map_err(|e| e.to_string())?;
    if !stmt.readonly() {
        return Err("Read-only query required".into());
    }
    let names = stmt
        .column_names()
        .iter()
        .map(|n| n.to_string())
        .collect::<Vec<_>>();
    let params = values(statement.params)?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |r| {
            let mut obj = serde_json::Map::new();
            for (i, name) in names.iter().enumerate() {
                let v = match r.get_ref(i)? {
                    ValueRef::Null => Value::Null,
                    ValueRef::Integer(v) => v.into(),
                    ValueRef::Real(v) => serde_json::json!(v),
                    ValueRef::Text(v) => String::from_utf8_lossy(v).to_string().into(),
                    ValueRef::Blob(_) => Value::Null,
                };
                obj.insert(name.clone(), v);
            }
            Ok(Value::Object(obj))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}
#[tauri::command]
pub fn db_execute(db: tauri::State<Database>, statements: Vec<Statement>) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|_| "Database lock unavailable")?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for s in statements {
        tx.execute(&s.sql, rusqlite::params_from_iter(values(s.params)?))
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())
}
#[tauri::command]
pub fn safety_backup(db: tauri::State<Database>) -> Result<String, String> {
    let path = db
        .root
        .join("backups")
        .join(format!("safety-{}.sqlite", uuid::Uuid::new_v4()));
    db.conn
        .lock()
        .map_err(|_| "Database lock unavailable")?
        .backup("main", &path, None)
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into())
}
