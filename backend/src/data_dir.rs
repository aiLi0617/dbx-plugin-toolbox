use std::ffi::OsString;
use std::fs::{self, OpenOptions};
use std::io;
use std::path::{Path, PathBuf};

use dbx_plugin_sdk::PluginError;

use crate::helpers::err;

const PLUGIN_ID: &str = "io.github.aili0617.toolbox";
const GROUPS: [[&str; 2]; 2] = [
    ["prefs.json", "prefs.json.bak"],
    ["keystore", "keystore.bak"],
];
const MIGRATED: &str = ".legacy-migration-v1.done";
const PENDING: &str = ".legacy-migration-v1.pending";

/// Official hosts already scope this path; custom roots get a plugin namespace.
pub fn data_dir() -> Result<PathBuf, PluginError> {
    let target = resolve_data_dir(std::env::var_os("DBX_PLUGIN_DATA_DIR"))?;
    // A completed migration never needs access to the old directory again.
    if !regular_file_exists(&target.join(MIGRATED)).map_err(migration_error)? {
        let legacy = dirs::data_dir()
            .ok_or_else(|| err("Cannot resolve user data directory"))?
            .join(PLUGIN_ID);
        migrate_legacy(&target, &legacy).map_err(migration_error)?;
    }
    Ok(target)
}

fn migration_error(error: io::Error) -> PluginError {
    err(format!(
        "Failed to migrate Toolbox data; original files are preserved: {error}"
    ))
}

// Do not treat permission failures, directories or dangling links as "no data".
fn regular_file_exists(path: &Path) -> io::Result<bool> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_file() => Ok(true),
        Ok(_) => Err(io::Error::new(
            io::ErrorKind::InvalidData,
            format!("Expected a regular data file: {}", path.display()),
        )),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Ok(false),
        Err(error) => Err(error),
    }
}

fn migrate_legacy(target: &Path, legacy: &Path) -> io::Result<()> {
    fs::create_dir_all(target)?;
    // OS-backed lock is released even if a Sidecar crashes. Keep the lock file
    // so concurrent Sidecars cannot accidentally lock different file objects.
    let lock = OpenOptions::new()
        .read(true)
        .write(true)
        .create(true)
        .truncate(false)
        .open(target.join(".legacy-migration-v1.lock"))?;
    lock.lock()?;
    if regular_file_exists(&target.join(MIGRATED))? {
        return Ok(());
    }

    let pending = target.join(PENDING);
    if !pending.try_exists()? {
        let stage = target.join(format!(".legacy-migration-v1.tmp-{}", uuid::Uuid::new_v4()));
        fs::create_dir(&stage)?;
        let result = (|| -> io::Result<()> {
            for group in GROUPS {
                // Never combine an existing destination vault with an old backup.
                let primary_exists = regular_file_exists(&target.join(group[0]))?;
                let backup_exists = regular_file_exists(&target.join(group[1]))?;
                if primary_exists || backup_exists {
                    continue;
                }
                for name in group {
                    let source = legacy.join(name);
                    if regular_file_exists(&source)? {
                        let snapshot = stage.join(name);
                        fs::copy(&source, &snapshot)?;
                        OpenOptions::new().write(true).open(snapshot)?.sync_all()?;
                    }
                }
            }
            // Only complete snapshots become resumable migration transactions.
            fs::rename(&stage, &pending)
        })();
        if result.is_err() {
            cleanup_snapshot(&stage);
        }
        result?;
    }

    for name in GROUPS.into_iter().flatten() {
        let snapshot = pending.join(name);
        if !regular_file_exists(&snapshot)? {
            continue;
        }
        let destination = target.join(name);
        // Linking within the same filesystem publishes the complete snapshot
        // atomically and fails rather than overwriting any destination file.
        match fs::hard_link(&snapshot, &destination) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
                if fs::read(&snapshot)? != fs::read(&destination)? {
                    return Err(io::Error::new(
                        io::ErrorKind::AlreadyExists,
                        format!("Migration destination changed: {name}"),
                    ));
                }
            }
            Err(error) => return Err(error),
        }
    }
    // An empty marker is sufficient: it is published only after all data files.
    OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(target.join(MIGRATED))?
        .sync_all()?;
    cleanup_snapshot(&pending);
    Ok(())
}

fn cleanup_snapshot(directory: &Path) {
    for name in GROUPS.into_iter().flatten() {
        let _ = fs::remove_file(directory.join(name));
    }
    let _ = fs::remove_dir(directory);
}

