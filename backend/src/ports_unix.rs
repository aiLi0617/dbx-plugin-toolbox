use std::collections::BTreeMap;

#[derive(Default, Debug)]
struct Owner {
    pid: u32,
    name: String,
    addresses: Vec<String>,
    states: Vec<String>,
}

/// lsof -F0 fields are NUL-delimited; newline separates process/file records.
/// The -i selector also matches REMOTE ports, so check the local endpoint again.
fn parse_lsof(output: &[u8], port: u16) -> Vec<Owner> {
    let mut owners = BTreeMap::<u32, Owner>::new();
    let mut pid = 0;
    let mut name = String::new();
    let mut address: Option<String> = None;
    let mut state = String::new();
    fn flush(
        owners: &mut BTreeMap<u32, Owner>,
        pid: u32,
        name: &str,
        address: &mut Option<String>,
        state: &mut String,
    ) {
        if let Some(address) = address.take() {
            if pid > 0 {
                let owner = owners.entry(pid).or_insert_with(|| Owner {
                    pid,
                    name: name.to_owned(),
                    ..Owner::default()
                });
                if !owner.addresses.contains(&address) {
                    owner.addresses.push(address);
                }
                if !state.is_empty() && !owner.states.contains(state) {
                    owner.states.push(state.clone());
                }
            }
        }
        state.clear();
    }
    for raw in output.split(|b| *b == 0) {
        let field = String::from_utf8_lossy(raw);
        let field = field.trim_start_matches('\n');
        if field.is_empty() {
            continue;
        }
        let (tag, value) = field.split_at(1);
        match tag {
            "p" | "f" => {
                flush(&mut owners, pid, &name, &mut address, &mut state);
                if tag == "p" {
                    pid = value.parse().unwrap_or(0);
                    name.clear();
                }
            }
            "c" => name = value.to_string(),
            "n" => {
                let local = value.split("->").next().unwrap_or("");
                if let Some((host, number)) = local.rsplit_once(':') {
                    if number.parse::<u16>() == Ok(port) {
                        address = Some(host.to_string());
                    }
                }
            }
            "T" if value.starts_with("ST=") => state = value[3..].to_string(),
            _ => {}
        }
    }
    flush(&mut owners, pid, &name, &mut address, &mut state);
    owners.into_values().collect()
}

