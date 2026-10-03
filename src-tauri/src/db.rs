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
        if existed {
            use std::io::Read;
            let mut file = std::fs::File::open(root.join("database.sqlite"))?;
            let mut header = [0u8; 16];
            file.read_exact(&mut header).map_err(|_| {
                "Database file is empty or truncated. Original file retained; use recovery folders."
            })?;
            if &header != b"SQLite format 3\0" {
                return Err(
                    "Invalid SQLite database header. Original file retained; contact support."
                        .into(),
                );
            }
        }
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
            crate::data_safety::backup(&conn, &root, true)?;
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
        if version < 3 {
            crate::data_safety::integrity(&tx)?;
        }
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
    let conn = db.conn.lock().map_err(|_| "Database lock unavailable")?;
    let path = crate::data_safety::backup(&conn, &db.root, false)?;
    Ok(path.to_string_lossy().into())
}

#[tauri::command]
pub fn db_restore(db: tauri::State<Database>, statements: Vec<Statement>) -> Result<(), String> {
    restore(&db, statements)
}
fn restore(db: &Database, statements: Vec<Statement>) -> Result<(), String> {
    let mut conn = db.conn.lock().map_err(|_| "Database lock unavailable")?;
    crate::data_safety::backup(&conn, &db.root, false)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    for s in statements {
        tx.execute(&s.sql, rusqlite::params_from_iter(values(s.params)?))
            .map_err(|e| e.to_string())?;
    }
    crate::data_safety::integrity(&tx)?;
    tx.commit().map_err(|e| e.to_string())
}

#[cfg(test)]
mod maintenance_tests {
    use super::*;
    fn root() -> PathBuf {
        std::env::temp_dir().join(format!("vav-maintenance-{}", uuid::Uuid::new_v4()))
    }
    #[test]
    fn failed_migration_rolls_back_and_keeps_backup() {
        let root = root();
        std::fs::create_dir_all(&root).unwrap();
        let conn = Connection::open(root.join("database.sqlite")).unwrap();
        conn.execute_batch(include_str!("../migrations/001_initial.sql"))
            .unwrap();
        // Deliberate incompatible table forces the next migration to fail after transaction starts.
        conn.execute_batch("CREATE TABLE unity_dependency_snapshots(invalid TEXT); INSERT INTO settings VALUES('keep','original');").unwrap();
        drop(conn);
        assert!(Database::open_for_version(root.clone(), "0.8.3").is_err());
        let conn = Connection::open(root.join("database.sqlite")).unwrap();
        assert_eq!(
            conn.query_row("PRAGMA user_version", [], |r| r.get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            conn.query_row("SELECT value FROM settings WHERE key='keep'", [], |r| {
                r.get::<_, String>(0)
            })
            .unwrap(),
            "original"
        );
        assert_eq!(std::fs::read_dir(root.join("backups")).unwrap().count(), 1);
    }
    #[test]
    fn failed_restore_rolls_back_and_preserves_current_data() {
        let db = Database::open(root()).unwrap();
        db.conn
            .lock()
            .unwrap()
            .execute("INSERT INTO settings VALUES('keep','original')", [])
            .unwrap();
        let statements = vec![
            Statement {
                sql: "DELETE FROM settings".into(),
                params: vec![],
            },
            Statement {
                sql: "INSERT INTO missing_table VALUES(1)".into(),
                params: vec![],
            },
        ];
        assert!(restore(&db, statements).is_err());
        assert_eq!(
            db.conn
                .lock()
                .unwrap()
                .query_row("SELECT value FROM settings WHERE key='keep'", [], |r| {
                    r.get::<_, String>(0)
                })
                .unwrap(),
            "original"
        );
    }
    #[test]
    fn upgrades_080_081_082_without_losing_stored_relations() {
        for old in ["0.8.0", "0.8.1", "0.8.2"] {
            let root = root();
            let db = Database::open_for_version(root.clone(), old).unwrap();
            db.conn.lock().unwrap().execute_batch("INSERT INTO avatars(id,name,custom_version,created_at,updated_at,data_json) VALUES('a','Avatar','1.0.0','2026-10-02','2026-10-02','{}'); INSERT INTO releases VALUES('r','a','1.0.0','Release','Keep','2026-10-02','2026-10-02'); INSERT INTO settings VALUES('folder.unityProjects','C:/Users/Test/OneDrive/Projet été');").unwrap();
            db.conn.lock().unwrap().execute_batch("INSERT INTO account_profiles VALUES('profile','Test','','2026-10-02',NULL,'usr_test'); INSERT INTO unity_projects VALUES('a','C:/Test Unity','{}',NULL);").unwrap();
            std::fs::write(root.join("attachments/keep.png"), b"retained").unwrap();
            drop(db);
            let db = Database::open_for_version(root.clone(), "0.8.3").unwrap();
            let conn = db.conn.lock().unwrap();
            assert_eq!(
                conn.query_row(
                    "SELECT count(*) FROM releases WHERE avatar_id='a'",
                    [],
                    |r| r.get::<_, i64>(0)
                )
                .unwrap(),
                1
            );
            assert_eq!(
                conn.query_row(
                    "SELECT value FROM settings WHERE key='folder.unityProjects'",
                    [],
                    |r| r.get::<_, String>(0)
                )
                .unwrap(),
                "C:/Users/Test/OneDrive/Projet été"
            );
            assert_eq!(
                std::fs::read(root.join("attachments/keep.png")).unwrap(),
                b"retained"
            );
            assert_eq!(
                conn.query_row("SELECT count(*) FROM account_profiles", [], |r| r
                    .get::<_, i64>(0))
                    .unwrap(),
                1
            );
            assert_eq!(
                conn.query_row(
                    "SELECT path FROM unity_projects WHERE avatar_id='a'",
                    [],
                    |r| r.get::<_, String>(0)
                )
                .unwrap(),
                "C:/Test Unity"
            );
            crate::data_safety::integrity(&conn).unwrap();
        }
    }
}

#[cfg(test)]
mod recovery_tests {
    use super::*;
    #[test]
    fn corrupted_original_is_never_reset() {
        let root = std::env::temp_dir().join(format!("vav-corrupt-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let path = root.join("database.sqlite");
        std::fs::write(&path, b"broken database").unwrap();
        assert!(Database::open(root).is_err());
        assert_eq!(std::fs::read(path).unwrap(), b"broken database");
    }
}
