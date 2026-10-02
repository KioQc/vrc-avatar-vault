use serde::Serialize;
use serde_json::{json, Value};
use std::{
    collections::{BTreeMap, VecDeque},
    net::UdpSocket,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    thread::JoinHandle,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
#[derive(Clone, Serialize)]
pub struct Message {
    address: String,
    types: String,
    values: Vec<Value>,
    at: u64,
}
#[derive(Clone, Default, Serialize)]
pub struct Snapshot {
    running: bool,
    port: u16,
    packets: u64,
    rejected: u64,
    last_received: Option<u64>,
    avatar_id: Option<String>,
    error: Option<String>,
    values: BTreeMap<String, Message>,
    recent: VecDeque<Message>,
}
struct Worker {
    stop: Arc<AtomicBool>,
    handle: JoinHandle<()>,
}
#[derive(Default)]
pub struct OscMonitor {
    worker: Mutex<Option<Worker>>,
    state: Arc<Mutex<Snapshot>>,
}
impl Drop for OscMonitor {
    fn drop(&mut self) {
        if let Ok(slot) = self.worker.get_mut() {
            if let Some(w) = slot.take() {
                w.stop.store(true, Ordering::Relaxed);
                let _ = w.handle.join();
            }
        }
    }
}

fn take<'a>(data: &'a [u8], pos: &mut usize, n: usize) -> Result<&'a [u8], String> {
    let end = pos.checked_add(n).ok_or("Packet overflow")?;
    let bytes = data.get(*pos..end).ok_or("Truncated OSC packet")?;
    *pos = end;
    Ok(bytes)
}
fn string(data: &[u8], pos: &mut usize) -> Result<String, String> {
    let len = data
        .get(*pos..)
        .ok_or("Invalid OSC string")?
        .iter()
        .position(|b| *b == 0)
        .ok_or("Unterminated OSC string")?;
    if len > 8192 {
        return Err("OSC string too long".into());
    }
    let raw = take(data, pos, len)?;
    let result = std::str::from_utf8(raw)
        .map_err(|_| "Invalid OSC UTF-8")?
        .to_string();
    let padding = 4 - len % 4;
    if take(data, pos, padding)?.iter().any(|b| *b != 0) {
        return Err("Invalid OSC padding".into());
    }
    Ok(result)
}
fn word(data: &[u8], pos: &mut usize) -> Result<[u8; 4], String> {
    Ok(take(data, pos, 4)?.try_into().unwrap())
}
fn decode(data: &[u8], depth: usize, messages: &mut Vec<Message>) -> Result<(), String> {
    if depth > 8 || messages.len() >= 512 || data.len() % 4 != 0 {
        return Err("OSC packet limit".into());
    }
    let mut pos = 0;
    let address = string(data, &mut pos)?;
    if address == "#bundle" {
        take(data, &mut pos, 8)?; // Monitor records receive time; it does not execute scheduled messages.
        while pos < data.len() {
            let n = u32::from_be_bytes(word(data, &mut pos)?) as usize;
            if n == 0 {
                return Err("Empty bundle element".into());
            }
            decode(take(data, &mut pos, n)?, depth + 1, messages)?;
        }
        return Ok(());
    }
    if !address.starts_with('/') || address.len() > 1024 {
        return Err("Invalid OSC address".into());
    }
    let types = string(data, &mut pos)?;
    if !types.starts_with(',') || types.len() > 256 {
        return Err("Invalid OSC type tags".into());
    }
    let mut values = Vec::new();
    for tag in types[1..].chars() {
        values.push(match tag {
            'i' => json!(i32::from_be_bytes(word(data, &mut pos)?)),
            'f' => {
                let n = f32::from_be_bytes(word(data, &mut pos)?);
                if !n.is_finite() {
                    json!(n.to_string())
                } else {
                    json!(n)
                }
            }
            's' | 'S' => json!(string(data, &mut pos)?),
            'T' => json!(true),
            'F' => json!(false),
            'N' => Value::Null,
            'I' => json!("Infinity"),
            'h' => {
                json!(i64::from_be_bytes(take(data, &mut pos, 8)?.try_into().unwrap()).to_string())
            }
            'd' => {
                let n = f64::from_be_bytes(take(data, &mut pos, 8)?.try_into().unwrap());
                if !n.is_finite() {
                    json!(n.to_string())
                } else {
                    json!(n)
                }
            }
            't' => {
                json!(u64::from_be_bytes(take(data, &mut pos, 8)?.try_into().unwrap()).to_string())
            }
            'r' | 'm' | 'c' => json!(u32::from_be_bytes(word(data, &mut pos)?)),
            'b' => {
                let n = u32::from_be_bytes(word(data, &mut pos)?) as usize;
                take(data, &mut pos, n)?;
                take(data, &mut pos, (4 - n % 4) % 4)?;
                json!({"blob_bytes":n})
            }
            _ => return Err(format!("Unsupported OSC type: {tag}")),
        });
    }
    if pos != data.len() {
        return Err("Unexpected OSC trailing data".into());
    }
    messages.push(Message {
        address,
        types,
        values,
        at: now(),
    });
    Ok(())
}
fn record(state: &mut Snapshot, messages: Vec<Message>) {
    for message in messages {
        if message.address == "/avatar/change" {
            let id = message
                .values
                .first()
                .and_then(Value::as_str)
                .filter(|s| {
                    s.starts_with("avtr_")
                        && s.len() == 41
                        && uuid::Uuid::parse_str(&s[5..]).is_ok()
                })
                .map(str::to_owned);
            state.values.clear();
            state.recent.clear();
            state.avatar_id = id;
        }
        if state.values.len() >= 1024 && !state.values.contains_key(&message.address) {
            if let Some(old) = state
                .values
                .values()
                .min_by_key(|m| m.at)
                .map(|m| m.address.clone())
            {
                state.values.remove(&old);
            }
        }
        state
            .values
            .insert(message.address.clone(), message.clone());
        state.recent.push_front(message);
        state.recent.truncate(200);
    }
}
impl OscMonitor {
    fn start(&self, port: u16) -> Result<(), String> {
        if port < 1024 || port == 9000 {
            return Err(
                "Choose a receive port from 1024–65535, other than VRChat's input port 9000".into(),
            );
        }
        let mut slot = self.worker.lock().map_err(|_| "OSC worker unavailable")?;
        if slot.is_some() {
            return Err("Stop the current listener before changing ports".into());
        }
        let socket=UdpSocket::bind(("127.0.0.1",port)).map_err(|_| format!("Cannot listen on 127.0.0.1:{port}. Another OSC app may already use this port. Stop that listener or configure a different VRChat output port."))?;
        socket
            .set_read_timeout(Some(Duration::from_millis(200)))
            .map_err(|e| e.to_string())?;
        *self.state.lock().map_err(|_| "OSC state unavailable")? = Snapshot {
            running: true,
            port,
            ..Default::default()
        };
        let stop = Arc::new(AtomicBool::new(false));
        let flag = stop.clone();
        let state = self.state.clone();
        let handle = std::thread::spawn(move || {
            let mut buffer = [0u8; 65536];
            while !flag.load(Ordering::Relaxed) {
                match socket.recv_from(&mut buffer) {
                    Ok((n, source)) => {
                        if !source.ip().is_loopback() {
                            continue;
                        }
                        let mut messages = Vec::new();
                        let decoded = decode(&buffer[..n], 0, &mut messages);
                        if let Ok(mut s) = state.lock() {
                            s.packets += 1;
                            if decoded.is_ok() {
                                s.last_received = Some(now());
                                record(&mut s, messages);
                            } else {
                                s.rejected += 1;
                            }
                        }
                    }
                    Err(e)
                        if matches!(
                            e.kind(),
                            std::io::ErrorKind::WouldBlock | std::io::ErrorKind::TimedOut
                        ) => {}
                    Err(e) => {
                        if let Ok(mut s) = state.lock() {
                            s.error = Some(e.to_string());
                        }
                        break;
                    }
                }
            }
            if let Ok(mut s) = state.lock() {
                s.running = false;
            }
        });
        *slot = Some(Worker { stop, handle });
        Ok(())
    }
    fn stop(&self) -> Result<(), String> {
        if let Some(w) = self
            .worker
            .lock()
            .map_err(|_| "OSC worker unavailable")?
            .take()
        {
            w.stop.store(true, Ordering::Relaxed);
            let _ = w.handle.join();
        }
        Ok(())
    }
}
#[tauri::command]
pub fn osc_monitor(
    monitor: tauri::State<OscMonitor>,
    operation: String,
    port: Option<u16>,
) -> Result<Snapshot, String> {
    match operation.as_str() {
        "start" => monitor.start(port.unwrap_or(9001))?,
        "stop" => monitor.stop()?,
        "clear" => {
            let mut s = monitor.state.lock().map_err(|_| "OSC state unavailable")?;
            s.values.clear();
            s.recent.clear();
            s.avatar_id = None;
            s.packets = 0;
            s.rejected = 0;
            s.last_received = None;
        }
        "snapshot" => {}
        _ => return Err("Unknown monitor operation".into()),
    }
    Ok(monitor
        .state
        .lock()
        .map_err(|_| "OSC state unavailable")?
        .clone())
}
#[cfg(test)]
mod tests {
    use super::*;
    fn str_bytes(s: &str) -> Vec<u8> {
        let mut b = s.as_bytes().to_vec();
        b.push(0);
        while b.len() % 4 != 0 {
            b.push(0);
        }
        b
    }
    fn packet(address: &str, tags: &str) -> Vec<u8> {
        [str_bytes(address), str_bytes(tags)].concat()
    }
    #[test]
    fn decodes_vrchat_types_and_rejects_truncation() {
        let mut b = packet("/avatar/parameters/Speed", ",fiTF");
        b.extend(0.5f32.to_be_bytes());
        b.extend(3i32.to_be_bytes());
        let mut out = vec![];
        decode(&b, 0, &mut out).unwrap();
        assert_eq!(
            out[0].values,
            vec![json!(0.5), json!(3), json!(true), json!(false)]
        );
        assert!(decode(&b[..b.len() - 1], 0, &mut vec![]).is_err());
    }
    #[test]
    fn decodes_bundles_and_clears_old_avatar_values() {
        let b = packet("/avatar/parameters/Seated", ",T");
        let mut bundle = str_bytes("#bundle");
        bundle.extend(1u64.to_be_bytes());
        bundle.extend((b.len() as u32).to_be_bytes());
        bundle.extend(b);
        let mut out = vec![];
        decode(&bundle, 0, &mut out).unwrap();
        let mut s = Snapshot::default();
        record(&mut s, out);
        let mut b = packet("/avatar/change", ",s");
        b.extend(str_bytes("avtr_11111111-1111-4111-8111-111111111111"));
        let mut out = vec![];
        decode(&b, 0, &mut out).unwrap();
        record(&mut s, out);
        assert_eq!(s.values.len(), 1);
        assert!(s.avatar_id.is_some());
    }
    #[test]
    fn loopback_listener_receives_and_releases_port() {
        let probe = UdpSocket::bind("127.0.0.1:0").unwrap();
        let port = probe.local_addr().unwrap().port();
        drop(probe);
        let m = OscMonitor::default();
        m.start(port).unwrap();
        let sender = UdpSocket::bind("127.0.0.1:0").unwrap();
        sender
            .send_to(
                &packet("/avatar/parameters/Seated", ",T"),
                ("127.0.0.1", port),
            )
            .unwrap();
        for _ in 0..20 {
            if m.state.lock().unwrap().packets > 0 {
                break;
            }
            std::thread::sleep(Duration::from_millis(25));
        }
        assert_eq!(m.state.lock().unwrap().packets, 1);
        m.stop().unwrap();
        assert!(!m.state.lock().unwrap().running);
        assert!(UdpSocket::bind(("127.0.0.1", port)).is_ok());
    }
}