/// /proc/<pid>/stat allows spaces and ')' inside comm; fields after the final
/// ')' start at field 3 (state). Field 22 is the boot-relative start tick.
#[cfg(any(target_os = "linux", test))]
fn parse_proc_stat(value: &str) -> Option<(u32, String)> {
    let fields: Vec<_> = value.rsplit_once(')')?.1.split_whitespace().collect();
    let parent = fields.get(1)?.parse().ok()?;
    let started = *fields.get(19)?;
    if started.is_empty() || !started.bytes().all(|b| b.is_ascii_digit()) {
        return None;
    }
    Some((parent, started.to_owned()))
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
mod native {
    use super::*;
    use crate::helpers::err;
    use dbx_plugin_sdk::PluginError;
    use serde_json::{json, Value};
    use std::collections::HashSet;
    use std::io::Read;
    use std::process::{Command, Stdio};
    use std::time::{Duration, Instant};

    fn process_info(pid: u32) -> Option<(u32, String)> {
        #[cfg(target_os = "linux")]
        {
            parse_proc_stat(&std::fs::read_to_string(format!("/proc/{pid}/stat")).ok()?)
        }
        #[cfg(target_os = "macos")]
        {
            let mut info = std::mem::MaybeUninit::<libc::proc_bsdinfo>::zeroed();
            let size = std::mem::size_of::<libc::proc_bsdinfo>();
            // libproc supplies microsecond precision, unlike ps lstart (seconds).
            let read = unsafe {
                libc::proc_pidinfo(
                    pid as i32,
                    libc::PROC_PIDTBSDINFO,
                    0,
                    info.as_mut_ptr().cast(),
                    size as i32,
                )
            };
            if read != size as i32 {
                return None;
            }
            let info = unsafe { info.assume_init() };
            Some((
                info.pbi_ppid,
                format!("{}{:06}", info.pbi_start_tvsec, info.pbi_start_tvusec),
            ))
        }
    }

    fn protected_pids() -> Result<HashSet<u32>, PluginError> {
        let mut protected = HashSet::from([0, 1]);
        let mut pid = std::process::id();
        while pid > 1 && protected.insert(pid) {
            pid = process_info(pid).ok_or_else(|| err("PORT_QUERY_FAILED"))?.0;
        }
        Ok(protected)
    }

    fn query(port: u16, protocol: &str) -> Result<Vec<Owner>, PluginError> {
        // Absolute system paths avoid invoking a replacement from the current directory.
        let executable = ["/usr/sbin/lsof", "/usr/bin/lsof", "/sbin/lsof", "/bin/lsof"]
            .into_iter()
            .find(|path| std::path::Path::new(path).is_file())
            .ok_or_else(|| err("PORT_LSOF_MISSING"))?;
        let mut child = Command::new(executable)
            .args([
                "-nP",
                "-F0pcfnT",
                &format!("-i{}:{port}", protocol.to_uppercase()),
            ])
            .env("LC_ALL", "C")
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|_| err("PORT_QUERY_FAILED"))?;
        let stdout = child.stdout.take().unwrap();
        let stderr = child.stderr.take().unwrap();
        let read = |pipe: Box<dyn Read + Send>| {
            std::thread::spawn(move || {
                let mut bytes = Vec::new();
                pipe.take(1024 * 1024)
                    .read_to_end(&mut bytes)
                    .map(|_| bytes)
            })
        };
        let out = read(Box::new(stdout));
        let errors = read(Box::new(stderr));
        let deadline = Instant::now() + Duration::from_secs(10);
        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) if Instant::now() < deadline => {
                    std::thread::sleep(Duration::from_millis(20))
                }
                _ => {
                    let _ = child.kill();
                    let _ = child.wait();
                    let _ = out.join();
                    let _ = errors.join();
                    return Err(err("PORT_TIMEOUT"));
                }
            }
        };
        let output = out
            .join()
            .map_err(|_| err("PORT_QUERY_FAILED"))?
            .map_err(|_| err("PORT_QUERY_FAILED"))?;
        let stderr = errors
            .join()
            .map_err(|_| err("PORT_QUERY_FAILED"))?
            .map_err(|_| err("PORT_QUERY_FAILED"))?;
        // lsof returns 1 when no visible sockets match. Do not turn diagnostic
        // failures into a misleading "port free" result.
        if !stderr.is_empty()
            || !(status.success() || status.code() == Some(1) && output.is_empty())
        {
            return Err(err("PORT_QUERY_FAILED"));
        }
        Ok(parse_lsof(&output, port))
    }

    pub fn run(method: &str, params: Value) -> Result<Value, PluginError> {
        let port = params["port"].as_u64().unwrap() as u16;
        let protocol = params["protocol"].as_str().unwrap();
        let protected = protected_pids()?;
        if method.ends_with("/list") {
            let processes: Vec<_> = query(port, protocol)?
                .into_iter()
                .map(|owner| {
                    let started = process_info(owner.pid).map(|v| v.1).unwrap_or_default();
                    let can_kill = !protected.contains(&owner.pid)
                        && !started.is_empty()
                        && unsafe { libc::kill(owner.pid as i32, 0) } == 0;
                    json!({"pid":owner.pid,"name":owner.name,"started":started,"canKill":can_kill,
                    "addresses":owner.addresses,"states":owner.states})
                })
                .collect();
            return Ok(
                json!({"port":port,"protocol":protocol,"processes":processes,
                "supportsGraceful":true,"visibilityLimited":true}),
            );
        }
        let pid = params["pid"].as_u64().unwrap() as u32;
        if protected.contains(&pid) {
            return Err(err("PORT_PROCESS_PROTECTED"));
        }
        #[cfg(target_os = "linux")]
        let handle = {
            use std::os::fd::{FromRawFd, OwnedFd};
            // Pin the task before checking its identity. Never fall back to a
            // bare PID signal on older kernels where this operation is absent.
            let fd = unsafe { libc::syscall(libc::SYS_pidfd_open, pid as i32, 0) };
            if fd < 0 {
                return Err(err(
                    if std::io::Error::last_os_error().raw_os_error() == Some(libc::ENOSYS) {
                        "PORT_PIDFD_UNAVAILABLE"
                    } else {
                        "PORT_KILL_FAILED"
                    },
                ));
            }
            unsafe { OwnedFd::from_raw_fd(fd as i32) }
        };
        let expected = params["started"].as_str().unwrap();
        let matches_identity = || process_info(pid).is_some_and(|(_, started)| started == expected);
        if !matches_identity()
            || !query(port, protocol)?.iter().any(|owner| owner.pid == pid)
            || !matches_identity()
        {
            return Err(err("PORT_PROCESS_CHANGED"));
        }
        let force = params["force"].as_bool().unwrap_or(false);
        let signal = if force { libc::SIGKILL } else { libc::SIGTERM };
        #[cfg(target_os = "linux")]
        let sent = {
            use std::os::fd::AsRawFd;
            unsafe {
                libc::syscall(
                    libc::SYS_pidfd_send_signal,
                    handle.as_raw_fd(),
                    signal,
                    std::ptr::null::<libc::siginfo_t>(),
                    0,
                )
            }
        };
        #[cfg(target_os = "macos")]
        let sent = unsafe { libc::kill(pid as i32, signal) };
        if sent != 0 {
            return Err(err("PORT_KILL_FAILED"));
        }
        let deadline = Instant::now() + Duration::from_secs(2);
        while matches_identity() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(50));
        }
        Ok(json!({"killed":!matches_identity(),"signalSent":true,"pid":pid}))
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        #[test]
        fn live_tcp_udp_and_termination() {
            for force in [false, true] {
                // Spawn only a disposable child of this test binary.
                let mut child = Command::new(std::env::current_exe().unwrap())
                    .args([
                        "--exact",
                        "ports::unix::native::tests::listener_fixture",
                        "--ignored",
                        "--nocapture",
                    ])
                    .env("DBX_PORT_TEST_IGNORE_TERM", if force { "1" } else { "0" })
                    .stdout(Stdio::piped())
                    .spawn()
                    .unwrap();
                struct Cleanup(std::process::Child);
                impl Drop for Cleanup {
                    fn drop(&mut self) {
                        let _ = self.0.kill();
                        let _ = self.0.wait();
                    }
                }
                use std::io::BufRead;
                let reader = std::io::BufReader::new(child.stdout.take().unwrap());
                let mut fixture = Cleanup(child);
                let line = reader
                    .lines()
                    .map(Result::unwrap)
                    .find(|line| line.starts_with("PORT_FIXTURE:"))
                    .unwrap();
                let ports: Vec<u16> = line
                    .trim_start_matches("PORT_FIXTURE:")
                    .split(',')
                    .map(|v| v.parse().unwrap())
                    .collect();
                let pid = fixture.0.id();
                let list = run(
                    "toolbox/ports/list",
                    json!({"port":ports[0],"protocol":"tcp"}),
                )
                .unwrap();
                let row = list["processes"]
                    .as_array()
                    .unwrap()
                    .iter()
                    .find(|row| row["pid"] == pid)
                    .unwrap();
                assert_eq!(row["canKill"], true);
                assert!(query(ports[1], "udp")
                    .unwrap()
                    .iter()
                    .any(|row| row.pid == pid));
                let mut request = json!({"port":ports[0],"protocol":"tcp","pid":pid,"started":"0","confirm":true});
                assert!(run("toolbox/ports/kill", request.clone()).is_err());
                assert!(fixture.0.try_wait().unwrap().is_none());
                request["started"] = row["started"].clone();
                if force {
                    assert_eq!(
                        run("toolbox/ports/kill", request.clone()).unwrap()["killed"],
                        false
                    );
                    assert!(fixture.0.try_wait().unwrap().is_none());
                    request["force"] = json!(true);
                }
                assert_eq!(
                    run("toolbox/ports/kill", request).unwrap()["signalSent"],
                    true
                );
                fixture.0.wait().unwrap();
                assert!(query(ports[0], "tcp")
                    .unwrap()
                    .iter()
                    .all(|row| row.pid != pid));
            }
        }
        #[test]
        #[ignore = "subprocess fixture; launched only by live_tcp_udp_and_termination"]
        fn listener_fixture() {
            if std::env::var("DBX_PORT_TEST_IGNORE_TERM").as_deref() == Ok("1") {
                unsafe {
                    libc::signal(libc::SIGTERM, libc::SIG_IGN);
                }
            }
            let tcp = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
            let udp = std::net::UdpSocket::bind("127.0.0.1:0").unwrap();
            println!(
                "PORT_FIXTURE:{},{}",
                tcp.local_addr().unwrap().port(),
                udp.local_addr().unwrap().port()
            );
            loop {
                std::thread::sleep(Duration::from_secs(1));
            }
        }
    }
}

