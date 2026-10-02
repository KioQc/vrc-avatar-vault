use base64::Engine;
use reqwest::{
    cookie::{CookieStore, Jar},
    Method,
};
use serde_json::{json, Value};
use std::{
    sync::Arc,
    time::{Duration, SystemTime},
};
use tauri::Emitter;
use tokio::sync::Mutex;

const BASE: &str = "https://api.vrchat.cloud/api/1";
pub struct Api(pub Mutex<Session>);
pub struct Session {
    pub profile: String,
    client: reqwest::Client,
    jar: Arc<Jar>,
    last_request: std::time::Instant,
}
fn credential(profile: &str) -> Result<keyring::Entry, String> {
    let key = if profile == "default" {
        "vrchat-session".to_string()
    } else {
        format!("vrchat-session-{profile}")
    };
    keyring::Entry::new("VRC Avatar Vault", &key)
        .map_err(|_| "System credential store unavailable".into())
}
impl Session {
    pub fn with_profile(restore: bool, profile: &str) -> Result<Self, String> {
        if profile != "default" && uuid::Uuid::parse_str(profile).is_err() {
            return Err("Invalid account profile".into());
        }
        let jar = Arc::new(Jar::default());
        if restore {
            if let Ok(entry) = credential(profile) {
                if let Ok(cookies) = entry.get_password() {
                    for cookie in cookies.split("; ") {
                        jar.add_cookie_str(
                            &format!("{cookie}; Path=/; Secure; HttpOnly"),
                            &BASE.parse().unwrap(),
                        );
                    }
                }
            }
        }
        let client = reqwest::Client::builder()
            .cookie_provider(jar.clone())
            .timeout(Duration::from_secs(30))
            .user_agent(concat!(
                "VRC-Avatar-Vault/",
                env!("CARGO_PKG_VERSION"),
                " (local desktop avatar changelog manager)"
            ))
            .redirect(reqwest::redirect::Policy::none())
            .build()
            .map_err(|_| "HTTP client initialization failed")?;
        Ok(Self {
            profile: profile.to_string(),
            client,
            jar,
            last_request: std::time::Instant::now() - Duration::from_secs(1),
        })
    }
    fn persist(&self) -> Result<(), String> {
        if let Some(header) = self.jar.cookies(&BASE.parse().unwrap()) {
            let cookies = header
                .to_str()
                .map_err(|_| "Invalid session cookie")?
                .split("; ")
                .filter(|s| s.starts_with("auth=") || s.starts_with("twoFactorAuth="))
                .collect::<Vec<_>>()
                .join("; ");
            if !cookies.is_empty() {
                credential(&self.profile)?.set_password(&cookies).map_err(|_|"Cannot securely save session. Unlock your system credential store, then reconnect.")?;
            }
        }
        Ok(())
    }
}
fn error(status: u16) -> String {
    match status {
        400 => "Invalid request. Check the supplied values.",
        401 => "Your VRChat session expired or credentials are invalid. Reconnect in Settings.",
        403 => "VRChat denied access. This avatar may be private or unavailable to your account.",
        404 => "Avatar not found or unavailable.",
        429 => "VRChat API rate limit reached. Wait before trying again.",
        500..=599 => "VRChat is temporarily unavailable. Try again later.",
        _ => "VRChat returned an unexpected response. Check your connection and retry.",
    }
    .into()
}
pub fn retry_delay(attempt: u32, retry_after: Option<&str>, jitter: u64) -> Duration {
    if let Some(s) = retry_after {
        if let Ok(seconds) = s.parse::<u64>() {
            return Duration::from_secs(seconds);
        }
        if let Ok(time) = httpdate::parse_http_date(s) {
            return time.duration_since(SystemTime::now()).unwrap_or_default();
        }
    }
    Duration::from_millis(1000 * 2u64.pow(attempt.min(6)) + jitter.min(999))
}
fn profile_fields(result: &Value) -> Value {
    let mut safe = serde_json::Map::new();
    for key in [
        "id",
        "displayName",
        "status",
        "statusDescription",
        "bio",
        "bioLinks",
        "pronouns",
        "date_joined",
        "last_login",
        "last_platform",
        "tags",
        "userIcon",
        "profilePicOverride",
        "currentAvatar",
        "currentAvatarImageUrl",
        "currentAvatarThumbnailImageUrl",
        "allowAvatarCopying",
        "location",
        "worldId",
        "instanceId",
    ] {
        if let Some(value) = result.get(key) {
            safe.insert(key.into(), value.clone());
        }
    }
    Value::Object(safe)
}
#[tauri::command]
pub async fn vrchat(
    app: tauri::AppHandle,
    api: tauri::State<'_, Api>,
    operation: String,
    payload: Value,
) -> Result<Value, String> {
    crate::logs::event(&app, "API request started");
    let mut session = api.0.lock().await;
    let (method, path, body, authorization) = match operation.as_str() {
        "login" => {
            let username = payload["username"].as_str().ok_or("Username required")?;
            let password = payload["password"].as_str().ok_or("Password required")?;
            if username.is_empty() || password.is_empty() {
                return Err("Username and password required".into());
            }
            *session = Session::with_profile(false, &session.profile)?;
            let encoded = base64::engine::general_purpose::STANDARD.encode(format!(
                "{}:{}",
                urlencoding::encode(username),
                urlencoding::encode(password)
            ));
            (
                Method::GET,
                "/auth/user".to_string(),
                None,
                Some(format!("Basic {encoded}")),
            )
        }
        "session" => (Method::GET, "/auth/user".into(), None, None),
        "profile" => (Method::GET, "/auth/user".into(), None, None),
        "world" => {
            let id = payload["id"].as_str().ok_or("World ID required")?;
            if !id.starts_with("wrld_")
                || id.len() != 41
                || uuid::Uuid::parse_str(&id[5..]).is_err()
            {
                return Err("Invalid world ID".into());
            }
            (Method::GET, format!("/worlds/{id}"), None, None)
        }
        "verify2fa" => {
            let kind = payload["kind"].as_str().ok_or("2FA method required")?;
            if !["totp", "emailotp", "otp"].contains(&kind) {
                return Err("Unsupported 2FA method".into());
            }
            let code = payload["code"].as_str().ok_or("Code required")?;
            (
                Method::POST,
                format!("/auth/twofactorauth/{kind}/verify"),
                Some(json!({"code":code})),
                None,
            )
        }
        "logout" => (Method::PUT, "/logout".into(), None, None),
        "avatar" | "rename_avatar" => {
            let id = payload["id"].as_str().ok_or("Avatar ID required")?;
            if !id.starts_with("avtr_")
                || uuid::Uuid::parse_str(&id[5..]).is_err()
                || id.len() != 41
            {
                return Err("Invalid VRChat avatar ID".into());
            }
            if operation == "rename_avatar" {
                let name = payload["name"]
                    .as_str()
                    .ok_or("Avatar name required")?
                    .trim();
                if name.is_empty()
                    || name.chars().count() > 100
                    || name.chars().any(char::is_control)
                {
                    return Err(
                        "Avatar name must contain 1–100 characters without control characters"
                            .into(),
                    );
                }
                (
                    Method::PUT,
                    format!("/avatars/{id}"),
                    Some(json!({"name":name})),
                    None,
                )
            } else {
                (Method::GET, format!("/avatars/{id}"), None, None)
            }
        }
        _ => return Err("Operation is not allowed".into()),
    };
    let retryable = ["avatar", "session", "profile", "world"].contains(&operation.as_str());
    for attempt in 0..=3 {
        let elapsed = session.last_request.elapsed();
        if elapsed < Duration::from_millis(750) {
            tokio::time::sleep(Duration::from_millis(750) - elapsed).await;
        }
        session.last_request = std::time::Instant::now();
        let mut request = session
            .client
            .request(method.clone(), format!("{BASE}{path}"));
        if let Some(ref a) = authorization {
            request = request.header("Authorization", a);
        }
        if let Some(ref b) = body {
            request = request.json(b);
        }
        let response = request.send().await;
        if operation == "logout" {
            *session = Session::with_profile(false, &session.profile)?;
            match credential(&session.profile)?.delete_credential() { Ok(()) | Err(keyring::Error::NoEntry)=>{},Err(_)=>return Err("Session cleared from memory, but credential store cleanup failed. Unlock the store and retry Logout.".into()) }
        }
        let response = response.map_err(|e| {
            if e.is_timeout() {
                "VRChat request timed out. Cached data remains available."
            } else {
                "Cannot connect to VRChat. Check your network. Cached data remains available."
            }
        })?;
        let status = response.status().as_u16();
        if retryable && (status == 429 || status >= 500) && attempt < 3 {
            let delay = retry_delay(
                attempt,
                response
                    .headers()
                    .get("Retry-After")
                    .and_then(|v| v.to_str().ok()),
                rand::random::<u64>() % 1000,
            );
            if delay > Duration::from_secs(120) {
                return Err(format!(
                    "VRChat requests a {} second cooldown. Please retry after that time.",
                    delay.as_secs()
                ));
            }
            let _ = app.emit(
                "api-retry",
                json!({"seconds":delay.as_secs(),"status":status}),
            );
            tokio::time::sleep(delay).await;
            continue;
        }
        if !(200..300).contains(&status) {
            return Err(error(status));
        }
        if operation != "logout" {
            session.persist()?;
        }
        let result: Value = response
            .json()
            .await
            .map_err(|_| "VRChat returned invalid JSON")?;
        crate::logs::event(&app, "API request finished");
        // Never expose response headers, cookies or full account details to the webview.
        if operation == "login" || operation == "session" {
            if let Some(id) = result["id"].as_str() {
                use tauri::Manager;
                let db = app.state::<crate::db::Database>();
                let conn = db.conn.lock().map_err(|e| e.to_string())?;
                conn.execute("INSERT INTO account_profiles(id,display_name,image_url,created_at,last_authenticated,vrchat_user_id) VALUES(?1,?2,?3,strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),?4) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,image_url=excluded.image_url,last_authenticated=excluded.last_authenticated,vrchat_user_id=excluded.vrchat_user_id",rusqlite::params![session.profile,result["displayName"].as_str().unwrap_or("Account"),result["currentAvatarThumbnailImageUrl"].as_str().unwrap_or(""),id]).map_err(|e|e.to_string())?;
            }

            return Ok(
                json!({"id":result["id"],"displayName":result["displayName"],"imageUrl":result["currentAvatarThumbnailImageUrl"],"requiresTwoFactorAuth":result["requiresTwoFactorAuth"]}),
            );
        }
        if operation == "profile" {
            return Ok(profile_fields(&result));
        }
        return Ok(result);
    }
    Err("Retry limit reached".into())
}
#[tauri::command]
pub async fn avatar_image(
    api: tauri::State<'_, Api>,
    db: tauri::State<'_, crate::db::Database>,
    url: String,
) -> Result<String, String> {
    use std::hash::{Hash, Hasher};
    fn allowed(url: &reqwest::Url) -> bool {
        url.scheme() == "https"
            && url.username().is_empty()
            && url.password().is_none()
            && url.port_or_known_default() == Some(443)
            && url
                .host_str()
                .map(|h| {
                    h == "api.vrchat.cloud"
                        || h == "files.vrchat.cloud"
                        || h.ends_with(".vrchat.cloud")
                        || h == "cdn.vrchat.com"
                })
                .unwrap_or(false)
    }
    let mut target = reqwest::Url::parse(&url).map_err(|_| "Invalid image URL")?;
    if !allowed(&target) {
        return Err("Image host not allowed".into());
    }
    let mut hash = std::collections::hash_map::DefaultHasher::new();
    url.hash(&mut hash);
    let path = db
        .root
        .join("cache")
        .join(format!("{:x}.image", hash.finish()));
    let fresh = std::fs::metadata(&path)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|d| d.elapsed().ok())
        .map(|d| d < Duration::from_secs(86400))
        .unwrap_or(false);
    if fresh {
        if let Ok(data) = std::fs::read_to_string(&path) {
            return Ok(data);
        }
    }
    let session = api.0.lock().await;
    for _ in 0..5 {
        let mut response = session
            .client
            .get(target.clone())
            .send()
            .await
            .map_err(|_| "Image unavailable")?;
        if response.status().is_redirection() {
            let location = response
                .headers()
                .get("location")
                .and_then(|v| v.to_str().ok())
                .ok_or("Missing image redirect")?;
            target = target
                .join(location)
                .map_err(|_| "Invalid image redirect")?;
            if !allowed(&target) {
                return Err("Image redirect host not allowed".into());
            }
            continue;
        }
        if !response.status().is_success() {
            return Err("Image unavailable".into());
        }
        let mime = response
            .headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .split(';')
            .next()
            .unwrap_or("")
            .to_string();
        if !["image/png", "image/jpeg", "image/webp", "image/gif"].contains(&mime.as_str()) {
            return Err("Unsupported image response".into());
        }
        let mut bytes = Vec::new();
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "Image transfer failed")?
        {
            if bytes.len() + chunk.len() > 20 * 1024 * 1024 {
                return Err("Image too large".into());
            }
            bytes.extend_from_slice(&chunk);
        }
        let data = format!(
            "data:{mime};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        );
        let _ = std::fs::write(path, &data);
        return Ok(data);
    }
    Err("Too many image redirects".into())
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn respects_retry_after() {
        assert_eq!(retry_delay(0, Some("60"), 0), Duration::from_secs(60));
    }
    #[test]
    fn exponential_backoff() {
        assert_eq!(retry_delay(3, None, 250), Duration::from_millis(8250));
    }
}

