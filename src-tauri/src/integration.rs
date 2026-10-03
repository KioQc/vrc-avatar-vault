use crate::{db::Database, studio};
use serde_json::{json, Value};
use std::{
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Emitter;
const MAX_BODY: usize = 8 * 1024 * 1024;
#[derive(Default)]
pub struct Integration(pub Mutex<Option<Server>>);
pub struct Server {
    stop: Arc<AtomicBool>,
    pub port: u16,
    presence: Arc<Mutex<Value>>,
    handle: Option<std::thread::JoinHandle<()>>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::Relaxed);
        if let Some(handle) = self.handle.take() {
            let _ = handle.join();
        }
    }
}
fn credential() -> Result<keyring::Entry, String> {
    keyring::Entry::new("VRC Avatar Vault", "local-integration-token-v1")
        .map_err(|_| "Credential store unavailable".into())
}
fn token(create: bool) -> Result<String, String> {
    let e = credential()?;
    match e.get_password() {
        Ok(s) if s.len() >= 32 => Ok(s),
        _ if create => {
            let s = format!(
                "{}{}",
                uuid::Uuid::new_v4().simple(),
                uuid::Uuid::new_v4().simple()
            );
            e.set_password(&s)
                .map_err(|_| "Cannot save integration token securely")?;
            Ok(s)
        }
        _ => Err("No integration token configured".into()),
    }
}
fn equal(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |v, (a, b)| v | (a ^ b)) == 0
}
struct Request {
    method: String,
    path: String,
    body: Value,
}
fn read_request(stream: &mut TcpStream, secret: &str, port: u16) -> Result<Request, (u16, String)> {
    stream
        .set_read_timeout(Some(Duration::from_secs(3)))
        .map_err(|_| (500, "Socket error".into()))?;
    let deadline = std::time::Instant::now() + Duration::from_secs(3);
    let mut bytes = Vec::new();
    let mut byte = [0u8; 1];
    while !bytes.ends_with(b"\r\n\r\n") {
        if std::time::Instant::now() >= deadline {
            return Err((408, "Request deadline exceeded".into()));
        }
        if bytes.len() >= 16384 {
            return Err((431, "Headers too large".into()));
        }
        if stream
            .read(&mut byte)
            .map_err(|_| (408, "Request timeout".into()))?
            == 0
        {
            return Err((400, "Incomplete headers".into()));
        }
        bytes.push(byte[0]);
    }
    let header = std::str::from_utf8(&bytes).map_err(|_| (400, "Invalid headers".into()))?;
    let mut lines = header.split("\r\n");
    let first: Vec<_> = lines.next().unwrap_or("").split_whitespace().collect();
    if first.len() != 3 || !first[2].starts_with("HTTP/1.") {
        return Err((400, "Invalid request".into()));
    }
    let mut h = std::collections::HashMap::new();
    for line in lines.filter(|l| !l.is_empty()) {
        let (k, v) = line.split_once(':').ok_or((400, "Invalid header".into()))?;
        if h.insert(k.to_ascii_lowercase(), v.trim().to_string())
            .is_some()
        {
            return Err((400, "Duplicate header".into()));
        }
    }
    if h.contains_key("origin") || h.contains_key("transfer-encoding") {
        return Err((
            403,
            "Browser origins and chunked requests are not accepted".into(),
        ));
    }
    let host = h.get("host").map(String::as_str).unwrap_or("");
    if host != format!("127.0.0.1:{port}") && host != format!("localhost:{port}") {
        return Err((403, "Invalid local host".into()));
    }
    if !equal(
        h.get("authorization").map(String::as_str).unwrap_or(""),
        &format!("Bearer {secret}"),
    ) {
        return Err((401, "Invalid integration token".into()));
    }
    let len = h
        .get("content-length")
        .map(|s| s.parse::<usize>())
        .transpose()
        .map_err(|_| (400, "Invalid length".into()))?
        .unwrap_or(0);
    if len > MAX_BODY {
        return Err((413, "Body exceeds 8 MB".into()));
    }
    let method = first[0].to_string();
    let path = first[1].to_string();
    if !["GET", "POST"].contains(&method.as_str()) {
        return Err((405, "Method not allowed".into()));
    }
    if method == "POST"
        && !h
            .get("content-type")
            .is_some_and(|v| v.starts_with("application/json"))
    {
        return Err((415, "JSON content type required".into()));
    }
    let mut data = vec![0; len];
    let mut received = 0;
    while received < data.len() {
        if std::time::Instant::now() >= deadline {
            return Err((408, "Request deadline exceeded".into()));
        }
        let count = stream
            .read(&mut data[received..])
            .map_err(|_| (408, "Body timeout".into()))?;
        if count == 0 {
            return Err((400, "Incomplete body".into()));
        }
        received += count;
    }
    let body = if len == 0 {
        Value::Null
    } else {
        serde_json::from_slice(&data).map_err(|_| (400, "Invalid JSON".into()))?
    };
    Ok(Request { method, path, body })
}
fn respond(stream: &mut TcpStream, status: u16, body: Value) {
    let text = body.to_string();
    let reason = if status == 200 { "OK" } else { "Error" };
    let _ = stream.set_write_timeout(Some(Duration::from_secs(3)));
    let _=write!(stream,"HTTP/1.1 {status} {reason}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n\r\n{text}",text.len());
}
pub fn release(db: &Database, avatar: &str, p: &Value) -> Result<Value, String> {
    let version = studio::text(p, "version", 100)?;
    semver::Version::parse(version).map_err(|_| "Invalid semantic version")?;
    let title = studio::text(p, "title", 250)?;
    if title.trim().is_empty() {
        return Err("Release title required".into());
    }
    let mut conn = db.conn.lock().map_err(|e| e.to_string())?;
    studio::avatar_exists(&conn, avatar)?;
    let name: String = conn
        .query_row("SELECT name FROM avatars WHERE id=?1", [avatar], |r| {
            r.get(0)
        })
        .map_err(|e| e.to_string())?;
    let base = name
        .rsplit_once(" v")
        .filter(|(_, s)| semver::Version::parse(s).is_ok())
        .map(|(a, _)| a)
        .unwrap_or(&name);
    let id = uuid::Uuid::new_v4().to_string();
    let time = studio::now(&conn)?;
    let tx = conn.transaction().map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT INTO releases VALUES(?1,?2,?3,?4,?5,?6,?6)",
        rusqlite::params![
            id,
            avatar,
            version,
            title,
            p["description"].as_str().unwrap_or(""),
            time
        ],
    )
    .map_err(|e| e.to_string())?;
    tx.execute(
        "UPDATE avatars SET custom_version=?1,name=?2,updated_at=?3 WHERE id=?4",
        rusqlite::params![version, format!("{base} v{version}"), time, avatar],
    )
    .map_err(|e| e.to_string())?;
    if p["includeUnreleased"] == true {
        tx.execute("UPDATE changelog_entries SET release_id=?1,updated_at=?2 WHERE avatar_id=?3 AND release_id IS NULL",[&id,&time,avatar]).map_err(|e|e.to_string())?;
    }
    tx.execute("INSERT INTO release_links(release_id,avatar_id,known_issues_json,api_before) VALUES(?1,?2,(SELECT COALESCE(json_group_array(json_object('title',title,'description',description)),'[]') FROM bugs WHERE avatar_id=?2 AND known_issue=1 AND status NOT IN ('Fixed','Duplicate','Won''t Fix')),(SELECT json_extract(data_json,'$.version') FROM avatars WHERE id=?2))",[&id,avatar]).map_err(|e|e.to_string())?;
    tx.execute(
        "INSERT INTO activity_log VALUES(?1,?2,'release',?3,?4)",
        rusqlite::params![
            uuid::Uuid::new_v4().to_string(),
            avatar,
            format!("Release v{version} created from Unity"),
            time
        ],
    )
    .map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(json!({"id":id,"version":version}))
}
fn route(
    db: &Database,
    req: Request,
    app: Option<&tauri::AppHandle>,
    presence: &Arc<Mutex<Value>>,
) -> Result<Value, String> {
    let path = req.path.split('?').next().unwrap_or("");
    if req.method == "GET" && path == "/api/v1/status" {
        return Ok(
            json!({"protocolVersion":1,"appVersion":env!("CARGO_PKG_VERSION"),"capabilities":["avatars","snapshots","changes","releases","sessions","events-poll","presence"]}),
        );
    }
    if req.method == "GET" && path == "/api/v1/events" {
        let after = req
            .path
            .split_once("?after=")
            .and_then(|(_, s)| s.parse::<i64>().ok())
            .unwrap_or(0);
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let mut stmt=conn.prepare("SELECT rowid,avatar_id,type,message,created_at FROM activity_log WHERE rowid>?1 ORDER BY rowid LIMIT 200").map_err(|e|e.to_string())?;
        let events:Vec<Value>=stmt.query_map([after],|r|Ok(json!({"cursor":r.get::<_,i64>(0)?,"avatarId":r.get::<_,Option<String>>(1)?,"type":r.get::<_,String>(2)?,"message":r.get::<_,String>(3)?,"at":r.get::<_,String>(4)?}))).map_err(|e|e.to_string())?.collect::<Result<_,_>>().map_err(|e|e.to_string())?;
        return Ok(
            json!({"cursor":events.last().and_then(|v|v["cursor"].as_i64()).unwrap_or(after),"events":events}),
        );
    }
    if req.method == "GET" && path == "/api/v1/avatars" {
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        let mut st=conn.prepare("SELECT id,name,custom_version,vrchat_id FROM avatars WHERE archived=0 ORDER BY name LIMIT 1000").map_err(|e|e.to_string())?;
        let rows:Vec<Value>=st.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"version":r.get::<_,String>(2)?,"vrchatId":r.get::<_,Option<String>>(3)?}))).map_err(|e|e.to_string())?.collect::<Result<_,_>>().map_err(|e|e.to_string())?;
        return Ok(json!({"avatars":rows}));
    }
    if req.method == "POST" && path == "/api/v1/presence" {
        if req.body["protocolVersion"] != 1 {
            return Err("Incompatible protocol; version 1 required".into());
        }
        let safe = json!({"project":studio::text(&req.body,"project",250)?,"scene":studio::text(&req.body,"scene",250)?,"avatar":req.body["avatar"].as_str().unwrap_or("").chars().take(250).collect::<String>(),"at":SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs()});
        *presence.lock().map_err(|e| e.to_string())? = safe;
        return Ok(json!({"ok":true}));
    }
    let parts: Vec<_> = path.trim_matches('/').split('/').collect();
    if parts.len() >= 4 && parts[..3] == ["api", "v1", "avatars"] {
        let avatar = parts[3];
        {
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            studio::avatar_exists(&conn, avatar)?;
        }
        if req.method == "GET" && parts.len() == 4 {
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            return conn.query_row("SELECT id,name,custom_version FROM avatars WHERE id=?1",[avatar],|r|Ok(json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"version":r.get::<_,String>(2)?}))).map_err(|e|e.to_string());
        }
        if req.method == "POST" && parts.len() == 5 {
            let mut p = req.body;
            if !p.is_object() {
                return Err("JSON object required".into());
            }
            p["avatarId"] = json!(avatar);
            return match parts[4] {
                "changes" => studio::operation(db, "change", &p),
                "sessions" => studio::operation(db, "session_start", &p),
                "snapshots" => {
                    p["kind"] = json!("technical");
                    studio::operation(db, "snapshot", &p)
                }
                "releases" => release(db, avatar, &p),
                "baselines" => {
                    let path = crate::project_scan::project_path(db, avatar)?;
                    let files = crate::project_scan::scan(
                        std::path::Path::new(&path),
                        &crate::project_scan::Tree::new(),
                    )?;
                    p["kind"] = json!("filesystem");
                    p["baseline"] = json!(true);
                    p["data"] = json!({"schemaVersion":1,"source":"filesystem","projectPath":path,"files":files});
                    studio::operation(db, "snapshot", &p)
                }
                "open" => {
                    if let Some(app) = app {
                        let _ = app.emit("bridge-open", json!({"avatarId":avatar}));
                    }
                    Ok(json!({"ok":true}))
                }
                _ => Err("Unknown protocol endpoint".into()),
            };
        }
    }
    Err("Unknown protocol endpoint".into())
}
#[tauri::command]
pub fn integration_control(
    app: tauri::AppHandle,
    db: tauri::State<Database>,
    state: tauri::State<Integration>,
    operation: String,
    port: Option<u16>,
) -> Result<Value, String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if operation == "stop" {
        *guard = None;
        return Ok(json!({"running":false}));
    }
    if operation == "token" {
        return Ok(json!({"token":token(true)?}));
    }
    if operation == "rotate" {
        *guard = None;
        let secret = format!(
            "{}{}",
            uuid::Uuid::new_v4().simple(),
            uuid::Uuid::new_v4().simple()
        );
        credential()?
            .set_password(&secret)
            .map_err(|_| "Cannot rotate token")?;
        return Ok(json!({"token":secret}));
    }
    if operation == "start" && guard.is_none() {
        let port = port.unwrap_or(17861);
        if port < 1024 {
            return Err("Use a port between 1024 and 65535".into());
        }
        let listener = TcpListener::bind(("127.0.0.1", port))
            .map_err(|e| format!("Local API port unavailable: {e}"))?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let secret = token(true)?;
        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        let database = db.inner().clone();
        let presence = Arc::new(Mutex::new(Value::Null));
        let live = presence.clone();
        let handle = std::thread::spawn(move || {
            while !flag.load(Ordering::Relaxed) {
                match listener.accept() {
                    Ok((mut stream, addr)) => {
                        if !addr.ip().is_loopback() {
                            continue;
                        }
                        match read_request(&mut stream, &secret, port) {
                            Ok(req) => match route(&database, req, Some(&app), &live) {
                                Ok(v) => {
                                    let _ = app.emit("bridge-changed", ());
                                    respond(&mut stream, 200, v)
                                }
                                Err(e) => respond(&mut stream, 400, json!({"error":e})),
                            },
                            Err((status, error)) => {
                                respond(&mut stream, status, json!({"error":error}))
                            }
                        }
                    }
                    Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                        std::thread::sleep(Duration::from_millis(100))
                    }
                    Err(_) => break,
                }
            }
        });
        *guard = Some(Server {
            stop,
            port,
            presence,
            handle: Some(handle),
        });
    }
    Ok(guard.as_ref().map(|s|json!({"running":true,"port":s.port,"protocolVersion":1,"presence":s.presence.lock().ok().map(|v|v.clone())})).unwrap_or(json!({"running":false,"protocolVersion":1})))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn protocol_writes_snapshot_change_release_and_rejects_cross_avatar_links() {
        let root =
            std::env::temp_dir().join(format!("vault-protocol-test-{}", uuid::Uuid::new_v4()));
        let db = Database::open(root).unwrap();
        {
            let c = db.conn.lock().unwrap();
            c.execute("INSERT INTO avatars(id,name,created_at,updated_at,data_json) VALUES('avatar','Demo','2026-01-01','2026-01-01','{}')",[]).unwrap();
        }
        let live = Arc::new(Mutex::new(Value::Null));
        let post = |path: &str, body: Value| {
            route(
                &db,
                Request {
                    method: "POST".into(),
                    path: path.into(),
                    body,
                },
                None,
                &live,
            )
        };
        assert!(post(
            "/api/v1/avatars/avatar/changes",
            json!({"title":"Added glasses","category":"Added"})
        )
        .is_ok());
        let release = post(
            "/api/v1/avatars/avatar/releases",
            json!({"title":"First","version":"1.0.0","includeUnreleased":true}),
        )
        .unwrap();
        let payload = json!({"label":"Unity snapshot","releaseId":release["id"],"data":{"schemaVersion":1,"source":"unity_editor_plugin","platform":"PC","parameters":[]}});
        assert!(post("/api/v1/avatars/avatar/snapshots", payload).is_ok());
        assert!(post("/api/v1/avatars/avatar/snapshots",json!({"label":"bad","releaseId":"other","data":{"schemaVersion":1,"source":"unity_editor_plugin","platform":"PC"}})).is_err());
        assert!(post(
            "/api/v1/avatars/avatar/releases",
            json!({"title":"Duplicate","version":"1.0.0"})
        )
        .is_err());
        let c = db.conn.lock().unwrap();
        assert_eq!(
            c.query_row("SELECT count(*) FROM studio_snapshots", [], |r| r
                .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            c.query_row(
                "SELECT count(*) FROM changelog_entries WHERE release_id IS NOT NULL",
                [],
                |r| r.get::<_, i64>(0)
            )
            .unwrap(),
            1
        );
    }
    #[test]
    fn rejects_missing_auth_origin_and_oversized_body() {
        for (extra, expected) in [
            ("", 401),
            (
                "Authorization: Bearer token\r\nOrigin: http://evil.invalid\r\n",
                403,
            ),
            (
                "Authorization: Bearer token\r\nContent-Length: 9000000\r\n",
                413,
            ),
        ] {
            let l = TcpListener::bind("127.0.0.1:0").unwrap();
            let port = l.local_addr().unwrap().port();
            let input =
                format!("GET /api/v1/status HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\n{extra}\r\n");
            let sender = std::thread::spawn(move || {
                let mut c = TcpStream::connect(("127.0.0.1", port)).unwrap();
                c.write_all(input.as_bytes()).unwrap();
            });
            let (mut c, _) = l.accept().unwrap();
            assert_eq!(
                read_request(&mut c, "token", port).err().unwrap().0,
                expected
            );
            sender.join().unwrap();
        }
    }
    #[test]
    fn authenticated_protocol_status_is_versioned() {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = l.local_addr().unwrap().port();
        let sender = std::thread::spawn(move || {
            let mut c = TcpStream::connect(("127.0.0.1", port)).unwrap();
            write!(c,"GET /api/v1/status HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nAuthorization: Bearer token\r\n\r\n").unwrap();
        });
        let (mut c, _) = l.accept().unwrap();
        let req =
            read_request(&mut c, "token", port).unwrap_or_else(|_| panic!("Request rejected"));
        assert_eq!(req.path, "/api/v1/status");
        sender.join().unwrap();
    }
}