#[cfg(any(target_os = "linux", target_os = "macos"))]
pub use native::run;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn lsof_filters_remote_ports_and_merges_ipv4_ipv6() {
        let input = b"p123\0cnode app\0\nf10\0n127.0.0.1:3000->127.0.0.1:50000\0TST=ESTABLISHED\0\nf11\0n[::1]:3000\0TST=LISTEN\0\np456\0cclient\0\nf8\0n127.0.0.1:50000->127.0.0.1:3000\0TST=ESTABLISHED\0\n";
        let rows = parse_lsof(input, 3000);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].pid, 123);
        assert_eq!(rows[0].name, "node app");
        assert_eq!(rows[0].addresses, ["127.0.0.1", "[::1]"]);
        assert_eq!(rows[0].states, ["ESTABLISHED", "LISTEN"]);
        assert!(parse_lsof(input, 300).is_empty());
        assert!(parse_lsof(b"", 3000).is_empty());
    }
    #[test]
    fn udp_wildcard_and_duplicate_descriptors() {
        let rows = parse_lsof(b"p12\0cservice\0\nf3\0n*:53\0\nf4\0n*:53\0\n", 53);
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].addresses, ["*"]);
    }
    #[test]
    fn proc_stat_handles_parentheses_spaces_and_start_ticks() {
        let fields = format!(
            "99 (worker ) name) S 42 {} 123456 0",
            vec!["0"; 17].join(" ")
        );
        assert_eq!(parse_proc_stat(&fields), Some((42, "123456".to_owned())));
        assert!(parse_proc_stat("broken").is_none());
    }
}