fn resolve_data_dir(value: Option<OsString>) -> Result<PathBuf, PluginError> {
    let value = value.filter(|value| !value.is_empty()).ok_or_else(|| {
        err("DBX_PLUGIN_DATA_DIR is not set; launch through DBX or configure a development data directory")
    })?;
    let path = PathBuf::from(value);
    if !path.is_absolute() {
        return Err(err("DBX_PLUGIN_DATA_DIR must be an absolute path"));
    }
    if path.file_name() == Some(std::ffi::OsStr::new(PLUGIN_ID)) {
        Ok(path)
    } else {
        Ok(path.join(PLUGIN_ID))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture(PathBuf);

    impl Fixture {
        fn new() -> Self {
            let root =
                std::env::temp_dir().join(format!("toolbox-migration-{}", uuid::Uuid::new_v4()));
            fs::create_dir_all(root.join("old")).unwrap();
            fs::create_dir_all(root.join("new")).unwrap();
            Self(root)
        }

        fn old(&self) -> PathBuf {
            self.0.join("old")
        }

        fn new_dir(&self) -> PathBuf {
            self.0.join("new")
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn migrates_files_and_backups_without_changing_originals_or_reimporting() {
        let fixture = Fixture::new();
        for name in GROUPS.into_iter().flatten() {
            fs::write(fixture.old().join(name), name).unwrap();
        }
        migrate_legacy(&fixture.new_dir(), &fixture.old()).unwrap();
        for name in GROUPS.into_iter().flatten() {
            assert_eq!(
                fs::read(fixture.new_dir().join(name)).unwrap(),
                name.as_bytes()
            );
            assert_eq!(fs::read(fixture.old().join(name)).unwrap(), name.as_bytes());
        }
        fs::write(fixture.new_dir().join("keystore"), b"new vault").unwrap();
        fs::remove_file(fixture.new_dir().join("prefs.json")).unwrap();
        migrate_legacy(&fixture.new_dir(), &fixture.old()).unwrap();
        assert!(!fixture.new_dir().join("prefs.json").exists());
        assert_eq!(
            fs::read(fixture.new_dir().join("keystore")).unwrap(),
            b"new vault"
        );
        assert_eq!(
            fs::read(fixture.old().join("keystore")).unwrap(),
            b"keystore"
        );
    }

    #[test]
    fn skips_whole_groups_when_primary_or_backup_already_exists() {
        let fixture = Fixture::new();
        for name in GROUPS.into_iter().flatten() {
            fs::write(fixture.old().join(name), b"old").unwrap();
        }
        fs::write(fixture.new_dir().join("keystore"), b"existing vault").unwrap();
        fs::write(fixture.new_dir().join("prefs.json.bak"), b"existing prefs").unwrap();
        migrate_legacy(&fixture.new_dir(), &fixture.old()).unwrap();
        assert_eq!(
            fs::read(fixture.new_dir().join("keystore")).unwrap(),
            b"existing vault"
        );
        assert_eq!(
            fs::read(fixture.new_dir().join("prefs.json.bak")).unwrap(),
            b"existing prefs"
        );
        assert!(!fixture.new_dir().join("keystore.bak").exists());
        assert!(!fixture.new_dir().join("prefs.json").exists());
    }

    #[test]
    fn resumes_a_partially_published_snapshot() {
        let fixture = Fixture::new();
        let pending = fixture.new_dir().join(PENDING);
        fs::create_dir(&pending).unwrap();
        fs::write(pending.join("keystore"), b"vault").unwrap();
        fs::write(pending.join("keystore.bak"), b"backup").unwrap();
        fs::hard_link(pending.join("keystore"), fixture.new_dir().join("keystore")).unwrap();
        migrate_legacy(&fixture.new_dir(), &fixture.old()).unwrap();
        assert_eq!(
            fs::read(fixture.new_dir().join("keystore.bak")).unwrap(),
            b"backup"
        );
        assert!(fixture.new_dir().join(MIGRATED).exists());
        assert!(!pending.exists());
    }

    #[test]
    fn interrupted_migration_rejects_conflicting_destination() {
        let fixture = Fixture::new();
        let pending = fixture.new_dir().join(PENDING);
        fs::create_dir(&pending).unwrap();
        fs::write(pending.join("keystore"), b"old vault").unwrap();
        fs::write(fixture.new_dir().join("keystore"), b"different vault").unwrap();
        assert!(migrate_legacy(&fixture.new_dir(), &fixture.old()).is_err());
        assert_eq!(
            fs::read(fixture.new_dir().join("keystore")).unwrap(),
            b"different vault"
        );
        assert!(!fixture.new_dir().join(MIGRATED).exists());
    }

    #[test]
    fn migrates_backup_only_and_handles_absent_legacy_directory() {
        let fixture = Fixture::new();
        fs::write(fixture.old().join("keystore.bak"), b"backup").unwrap();
        migrate_legacy(&fixture.new_dir(), &fixture.old()).unwrap();
        assert!(!fixture.new_dir().join("keystore").exists());
        assert_eq!(
            fs::read(fixture.new_dir().join("keystore.bak")).unwrap(),
            b"backup"
        );
        let empty_target = fixture.0.join("empty");
        migrate_legacy(&empty_target, &fixture.0.join("missing")).unwrap();
        assert!(empty_target.join(MIGRATED).exists());
    }

    #[test]
    fn concurrent_migrations_share_the_same_transaction() {
        let fixture = Fixture::new();
        fs::write(fixture.old().join("keystore"), b"vault").unwrap();
        std::thread::scope(|scope| {
            for _ in 0..4 {
                let fixture = &fixture;
                scope.spawn(move || migrate_legacy(&fixture.new_dir(), &fixture.old()).unwrap());
            }
        });
        assert_eq!(
            fs::read(fixture.new_dir().join("keystore")).unwrap(),
            b"vault"
        );
    }

    #[test]
    fn rejects_missing_empty_and_relative_directories() {
        assert!(resolve_data_dir(None).is_err());
        assert!(resolve_data_dir(Some(OsString::new())).is_err());
        assert!(resolve_data_dir(Some(OsString::from("relative/data"))).is_err());
    }

    #[test]
    fn preserves_already_scoped_host_directory() {
        let path = std::env::temp_dir().join("DBX plugin data").join(PLUGIN_ID);
        assert_eq!(
            resolve_data_dir(Some(path.clone().into_os_string())).unwrap(),
            path
        );
    }

    #[test]
    fn namespaces_custom_shared_root() {
        let root = std::env::temp_dir().join("DBX 插件 data");
        assert_eq!(
            resolve_data_dir(Some(root.clone().into_os_string())).unwrap(),
            root.join(PLUGIN_ID)
        );
    }

    #[test]
    fn empty_legacy_directory_is_a_normal_first_run() {
        let fixture = Fixture::new();
        migrate_legacy(&fixture.new_dir(), &fixture.old()).unwrap();
        assert!(fixture.new_dir().join(MIGRATED).is_file());
        for name in GROUPS.into_iter().flatten() {
            assert!(!fixture.new_dir().join(name).exists());
        }
    }

    #[test]
    fn a_single_legacy_file_does_not_require_other_files() {
        let fixture = Fixture::new();
        fs::write(fixture.old().join("prefs.json"), b"prefs").unwrap();
        migrate_legacy(&fixture.new_dir(), &fixture.old()).unwrap();
        assert_eq!(
            fs::read(fixture.new_dir().join("prefs.json")).unwrap(),
            b"prefs"
        );
        assert!(!fixture.new_dir().join("keystore").exists());
        assert!(!fixture.new_dir().join("prefs.json.bak").exists());
    }

    #[test]
    fn failed_snapshot_preserves_source_and_can_be_retried() {
        let fixture = Fixture::new();
        fs::write(fixture.old().join("prefs.json"), b"prefs").unwrap();
        fs::create_dir(fixture.old().join("keystore")).unwrap();
        assert!(migrate_legacy(&fixture.new_dir(), &fixture.old()).is_err());
        assert!(!fixture.new_dir().join(MIGRATED).exists());
        assert!(!fixture.new_dir().join("prefs.json").exists());
        assert_eq!(
            fs::read(fixture.old().join("prefs.json")).unwrap(),
            b"prefs"
        );
        fs::remove_dir(fixture.old().join("keystore")).unwrap();
        fs::write(fixture.old().join("keystore"), b"vault").unwrap();
        migrate_legacy(&fixture.new_dir(), &fixture.old()).unwrap();
        assert_eq!(
            fs::read(fixture.new_dir().join("keystore")).unwrap(),
            b"vault"
        );
    }

    #[test]
    fn invalid_completion_marker_does_not_hide_unmigrated_data() {
        let fixture = Fixture::new();
        fs::create_dir(fixture.new_dir().join(MIGRATED)).unwrap();
        assert!(migrate_legacy(&fixture.new_dir(), &fixture.old()).is_err());
    }

    #[test]
    fn invalid_target_does_not_modify_legacy_files() {
        let fixture = Fixture::new();
        fs::write(fixture.old().join("keystore"), b"vault").unwrap();
        let target = fixture.0.join("not-a-directory");
        fs::write(&target, b"existing file").unwrap();
        assert!(migrate_legacy(&target, &fixture.old()).is_err());
        assert_eq!(fs::read(target).unwrap(), b"existing file");
        assert_eq!(fs::read(fixture.old().join("keystore")).unwrap(), b"vault");
    }
}