#[cfg(test)]
mod profile_tests {
    use super::*;
    #[test]
    fn profile_does_not_expose_authentication_or_billing_fields() {
        let value = profile_fields(
            &json!({"id":"usr_test","displayName":"Test","status":"active","email":"private@example.test","auth":"secret","twoFactorAuth":"secret","creditCard":"secret"}),
        );
        assert_eq!(value["displayName"], "Test");
        assert_eq!(value.as_object().unwrap().len(), 3);
        assert!(!value.to_string().contains("secret"));
    }
}

#[tauri::command]
pub async fn account_control(
    api: tauri::State<'_, Api>,
    db: tauri::State<'_, crate::db::Database>,
    operation: String,
    id: Option<String>,
) -> Result<Value, String> {
    let mut session = api.0.lock().await;
    if operation == "switch" || operation == "add" {
        let profile = if operation == "add" {
            uuid::Uuid::new_v4().to_string()
        } else {
            id.ok_or("Account profile required")?
        };
        if profile != "default" && uuid::Uuid::parse_str(&profile).is_err() {
            return Err("Invalid profile ID".into());
        }
        if operation == "switch" {
            let conn = db.conn.lock().map_err(|e| e.to_string())?;
            if !conn
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM account_profiles WHERE id=?1)",
                    [&profile],
                    |r| r.get::<_, bool>(0),
                )
                .map_err(|e| e.to_string())?
            {
                return Err("Account profile not found".into());
            }
        }
        let next = Session::with_profile(true, &profile)?;
        let conn = db.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("INSERT OR IGNORE INTO account_profiles(id,display_name,image_url,created_at) VALUES(?1,'New account','',strftime('%Y-%m-%dT%H:%M:%fZ','now'))",[&profile]).map_err(|e|e.to_string())?;
        conn.execute("INSERT INTO settings VALUES('activeAccountProfile',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[&profile]).map_err(|e|e.to_string())?;
        *session = next;
    }
    let conn = db.conn.lock().map_err(|e| e.to_string())?;
    conn.execute("INSERT OR IGNORE INTO account_profiles(id,display_name,image_url,created_at) VALUES('default','Default account','',strftime('%Y-%m-%dT%H:%M:%fZ','now'))",[]).map_err(|e|e.to_string())?;
    let mut st = conn
        .prepare("SELECT id,display_name,vrchat_user_id FROM account_profiles ORDER BY created_at")
        .map_err(|e| e.to_string())?;
    let profiles:Vec<Value>=st.query_map([],|r|Ok(json!({"id":r.get::<_,String>(0)?,"name":r.get::<_,String>(1)?,"userId":r.get::<_,Option<String>>(2)?}))).map_err(|e|e.to_string())?.collect::<Result<_,_>>().map_err(|e|e.to_string())?;
    Ok(json!({"active":session.profile,"profiles":profiles}))
}
