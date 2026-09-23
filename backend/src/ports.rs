use crate::helpers::bad;
use dbx_plugin_sdk::PluginError;
use serde_json::Value;

#[cfg(any(target_os = "linux", target_os = "macos", test))]
#[path = "ports_unix.rs"]
mod unix;

fn validate(method: &str, params: &Value) -> Result<(), PluginError> {
    if !matches!(method, "toolbox/ports/list" | "toolbox/ports/kill") {
        return Err(PluginError::method_not_found(method));
    }
    if !matches!(params["port"].as_u64(), Some(1..=65535)) {
        return Err(bad("PORT_INVALID"));
    }
    if !matches!(params["protocol"].as_str(), Some("tcp" | "udp")) {
        return Err(bad("PORT_PROTOCOL_INVALID"));
    }
    if method == "toolbox/ports/kill" {
        if params["confirm"].as_bool() != Some(true) {
            return Err(bad("PORT_CONFIRM_REQUIRED"));
        }
        if !matches!(params["pid"].as_u64(), Some(2..=2147483647))
            || params["pid"].as_u64() == Some(std::process::id() as u64)
        {
            return Err(bad("PORT_PROCESS_PROTECTED"));
        }
        if params.get("force").is_some_and(|v| !v.is_boolean()) {
            return Err(bad("PORT_INVALID"));
        }
        let started = params["started"].as_str().unwrap_or("");
        if started.is_empty() || started.len() > 20 || !started.bytes().all(|c| c.is_ascii_digit())
        {
            return Err(bad("PORT_PROCESS_CHANGED"));
        }
    }
    Ok(())
}

pub fn handle(method: &str, params: Value) -> Result<Value, PluginError> {
    validate(method, &params)?;
    #[cfg(windows)]
    {
        windows::run(method, params)
    }
    #[cfg(any(target_os = "linux", target_os = "macos"))]
    {
        unix::run(method, params)
    }
    #[cfg(not(any(windows, target_os = "linux", target_os = "macos")))]
    {
        Err(crate::helpers::err("PORT_PLATFORM_UNSUPPORTED"))
    }
}

#[cfg(windows)]
mod windows {
    use super::*;
    use crate::helpers::err;
    use base64::{engine::general_purpose::STANDARD, Engine};
    use std::io::Read;
    use std::os::windows::process::CommandExt;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    pub fn run(method: &str, mut params: Value) -> Result<Value, PluginError> {
        params["action"] = Value::from(if method.ends_with("/kill") {
            "kill"
        } else {
            "list"
        });
        params["backendPid"] = Value::from(std::process::id());
        let script = include_str!("ports.ps1");
        let encoded: Vec<u8> = script.encode_utf16().flat_map(u16::to_le_bytes).collect();
        let root = std::env::var_os("SystemRoot").ok_or_else(|| err("PORT_QUERY_FAILED"))?;
        let executable =
            std::path::PathBuf::from(root).join("System32/WindowsPowerShell/v1.0/powershell.exe");
        let mut child = Command::new(executable)
            .args([
                "-NoLogo",
                "-NoProfile",
                "-NonInteractive",
                "-EncodedCommand",
                &STANDARD.encode(encoded),
            ])
            .env("DBX_PORT_REQUEST", params.to_string())
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|_| err("PORT_QUERY_FAILED"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| err("PORT_QUERY_FAILED"))?;
        // Drain concurrently, with a hard output cap; never block on a full pipe.
        let reader = std::thread::spawn(move || {
            let mut data = Vec::new();
            stdout
                .take(1024 * 1024)
                .read_to_end(&mut data)
                .map(|_| data)
        });
        let start = Instant::now();
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) if start.elapsed() < Duration::from_secs(20) => {
                    std::thread::sleep(Duration::from_millis(25));
                }
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = reader.join();
                    return Err(err("PORT_TIMEOUT"));
                }
            }
        };
        let output = reader
            .join()
            .map_err(|_| err("PORT_QUERY_FAILED"))?
            .map_err(|_| err("PORT_QUERY_FAILED"))?;
        if !status.success() {
            return Err(err("PORT_QUERY_FAILED"));
        }
        let value: Value = serde_json::from_slice(&output).map_err(|_| err("PORT_QUERY_FAILED"))?;
        if let Some(code) = value["error"].as_str() {
            return Err(err(code));
        }
        Ok(value)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rejects_invalid_requests_before_running_commands() {
        for port in [
            json!(0),
            json!(65536),
            json!(-1),
            json!(1.5),
            json!("80; exit"),
        ] {
            assert!(
                validate("toolbox/ports/list", &json!({"port":port,"protocol":"tcp"})).is_err()
            );
        }
        assert!(validate("toolbox/ports/list", &json!({"port":80,"protocol":"any"})).is_err());
        let mut params =
            json!({"port":80,"protocol":"tcp","pid":12345,"started":"123","confirm":true});
        assert!(validate("toolbox/ports/kill", &params).is_ok());
        params["confirm"] = json!(false);
        assert!(validate("toolbox/ports/kill", &params).is_err());
        params["confirm"] = json!(true);
        params["pid"] = json!(std::process::id());
        assert!(validate("toolbox/ports/kill", &params).is_err());
        params["pid"] = json!(12345);
        params["started"] = json!("123'; Stop-Process");
        assert!(validate("toolbox/ports/kill", &params).is_err());
    }
}

