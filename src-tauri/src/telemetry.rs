//! Optional aggregate reporting. Never receives request URLs, bodies, account IDs or errors.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, SystemTime, UNIX_EPOCH},
};
use tauri::Manager;

fn day() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        / 86400
}
#[derive(Default, Clone, Serialize, Deserialize)]
struct Consent {
    enabled: bool,
    credential: String,
    pending_delete: bool,
}
#[derive(Clone, Serialize)]
struct Metric {
    operation: String,
    outcome: String,
    count: u64,
    milliseconds: u64,
}
struct State {
    consent: Consent,
    session: String,
    day: u64,
    metrics: BTreeMap<String, Metric>,
    status: String,
}
pub struct Telemetry {
    state: Mutex<State>,
    gate: tokio::sync::Mutex<()>,
    path: PathBuf,
    endpoint: Option<String>,
    client: reqwest::Client,
}
pub struct Reporting(pub Arc<Telemetry>);
fn endpoint(raw: &str) -> Option<String> {
    let u = reqwest::Url::parse(raw).ok()?;
    let local =
        u.scheme() == "http" && u.host_str() == Some("127.0.0.1") && u.port() == Some(14830);
    if !(u.scheme() == "https" || local)
        || !u.username().is_empty()
        || u.password().is_some()
        || u.query().is_some()
        || u.fragment().is_some()
        || u.path() != "/"
    {
        return None;
    }
    Some(u.as_str().trim_end_matches('/').to_string())
}
impl Telemetry {
    fn open(root: PathBuf, raw: Option<&str>) -> Result<Arc<Self>, String> {
        let endpoint = raw.and_then(endpoint);
        use sha2::{Digest, Sha256};
        let suffix = format!(
            "{:x}",
            Sha256::digest(endpoint.as_deref().unwrap_or("").as_bytes())
        );
        let path = root.join(format!("participation-{}.json", &suffix[..16]));
        let consent = match std::fs::read(&path) {
            Ok(bytes) => serde_json::from_slice::<Consent>(&bytes)
                .map_err(|_| "Participation preference unreadable; reporting disabled")?,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Consent::default(),
            Err(_) => return Err("Cannot read participation preference; reporting disabled".into()),
        };
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| "Reporting client unavailable")?;
        Ok(Arc::new(Self {
            state: Mutex::new(State {
                consent,
                session: uuid::Uuid::new_v4().to_string(),
                day: day(),
                metrics: BTreeMap::new(),
                status: "Aucun envoi dans cette session".into(),
            }),
            gate: tokio::sync::Mutex::new(()),
            path,
            endpoint,
            client,
        }))
    }
    fn save(&self, consent: &Consent) -> Result<(), String> {
        let bytes =
            serde_json::to_vec(consent).map_err(|_| "Cannot encode participation preference")?;
        crate::files::atomic_write(&self.path, &bytes)
    }
    fn record(&self, operation: &str, outcome: &str, milliseconds: u64) {
        if self.endpoint.is_none()
            || ![
                "login",
                "session",
                "profile",
                "world",
                "verify2fa",
                "logout",
                "avatar",
                "rename_avatar",
            ]
            .contains(&operation)
            || !["ok", "client", "server", "rate_limit", "timeout", "network"].contains(&outcome)
        {
            return;
        }
        if let Ok(mut state) = self.state.lock() {
            if !state.consent.enabled {
                return;
            }
            if state.day != day() {
                state.day = day();
                state.metrics.clear();
            }
            let m = state
                .metrics
                .entry(format!("{operation}:{outcome}"))
                .or_insert_with(|| Metric {
                    operation: operation.into(),
                    outcome: outcome.into(),
                    count: 0,
                    milliseconds: 0,
                });
            if m.count < 1000000 {
                m.count += 1;
                m.milliseconds += milliseconds.min(60000);
            }
        }
    }
    fn snapshot(&self) -> Result<Value, String> {
        let state = self.state.lock().map_err(|_| "Participation unavailable")?;
        Ok(
            json!({"available":self.endpoint.is_some(),"endpoint":self.endpoint,"enabled":state.consent.enabled,"pendingDelete":state.consent.pending_delete,"status":state.status}),
        )
    }
    async fn send_locked(&self) -> Result<(), String> {
        let Some(endpoint) = &self.endpoint else {
            return Ok(());
        };
        let (consent, report) = {
            let mut state = self.state.lock().map_err(|_| "Participation unavailable")?;
            if state.day != day() {
                state.day = day();
                state.metrics.clear();
            }
            (
                state.consent.clone(),
                json!({"schema":1,"session":state.session,"day":state.day,"version":env!("CARGO_PKG_VERSION"),"metrics":state.metrics.values().collect::<Vec<_>>()}),
            )
        };
        if !consent.enabled && !consent.pending_delete {
            return Ok(());
        }
        let response = if consent.pending_delete {
            self.client
                .delete(format!("{endpoint}/v1/participation"))
                .bearer_auth(&consent.credential)
                .send()
                .await
        } else {
            self.client
                .post(format!("{endpoint}/v1/report"))
                .bearer_auth(&consent.credential)
                .json(&report)
                .send()
                .await
        };
        let mut state = self.state.lock().map_err(|_| "Participation unavailable")?;
        if !response.is_ok_and(|r| r.status().is_success()) {
            state.status = if consent.pending_delete {
                "Partage arrêté. Suppression distante en attente ; nouvel essai automatique."
            } else {
                "Collecteur indisponible ; nouvel essai dans 15 minutes."
            }
            .into();
            return Err(state.status.clone());
        }
        if consent.pending_delete {
            let cleared = Consent::default();
            self.save(&cleared)?;
            state.consent = cleared;
            state.status = "Participation retirée et données distantes supprimées.".into();
        } else {
            state.status = "Statistiques agrégées envoyées.".into();
        }
        Ok(())
    }
    async fn change(&self, enabled: bool) -> Result<Value, String> {
        if enabled && self.endpoint.is_none() {
            return Err("Le collecteur n’est pas encore configuré dans cette version.".into());
        }
        // Stop measurement immediately, even if a previous upload is in progress.
        if !enabled {
            let mut state = self.state.lock().map_err(|_| "Participation unavailable")?;
            let mut consent = state.consent.clone();
            consent.enabled = false;
            consent.pending_delete = !consent.credential.is_empty();
            self.save(&consent)?;
            state.consent = consent;
            state.metrics.clear();
        }
        let _gate = self.gate.lock().await;
        if enabled {
            let mut state = self.state.lock().map_err(|_| "Participation unavailable")?;
            if state.consent.pending_delete {
                return Err(
                    "Termine la suppression précédente avant de participer à nouveau.".into(),
                );
            }
            if !state.consent.enabled {
                let bytes: [u8; 32] = rand::random();
                let credential = bytes.iter().map(|b| format!("{b:02x}")).collect::<String>();
                let consent = Consent {
                    enabled: true,
                    credential,
                    pending_delete: false,
                };
                self.save(&consent)?;
                state.consent = consent;
                state.metrics.clear();
                state.session = uuid::Uuid::new_v4().to_string();
                state.day = day();
            }
        }
        let _ = self.send_locked().await;
        self.snapshot()
    }
}
pub fn start(app: &tauri::AppHandle, root: PathBuf) {
    match Telemetry::open(root, option_env!("VAV_TELEMETRY_URL")) {
        Ok(reporting) => {
            app.manage(Reporting(reporting.clone()));
            tauri::async_runtime::spawn(async move {
                loop {
                    {
                        let _gate = reporting.gate.lock().await;
                        let _ = reporting.send_locked().await;
                    }
                    tokio::time::sleep(Duration::from_secs(900)).await;
                }
            });
        }
        Err(_) => crate::logs::event(app, "Optional reporting unavailable; no data sent"),
    }
}
pub fn record(
    app: &tauri::AppHandle,
    operation: &str,
    response: &Result<reqwest::Response, reqwest::Error>,
    milliseconds: u64,
) {
    let outcome = match response {
        Ok(r) => match r.status().as_u16() {
            200..=299 => "ok",
            429 => "rate_limit",
            500..=599 => "server",
            _ => "client",
        },
        Err(e) if e.is_timeout() => "timeout",
        Err(_) => "network",
    };
    if let Some(reporting) = app.try_state::<Reporting>() {
        reporting.0.record(operation, outcome, milliseconds);
    }
}
#[tauri::command]
pub async fn participation(app: tauri::AppHandle, enabled: Option<bool>) -> Result<Value, String> {
    let reporting = app
        .try_state::<Reporting>()
        .ok_or("Participation unavailable; no data sent")?;
    if let Some(enabled) = enabled {
        reporting.0.change(enabled).await
    } else {
        reporting.0.snapshot()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn reports_and_failed_deletion_recover_after_restart() {
        use std::io::{BufRead, BufReader, Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}", listener.local_addr().unwrap());
        let server = std::thread::spawn(move || {
            let mut reports = Vec::new();
            for index in 0..4 {
                let (mut socket, _) = listener.accept().unwrap();
                socket
                    .set_read_timeout(Some(Duration::from_secs(5)))
                    .unwrap();
                let mut reader = BufReader::new(socket.try_clone().unwrap());
                let mut line = String::new();
                reader.read_line(&mut line).unwrap();
                assert!(line.starts_with(if index < 2 {
                    "POST /v1/report "
                } else {
                    "DELETE /v1/participation "
                }));
                let mut length = 0;
                loop {
                    line.clear();
                    reader.read_line(&mut line).unwrap();
                    if line == "\r\n" {
                        break;
                    }
                    if let Some(value) = line.to_lowercase().strip_prefix("content-length:") {
                        length = value.trim().parse::<usize>().unwrap();
                    }
                }
                let mut body = vec![0; length];
                reader.read_exact(&mut body).unwrap();
                if index < 2 {
                    reports.push(serde_json::from_slice::<Value>(&body).unwrap());
                }
                let status = if index == 2 {
                    "503 Unavailable"
                } else {
                    "200 OK"
                };
                write!(
                    socket,
                    "HTTP/1.1 {status}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                )
                .unwrap();
            }
            reports
        });
        let root = tempfile::tempdir().unwrap();
        let mut t = Telemetry::open(root.path().into(), None).unwrap();
        Arc::get_mut(&mut t).unwrap().endpoint = Some(url.clone());
        tauri::async_runtime::block_on(async {
            t.change(true).await.unwrap();
            t.record("avatar", "rate_limit", 321);
            t.send_locked().await.unwrap();
            t.change(false).await.unwrap();
        });
        assert!(!t.snapshot().unwrap()["enabled"].as_bool().unwrap());
        assert_eq!(t.snapshot().unwrap()["pendingDelete"], true);
        assert!(tauri::async_runtime::block_on(t.change(true)).is_err());
        let mut restarted = Telemetry::open(root.path().into(), None).unwrap();
        Arc::get_mut(&mut restarted).unwrap().endpoint = Some(url);
        tauri::async_runtime::block_on(restarted.send_locked()).unwrap();
        assert_eq!(restarted.snapshot().unwrap()["pendingDelete"], false);
        assert!(restarted
            .state
            .lock()
            .unwrap()
            .consent
            .credential
            .is_empty());
        let reports = server.join().unwrap();
        assert!(reports[0]["metrics"].as_array().unwrap().is_empty());
        assert_eq!(reports[1]["metrics"][0]["count"], 1);
        assert_eq!(reports[1]["metrics"][0]["milliseconds"], 321);
        assert_eq!(reports[1].as_object().unwrap().len(), 5);
    }
    #[test]
    fn disabled_by_default_and_allowlisted_only() {
        let root = tempfile::tempdir().unwrap();
        let t = Telemetry::open(root.path().into(), Some("http://127.0.0.1:14830")).unwrap();
        t.record("avatar", "ok", 123);
        assert!(t.state.lock().unwrap().metrics.is_empty());
        t.state.lock().unwrap().consent.enabled = true;
        t.record("avatar", "ok", 123);
        t.record("secret_url", "ok", 300);
        t.record("avatar", "secret", 100);
        assert_eq!(t.state.lock().unwrap().metrics.len(), 1);
        tauri::async_runtime::block_on(t.change(false)).unwrap();
        t.record("avatar", "ok", 10);
        assert!(t.state.lock().unwrap().metrics.is_empty());
        assert!(
            !Telemetry::open(root.path().into(), Some("http://127.0.0.1:14830"))
                .unwrap()
                .state
                .lock()
                .unwrap()
                .consent
                .enabled
        );
    }
    #[test]
    fn endpoint_and_consent_boundaries() {
        assert!(endpoint("http://example.com").is_none());
        assert!(endpoint("https://user:secret@example.com").is_none());
        assert!(endpoint("https://example.com/?token=x").is_none());
        assert!(endpoint("https://example.com").is_some());
        let root = tempfile::tempdir().unwrap();
        let t = Telemetry::open(root.path().into(), None).unwrap();
        assert_eq!(t.snapshot().unwrap()["available"], false);
        let t = Telemetry::open(root.path().into(), Some("https://one.example")).unwrap();
        t.save(&Consent {
            enabled: true,
            credential: "a".repeat(64),
            pending_delete: false,
        })
        .unwrap();
        assert!(
            !Telemetry::open(root.path().into(), Some("https://two.example"))
                .unwrap()
                .state
                .lock()
                .unwrap()
                .consent
                .enabled
        );
    }
}
