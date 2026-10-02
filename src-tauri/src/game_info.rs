use serde_json::{json, Value};
use std::{
    fs::{self, File},
    io::{Read, Seek, SeekFrom},
    path::PathBuf,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
fn ms(t: SystemTime) -> u64 {
    t.duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}
pub fn root() -> Result<PathBuf, String> {
    Ok(PathBuf::from(
        std::env::var("USERPROFILE").map_err(|_| "Windows user directory unavailable")?,
    )
    .join("AppData/LocalLow/VRChat/VRChat"))
}
fn text_after<'a>(line: &'a str, marker: &str) -> Option<&'a str> {
    line.split_once(marker).map(|(_, v)| v.trim())
}
fn parse(text: &str) -> Value {
    let mut build = None;
    let mut unity = None;
    let mut world = None;
    let mut world_id = None;
    let mut instance = None;
    let mut query_port = None;
    let mut osc_port = None;
    let mut events = Vec::new();
    let mut warnings = 0;
    let mut errors = 0;
    for line in text.lines() {
        if let Some(v) = text_after(line, "VRChat Build:") {
            build = Some(v.chars().take(150).collect::<String>());
        }
        if let Some(v) = text_after(line, "Initialize engine version:") {
            unity = Some(v.chars().take(150).collect::<String>());
        }
        if let Some(v) = text_after(line, "of type OSCQuery on ") {
            query_port = v
                .split_whitespace()
                .next()
                .and_then(|n| n.parse::<u16>().ok())
                .filter(|p| *p >= 1024);
        }
        if let Some(v) = text_after(line, "of type OSC on ") {
            osc_port = v
                .split_whitespace()
                .next()
                .and_then(|n| n.parse::<u16>().ok());
        }
        if line.contains("Warning") {
            warnings += 1;
        }
        if line.contains("Error") || line.contains("Exception") {
            errors += 1;
        }
        let at = line.chars().take(19).collect::<String>();
        if let Some(v) = text_after(line, "Entering Room:") {
            let name = v.chars().take(250).collect::<String>();
            world = Some(name.clone());
            world_id = None;
            instance = None;
            events.push(json!({"at":at,"kind":"world","detail":name}));
        }
        if let Some(v) = text_after(line, "Joining wrld_") {
            let location = format!("wrld_{}", v.split_whitespace().next().unwrap_or(""));
            if let Some((id, inst)) = location.split_once(':') {
                if id.len() == 41 && uuid::Uuid::parse_str(&id[5..]).is_ok() {
                    world_id = Some(id.to_string());
                    instance = Some(inst.chars().take(500).collect::<String>());
                    events.push(json!({"at":at,"kind":"instance","detail":id}));
                }
            }
        }
        if line.contains("OnApplicationQuit") {
            events.push(json!({"at":at,"kind":"client","detail":"Client shutdown recorded"}));
        }
    }
    if events.len() > 40 {
        events.drain(..events.len() - 40);
    }
    json!({"build":build,"unity":unity,"world_name":world,"world_id":world_id,"instance":instance,"oscquery_port":query_port,"osc_input_port":osc_port,"warnings_in_sample":warnings,"errors_in_sample":errors,"events":events})
}
#[tauri::command]
pub fn game_diagnostics() -> Result<Value, String> {
    let root = root()?;
    let sampled = ms(SystemTime::now());
    if !root.exists() {
        return Ok(
            json!({"available":false,"sampled_at":sampled,"reason":"No local VRChat directory. Run VRChat on this Windows account first."}),
        );
    }
    let mut logs = Vec::new();
    for e in fs::read_dir(&root).map_err(|e| e.to_string())? {
        let e = e.map_err(|e| e.to_string())?;
        let name = e.file_name().to_string_lossy().to_string();
        if name.starts_with("output_log") && name.ends_with(".txt") && e.path().is_file() {
            let m = e.metadata().map_err(|e| e.to_string())?;
            logs.push((m.modified().unwrap_or(UNIX_EPOCH), e.path(), m.len()));
        }
    }
    logs.sort_by_key(|(time, _, _)| *time);
    let Some((modified, path, len)) = logs.last() else {
        return Ok(
            json!({"available":false,"sampled_at":sampled,"reason":"No VRChat output log found.","root":root}),
        );
    };
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut head = vec![0; (*len).min(256 * 1024) as usize];
    file.read_exact(&mut head).map_err(|e| e.to_string())?;
    let mut text = String::from_utf8_lossy(&head).to_string();
    let truncated = *len > 768 * 1024;
    if *len > head.len() as u64 {
        let start = (head.len() as u64).max(len.saturating_sub(512 * 1024));
        file.seek(SeekFrom::Start(start))
            .map_err(|e| e.to_string())?;
        let mut tail = Vec::new();
        file.take(512 * 1024)
            .read_to_end(&mut tail)
            .map_err(|e| e.to_string())?;
        let tail = String::from_utf8_lossy(&tail);
        text.push('\n');
        text.push_str(if truncated {
            tail.split_once('\n').map(|(_, t)| t).unwrap_or("")
        } else {
            &tail
        });
    }
    let mut result = parse(&text);
    result["available"] = json!(true);
    result["sampled_at"] = json!(sampled);
    result["log_modified_at"] = json!(ms(*modified));
    result["log_path"] = json!(path);
    result["log_bytes"] = json!(len);
    result["log_count"] = json!(logs.len());
    result["partial_sample"] = json!(truncated);
    result["source"]=json!("Latest local VRChat output log; last recorded information, not a process or presence check");
    Ok(result)
}
#[tauri::command]
pub async fn oscquery_snapshot() -> Result<Value, String> {
    let info = game_diagnostics()?;
    let port = info["oscquery_port"].as_u64().ok_or(
        "No OSCQuery port advertised in the latest VRChat log. Enable OSC and start VRChat.",
    )?;
    let client = reqwest::Client::builder()
        .no_proxy()
        .timeout(Duration::from_secs(4))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;
    let mut response=client.get(format!("http://127.0.0.1:{port}/")).send().await.map_err(|_|"VRChat OSCQuery is not reachable at the last advertised local port. The game may be closed or OSC disabled.")?;
    if !response.status().is_success() {
        return Err("Local OSCQuery returned an error".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|_| "Cannot read OSCQuery response")?
    {
        if bytes.len() + chunk.len() > 2 * 1024 * 1024 {
            return Err("OSCQuery response exceeds 2 MB".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let tree: Value =
        serde_json::from_slice(&bytes).map_err(|_| "Local service did not return OSCQuery JSON")?;
    if !tree.is_object() || tree.get("FULL_PATH").is_none() {
        return Err("Local service did not return an OSCQuery tree".into());
    }
    Ok(json!({"port":port,"sampled_at":ms(SystemTime::now()),"tree":tree}))
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn extracts_only_session_fields() {
        let v=parse("VRChat Build: 2026.3.3-test\nAdvertising Service VRChat-Client of type OSCQuery on 51837\n2026.09.30 01:00:00 Debug - Entering Room: Sample World\n2026.09.30 01:00:00 Debug - Joining wrld_11111111-1111-4111-8111-111111111111:123~private(usr_example)\nsecret cookie auth=hidden");
        assert_eq!(v["build"], "2026.3.3-test");
        assert_eq!(v["oscquery_port"], 51837);
        assert_eq!(v["world_name"], "Sample World");
        assert!(!v.to_string().contains("hidden"));
    }
    #[test]
    fn missing_fields_remain_null() {
        let v = parse("some unrelated line");
        assert!(v["world_id"].is_null());
        assert!(v["build"].is_null());
    }
}