#[cfg(all(test, windows))]
mod windows_tests {
    use super::*;
    use serde_json::json;
    use std::io::{BufRead, BufReader};
    use std::os::windows::process::CommandExt;
    use std::process::{Child, Command, Stdio};

    struct Fixture(Child);
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }

    #[test]
    fn finds_tcp_udp_and_only_terminates_matching_process_identity() {
        // Only this disposable test child is ever terminated.
        let mut fixture = Fixture(Command::new("powershell.exe")
            .args(["-NoProfile", "-NonInteractive", "-Command",
                "$tcp = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0); $tcp.Start(); $udp = [System.Net.Sockets.UdpClient]::new(0); Write-Output \"$($tcp.LocalEndpoint.Port),$($udp.Client.LocalEndPoint.Port)\"; while ($true) { Start-Sleep -Seconds 1 }"])
            .creation_flags(0x08000000)
            .stdout(Stdio::piped()).stderr(Stdio::null()).spawn().unwrap());
        let mut line = String::new();
        BufReader::new(fixture.0.stdout.take().unwrap())
            .read_line(&mut line)
            .unwrap();
        let ports: Vec<u16> = line.trim().split(',').map(|v| v.parse().unwrap()).collect();
        assert_eq!(ports.len(), 2);
        let owner = fixture.0.id();
        let tcp = handle(
            "toolbox/ports/list",
            json!({"port":ports[0],"protocol":"tcp"}),
        )
        .unwrap();
        let row = tcp["processes"]
            .as_array()
            .unwrap()
            .iter()
            .find(|row| row["pid"] == owner)
            .unwrap();
        assert_eq!(row["canKill"], true);
        let udp = handle(
            "toolbox/ports/list",
            json!({"port":ports[1],"protocol":"udp"}),
        )
        .unwrap();
        assert!(udp["processes"]
            .as_array()
            .unwrap()
            .iter()
            .any(|row| row["pid"] == owner));
        let wrong =
            json!({"port":ports[0],"protocol":"tcp","pid":owner,"started":"1","confirm":true});
        assert!(handle("toolbox/ports/kill", wrong).is_err());
        assert!(fixture.0.try_wait().unwrap().is_none());
        let kill = json!({"port":ports[0],"protocol":"tcp","pid":owner,"started":row["started"],"confirm":true});
        assert_eq!(handle("toolbox/ports/kill", kill).unwrap()["killed"], true);
        assert!(fixture.0.wait().unwrap().code().is_some());
        let empty = handle(
            "toolbox/ports/list",
            json!({"port":ports[0],"protocol":"tcp"}),
        )
        .unwrap();
        assert!(empty["processes"]
            .as_array()
            .unwrap()
            .iter()
            .all(|row| row["pid"] != owner));
    }
}
