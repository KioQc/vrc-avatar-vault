use rusqlite::{Connection, OpenFlags};
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

pub fn integrity(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare("PRAGMA integrity_check")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    for row in rows {
        if row.map_err(|e| e.to_string())? != "ok" {
            return Err(
                "SQLite integrity check failed. Keep the original database and contact support."
                    .into(),
            );
        }
    }
    let mut foreign = conn
        .prepare("PRAGMA foreign_key_check")
        .map_err(|e| e.to_string())?;
    if foreign
        .query([])
        .map_err(|e| e.to_string())?
        .next()
        .map_err(|e| e.to_string())?
        .is_some()
    {
        return Err(
            "Database contains invalid references. Restore cancelled; original data retained."
                .into(),
        );
    }
    Ok(())
}

pub fn validate_backup(path: &Path) -> Result<(), String> {
    let mut file = fs::File::open(path).map_err(|_| "Backup is inaccessible")?;
    let mut header = [0u8; 16];
    file.read_exact(&mut header)
        .map_err(|_| "Backup is empty or incomplete")?;
    if &header != b"SQLite format 3\0" {
        return Err("Backup has an invalid SQLite header".into());
    }
    let conn = Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|_| "Backup is not readable SQLite")?;
    integrity(&conn)
}

pub fn backup(conn: &Connection, root: &Path, automatic: bool) -> Result<PathBuf, String> {
    let dir = root.join("backups");
    fs::create_dir_all(&dir)
        .map_err(|_| "Cannot create backup folder. Check permissions and free disk space.")?;
    let prefix = if automatic { "auto-verified" } else { "safety" };
    let path = dir.join(format!("{prefix}-{}.sqlite", uuid::Uuid::new_v4()));
    conn.backup("main", &path, None).map_err(|_| {
        "Database backup failed. Operation cancelled; check disk space and permissions."
    })?;
    // Make the snapshot self-contained; read-only validation must not create WAL sidecars.
    {
        let copy = Connection::open(&path).map_err(|_| "Cannot open newly created backup")?;
        copy.execute_batch("PRAGMA journal_mode=DELETE;")
            .map_err(|_| "Cannot finalize standalone backup")?;
    }
    validate_backup(&path)?;
    if automatic {
        retain_automatic(&dir, &path);
    }
    Ok(path)
}

fn retain_automatic(dir: &Path, newest: &Path) {
    let Ok(entries) = fs::read_dir(dir) else {
        return;
    };
    let mut files: Vec<_> = entries
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            let id = name
                .strip_prefix("auto-verified-")?
                .strip_suffix(".sqlite")?;
            uuid::Uuid::parse_str(id).ok()?;
            let meta = e.metadata().ok()?;
            if !e.file_type().ok()?.is_file() || e.path() == newest {
                return None;
            }
            Some((meta.modified().ok()?, e.path()))
        })
        .collect();
    files.sort_by_key(|(time, _)| std::cmp::Reverse(*time));
    // Only our own validated automatic backups are eligible. Manual and legacy copies are untouched.
    for (_, path) in files.into_iter().skip(19) {
        if validate_backup(&path).is_ok() {
            let _ = fs::remove_file(path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn backup_validates_wal_unicode_paths_and_preserves_manual_copies() {
        let root = std::env::temp_dir().join(format!("VAV été 空 {}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&root).unwrap();
        let conn = Connection::open(root.join("database.sqlite")).unwrap();
        conn.execute_batch("PRAGMA journal_mode=WAL; CREATE TABLE keep(value TEXT); INSERT INTO keep VALUES('retained');").unwrap();
        let manual = backup(&conn, &root, false).unwrap();
        for _ in 0..22 {
            backup(&conn, &root, true).unwrap();
        }
        assert!(manual.exists());
        assert_eq!(fs::read_dir(root.join("backups")).unwrap().count(), 21);
        let copy = Connection::open(manual).unwrap();
        assert_eq!(
            copy.query_row("SELECT value FROM keep", [], |r| r.get::<_, String>(0))
                .unwrap(),
            "retained"
        );
        let invalid = root.join("invalid.sqlite");
        fs::write(&invalid, b"broken").unwrap();
        assert!(validate_backup(&invalid).is_err());
        fs::write(root.join("blocked"), b"file").unwrap();
        assert!(backup(&conn, &root.join("blocked"), true).is_err());
    }
    #[test]
    fn rejects_broken_foreign_keys() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA foreign_keys=OFF; CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(id INTEGER REFERENCES parent); INSERT INTO child VALUES(12);").unwrap();
        assert!(integrity(&conn).is_err());
    }
}
