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
    use serde_json::json;
    use std::collections::{BTreeMap, HashMap};
    use std::mem::size_of;
    use std::net::{Ipv4Addr, Ipv6Addr};
    use windows_sys::Win32::Foundation::{
        CloseHandle, ERROR_INSUFFICIENT_BUFFER, FILETIME, HANDLE, INVALID_HANDLE_VALUE,
        WAIT_OBJECT_0,
    };
    use windows_sys::Win32::NetworkManagement::IpHelper::{
        GetExtendedTcpTable, GetExtendedUdpTable, MIB_TCP6ROW_OWNER_PID, MIB_TCPROW_OWNER_PID,
        MIB_UDP6ROW_OWNER_PID, MIB_UDPROW_OWNER_PID, TCP_TABLE_OWNER_PID_ALL, UDP_TABLE_OWNER_PID,
    };
    use windows_sys::Win32::Networking::WinSock::{AF_INET, AF_INET6};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, TerminateProcess, WaitForSingleObject,
        PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_SYNCHRONIZE, PROCESS_TERMINATE,
    };

    #[derive(Default)]
    struct Owner {
        pid: u32,
        addresses: Vec<String>,
        states: Vec<String>,
    }

    struct OwnedHandle(HANDLE);
    impl Drop for OwnedHandle {
        fn drop(&mut self) {
            unsafe { CloseHandle(self.0) };
        }
    }

    fn tcp_state(value: u32) -> &'static str {
        match value {
            1 => "CLOSED",
            2 => "LISTEN",
            3 => "SYN_SENT",
            4 => "SYN_RECEIVED",
            5 => "ESTABLISHED",
            6 => "FIN_WAIT1",
            7 => "FIN_WAIT2",
            8 => "CLOSE_WAIT",
            9 => "CLOSING",
            10 => "LAST_ACK",
            11 => "TIME_WAIT",
            12 => "DELETE_TCB",
            _ => "UNKNOWN",
        }
    }

    fn port_from_network(value: u32) -> u16 {
        u16::from_be(value as u16)
    }

    fn table_buffer(tcp: bool, family: u32, class: i32) -> Result<Vec<u64>, PluginError> {
        let mut bytes = 0u32;
        unsafe {
            if tcp {
                GetExtendedTcpTable(std::ptr::null_mut(), &mut bytes, 0, family, class, 0)
            } else {
                GetExtendedUdpTable(std::ptr::null_mut(), &mut bytes, 0, family, class, 0)
            };
        }
        if bytes < size_of::<u32>() as u32 || bytes > 16 * 1024 * 1024 {
            return Err(err("PORT_QUERY_FAILED"));
        }
        for _ in 0..3 {
            let mut buffer = vec![0u64; (bytes as usize + size_of::<u64>() - 1) / size_of::<u64>()];
            let status = unsafe {
                if tcp {
                    GetExtendedTcpTable(buffer.as_mut_ptr().cast(), &mut bytes, 0, family, class, 0)
                } else {
                    GetExtendedUdpTable(buffer.as_mut_ptr().cast(), &mut bytes, 0, family, class, 0)
                }
            };
            if status == 0 {
                return Ok(buffer);
            }
            if status != ERROR_INSUFFICIENT_BUFFER || bytes > 16 * 1024 * 1024 {
                break;
            }
        }
        Err(err("PORT_QUERY_FAILED"))
    }

    unsafe fn table_rows<T: Copy>(buffer: &[u64]) -> Result<Vec<T>, PluginError> {
        let base = buffer.as_ptr().cast::<u8>();
        let count = unsafe { *(base.cast::<u32>()) } as usize;
        let available = buffer.len() * size_of::<u64>() - size_of::<u32>();
        if count > available / size_of::<T>() {
            return Err(err("PORT_QUERY_FAILED"));
        }
        let rows =
            unsafe { std::slice::from_raw_parts(base.add(size_of::<u32>()).cast::<T>(), count) };
        Ok(rows.to_vec())
    }

    fn add_owner(owners: &mut BTreeMap<u32, Owner>, pid: u32, address: String, state: &str) {
        let owner = owners.entry(pid).or_insert_with(|| Owner {
            pid,
            ..Owner::default()
        });
        if !owner.addresses.contains(&address) {
            owner.addresses.push(address);
        }
        if !owner.states.iter().any(|value| value == state) {
            owner.states.push(state.to_owned());
        }
    }

    fn query(port: u16, protocol: &str) -> Result<Vec<Owner>, PluginError> {
        let mut owners = BTreeMap::new();
        if protocol == "tcp" {
            let v4 = table_buffer(true, AF_INET as u32, TCP_TABLE_OWNER_PID_ALL)?;
            for row in unsafe { table_rows::<MIB_TCPROW_OWNER_PID>(&v4)? } {
                if port_from_network(row.dwLocalPort) == port {
                    add_owner(
                        &mut owners,
                        row.dwOwningPid,
                        Ipv4Addr::from(row.dwLocalAddr.to_ne_bytes()).to_string(),
                        tcp_state(row.dwState),
                    );
                }
            }
            let v6 = table_buffer(true, AF_INET6 as u32, TCP_TABLE_OWNER_PID_ALL)?;
            for row in unsafe { table_rows::<MIB_TCP6ROW_OWNER_PID>(&v6)? } {
                if port_from_network(row.dwLocalPort) == port {
                    let mut address = Ipv6Addr::from(row.ucLocalAddr).to_string();
                    if row.dwLocalScopeId != 0 {
                        address.push_str(&format!("%{}", row.dwLocalScopeId));
                    }
                    add_owner(
                        &mut owners,
                        row.dwOwningPid,
                        address,
                        tcp_state(row.dwState),
                    );
                }
            }
        } else {
            let v4 = table_buffer(false, AF_INET as u32, UDP_TABLE_OWNER_PID)?;
            for row in unsafe { table_rows::<MIB_UDPROW_OWNER_PID>(&v4)? } {
                if port_from_network(row.dwLocalPort) == port {
                    add_owner(
                        &mut owners,
                        row.dwOwningPid,
                        Ipv4Addr::from(row.dwLocalAddr.to_ne_bytes()).to_string(),
                        "UDP",
                    );
                }
            }
            let v6 = table_buffer(false, AF_INET6 as u32, UDP_TABLE_OWNER_PID)?;
            for row in unsafe { table_rows::<MIB_UDP6ROW_OWNER_PID>(&v6)? } {
                if port_from_network(row.dwLocalPort) == port {
                    let mut address = Ipv6Addr::from(row.ucLocalAddr).to_string();
                    if row.dwLocalScopeId != 0 {
                        address.push_str(&format!("%{}", row.dwLocalScopeId));
                    }
                    add_owner(&mut owners, row.dwOwningPid, address, "UDP");
                }
            }
        }
        Ok(owners.into_values().collect())
    }

    fn process_snapshot() -> Result<(HashMap<u32, u32>, HashMap<u32, String>), PluginError> {
        let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if snapshot == INVALID_HANDLE_VALUE {
            return Err(err("PORT_QUERY_FAILED"));
        }
        let snapshot = OwnedHandle(snapshot);
        let mut parents = HashMap::new();
        let mut names = HashMap::new();
        let mut entry: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        let mut success = unsafe { Process32FirstW(snapshot.0, &mut entry) };
        while success != 0 {
            parents.insert(entry.th32ProcessID, entry.th32ParentProcessID);
            let end = entry
                .szExeFile
                .iter()
                .position(|value| *value == 0)
                .unwrap_or(entry.szExeFile.len());
            let mut name = String::from_utf16_lossy(&entry.szExeFile[..end]);
            if let Some(stripped) = name.strip_suffix(".exe") {
                name = stripped.to_owned();
            }
            names.insert(entry.th32ProcessID, name);
            success = unsafe { Process32NextW(snapshot.0, &mut entry) };
        }
        Ok((parents, names))
    }

    fn started(handle: HANDLE) -> Option<String> {
        let mut creation: FILETIME = unsafe { std::mem::zeroed() };
        let mut exit: FILETIME = unsafe { std::mem::zeroed() };
        let mut kernel: FILETIME = unsafe { std::mem::zeroed() };
        let mut user: FILETIME = unsafe { std::mem::zeroed() };
        if unsafe { GetProcessTimes(handle, &mut creation, &mut exit, &mut kernel, &mut user) } == 0
        {
            return None;
        }
        Some(((creation.dwHighDateTime as u64) << 32 | creation.dwLowDateTime as u64).to_string())
    }

    fn open_process(pid: u32, terminate: bool) -> Option<OwnedHandle> {
        let mut rights = PROCESS_QUERY_LIMITED_INFORMATION;
        if terminate {
            rights |= PROCESS_TERMINATE | PROCESS_SYNCHRONIZE;
        }
        let handle = unsafe { OpenProcess(rights, 0, pid) };
        (handle != std::ptr::null_mut()).then_some(OwnedHandle(handle))
    }

    fn protected_pids(parents: &HashMap<u32, u32>) -> Vec<u32> {
        let mut protected = Vec::new();
        let mut pid = std::process::id();
        while pid > 0 && !protected.contains(&pid) {
            protected.push(pid);
            pid = parents.get(&pid).copied().unwrap_or(0);
        }
        protected
    }

    pub fn run(method: &str, params: Value) -> Result<Value, PluginError> {
        let port = params["port"].as_u64().unwrap() as u16;
        let protocol = params["protocol"].as_str().unwrap();
        let (parents, names) = process_snapshot()?;
        let protected = protected_pids(&parents);
        if method.ends_with("/list") {
            let processes: Vec<_> = query(port, protocol)?
                .into_iter()
                .map(|owner| {
                    let process = open_process(owner.pid, true);
                    let started = process
                        .as_ref()
                        .and_then(|handle| started(handle.0))
                        .unwrap_or_default();
                    json!({
                        "pid": owner.pid,
                        "name": names.get(&owner.pid).cloned().unwrap_or_default(),
                        "started": started,
                        "canKill": !protected.contains(&owner.pid) && !started.is_empty(),
                        "addresses": owner.addresses,
                        "states": owner.states,
                    })
                })
                .collect();
            return Ok(
                json!({"processes":processes,"port":port,"protocol":protocol,"supportsGraceful":false}),
            );
        }

        let pid = params["pid"].as_u64().unwrap() as u32;
        if pid <= 4 || protected.contains(&pid) {
            return Err(err("PORT_PROCESS_PROTECTED"));
        }
        let process = open_process(pid, true).ok_or_else(|| err("PORT_KILL_FAILED"))?;
        let expected = params["started"].as_str().unwrap();
        if started(process.0).as_deref() != Some(expected)
            || !query(port, protocol)?.iter().any(|owner| owner.pid == pid)
            || started(process.0).as_deref() != Some(expected)
        {
            return Err(err("PORT_PROCESS_CHANGED"));
        }
        if unsafe { TerminateProcess(process.0, 1) } == 0 {
            return Err(err("PORT_KILL_FAILED"));
        }
        if unsafe { WaitForSingleObject(process.0, 5000) } != WAIT_OBJECT_0 {
            return Err(err("PORT_TIMEOUT"));
        }
        Ok(json!({"killed":true,"pid":pid}))
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
