//! Capability-confined, read-only project file access.
//!
//! The selected directory is opened as a `cap_std` directory capability.  All
//! subsequent operations are relative to that capability; no operation accepts
//! an absolute path and there is no command which lets the webview set a root.

use cap_std::ambient_authority;
use cap_std::fs::{Dir, DirEntry};
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::io::Read;
use std::path::{Component, Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;

const MAX_READ_BYTES: usize = 64 * 1024;
const MAX_OUTPUT_BYTES: usize = 16 * 1024;
const MAX_DEPTH: usize = 8;
const MAX_VISITED_ENTRIES: usize = 2_000;
const MAX_SCANNED_FILES: usize = 500;
const MAX_MATCHES: usize = 80;
const MAX_ACCESSED_FILES: usize = 100;
const MAX_SCAN_BYTES: usize = 4 * 1024 * 1024;
const MAX_QUERY_CHARS: usize = 200;
const TIME_BUDGET: Duration = Duration::from_secs(2);

const TEXT_EXTENSIONS: &[&str] = &[
    "ts", "tsx", "js", "jsx", "json", "css", "html", "htm", "rs", "toml", "md", "txt",
];

struct ApprovedRoot {
    path: PathBuf,
    dir: Dir,
}

#[derive(Default)]
pub struct FileAccessState {
    approved_root: Arc<Mutex<Option<Arc<ApprovedRoot>>>>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ApprovedFolder {
    pub path: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub path: String,
    pub name: String,
    pub kind: String,
    pub size_bytes: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileListResult {
    pub directory: String,
    pub entries: Vec<FileEntry>,
    pub truncated: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileReadResult {
    pub path: String,
    pub content: String,
    pub truncated: bool,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FilenameMatch {
    pub path: String,
    pub kind: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TextMatch {
    pub path: String,
    pub line: usize,
    pub column: usize,
    pub preview: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult<T> {
    pub matches: Vec<T>,
    pub truncated: bool,
    pub skipped: usize,
    pub scanned_files: usize,
    pub accessed_files: Vec<String>,
}

fn error(message: &str) -> String {
    message.to_string()
}

fn normalized_name(name: &str) -> String {
    name.trim_end_matches(['.', ' ']).to_ascii_lowercase()
}

fn is_reserved_windows_name(name: &str) -> bool {
    let stem = normalized_name(name)
        .split('.')
        .next()
        .unwrap_or_default();
    matches!(
        stem,
        "con"
            | "prn"
            | "aux"
            | "nul"
            | "com1"
            | "com2"
            | "com3"
            | "com4"
            | "com5"
            | "com6"
            | "com7"
            | "com8"
            | "com9"
            | "lpt1"
            | "lpt2"
            | "lpt3"
            | "lpt4"
            | "lpt5"
            | "lpt6"
            | "lpt7"
            | "lpt8"
            | "lpt9"
    )
}

fn is_sensitive_name(name: &str) -> bool {
    let lower = normalized_name(name);
    let compact = lower.replace(['_', '-', ' '], "");
    lower.starts_with('.')
        || lower == ".npmrc"
        || lower.contains("credential")
        || lower.contains("secret")
        || lower.contains("password")
        || lower.contains("passwd")
        || lower.contains("token")
        || compact.contains("privatekey")
        || lower == "id_rsa"
        || lower == "id_ed25519"
        || lower.ends_with(".pem")
        || lower.ends_with(".key")
        || lower.ends_with(".p12")
        || lower.ends_with(".pfx")
        || lower.ends_with(".db")
        || lower.ends_with(".sqlite")
        || lower.ends_with(".sqlite3")
        || lower.ends_with(".sqlite-wal")
        || lower.ends_with(".sqlite-shm")
}

fn is_sensitive_directory(name: &str) -> bool {
    let lower = normalized_name(name);
    matches!(
        lower.as_str(),
        "database"
            | "databases"
            | "db"
            | "binary"
            | "binaries"
            | "bin"
            | "dependency"
            | "dependencies"
            | "deps"
            | "node_modules"
            | "target"
            | "build"
            | "dist"
            | "out"
            | "vendor"
            | "obj"
            | "coverage"
            | ".git"
            | ".hg"
            | ".svn"
            | ".ssh"
    )
}

fn is_allowed_text_file(path: &Path) -> bool {
    let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
        return false;
    };
    if is_sensitive_name(name) {
        return false;
    }
    path.extension()
        .and_then(|value| value.to_str())
        .map(|extension| {
            TEXT_EXTENSIONS
                .iter()
                .any(|allowed| extension.eq_ignore_ascii_case(allowed))
        })
        .unwrap_or(false)
}

fn relative_path(value: &str) -> Result<PathBuf, String> {
    if value.is_empty() {
        return Ok(PathBuf::new());
    }
    if value.contains('\0') || value.contains('\\') || value.contains(':') {
        return Err(error("Only safe paths relative to the approved folder are allowed"));
    }
    let path = Path::new(value);
    let mut depth = 0;
    for component in path.components() {
        match component {
            Component::Normal(part) => {
                let name = part.to_string_lossy();
                if name.is_empty()
                    || name.ends_with(['.', ' '])
                    || is_reserved_windows_name(&name)
                    || is_sensitive_name(&name)
                    || is_sensitive_directory(&name)
                {
                    return Err(error("The requested path contains a prohibited component"));
                }
                depth += 1;
            }
            Component::CurDir | Component::ParentDir | Component::Prefix(_) | Component::RootDir => {
                return Err(error("Only safe paths relative to the approved folder are allowed"));
            }
        }
    }
    if depth > MAX_DEPTH {
        return Err(error("The requested path is too deep"));
    }
    Ok(path.to_path_buf())
}

fn display_relative(path: &Path) -> String {
    if path.as_os_str().is_empty() {
        ".".to_string()
    } else {
        path.to_string_lossy().replace('\\', "/")
    }
}

fn check_reparse_or_symlink(metadata: &fs::Metadata) -> bool {
    if metadata.file_type().is_symlink() {
        return true;
    }
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x0400;
        if metadata.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0 {
            return true;
        }
    }
    false
}

#[cfg(unix)]
fn is_hardlink(metadata: &fs::Metadata) -> bool {
    use std::os::unix::fs::MetadataExt;
    metadata.nlink() > 1
}

#[cfg(windows)]
fn is_hardlink(metadata: &fs::Metadata) -> bool {
    use std::os::windows::fs::MetadataExt;
    metadata.number_of_links() > 1
}

#[cfg(not(any(unix, windows)))]
fn is_hardlink(_metadata: &fs::Metadata) -> bool {
    // This target does not expose a portable nlink through std metadata.
    false
}

fn check_relative_components(root: &ApprovedRoot, relative: &Path) -> Result<(), String> {
    let mut current = PathBuf::new();
    for component in relative.components() {
        let Component::Normal(name) = component else {
            return Err(error("Only safe paths relative to the approved folder are allowed"));
        };
        current.push(name);
        let metadata = root
            .dir
            .symlink_metadata(&current)
            .map_err(|_| error("The requested file or directory does not exist"))?;
        if check_reparse_or_symlink(&metadata) {
            return Err(error("Symbolic links and reparse points are not accessed"));
        }
    }
    Ok(())
}

fn open_root(path: PathBuf) -> Result<ApprovedRoot, String> {
    if !path.is_absolute() {
        return Err(error("The selected folder must be an absolute path"));
    }
    let metadata = fs::symlink_metadata(&path)
        .map_err(|_| error("The selected folder could not be opened"))?;
    if check_reparse_or_symlink(&metadata) || !metadata.is_dir() {
        return Err(error("The selected path is not a regular folder"));
    }
    if is_sensitive_directory(path.file_name().and_then(|n| n.to_str()).unwrap_or_default())
        || is_sensitive_name(path.file_name().and_then(|n| n.to_str()).unwrap_or_default())
    {
        return Err(error("The selected folder is not an approved project folder"));
    }
    let canonical = fs::canonicalize(&path)
        .map_err(|_| error("The selected folder could not be opened"))?;
    let dir = Dir::open_ambient_dir(&canonical, ambient_authority())
        .map_err(|_| error("The selected folder could not be opened"))?;
    Ok(ApprovedRoot { path: canonical, dir })
}

fn approved_root(state: &FileAccessState) -> Result<Arc<ApprovedRoot>, String> {
    state
        .approved_root
        .lock()
        .map_err(|_| error("File access state is unavailable"))?
        .clone()
        .ok_or_else(|| error("No project folder is approved. Select a folder first."))
}

fn name_from_entry(entry: &DirEntry) -> Option<String> {
    entry.file_name().to_str().map(ToOwned::to_owned)
}

fn sorted_entries(dir: &Dir, relative: &Path) -> Result<Vec<DirEntry>, String> {
    let relative = if relative.as_os_str().is_empty() { Path::new(".") } else { relative };
    let mut entries: Vec<_> = dir
        .read_dir(relative)
        .map_err(|_| error("The folder cannot be read"))?
        .take(MAX_VISITED_ENTRIES + 1)
        .collect::<Result<_, _>>()
        .map_err(|_| error("A folder entry could not be read"))?;
    entries.sort_by_key(|entry| entry.file_name());
    Ok(entries)
}

fn list_root(root: Arc<ApprovedRoot>, requested: String) -> Result<FileListResult, String> {
    let relative = relative_path(&requested)?;
    check_relative_components(&root, &relative)?;
    if !relative.as_os_str().is_empty() {
        let metadata = root
            .dir
            .symlink_metadata(&relative)
            .map_err(|_| error("The requested file or directory does not exist"))?;
        if check_reparse_or_symlink(&metadata) || !metadata.is_dir() {
            return Err(error("The requested path is not a directory"));
        }
    }

    let directory = display_relative(&relative);
    let entries = sorted_entries(&root.dir, &relative)?;
    let mut output = Vec::new();
    let mut truncated = entries.len() > MAX_VISITED_ENTRIES;
    for (visited, entry) in entries.into_iter().enumerate() {
        if visited >= MAX_VISITED_ENTRIES {
            truncated = true;
            break;
        }
        let Some(name) = name_from_entry(&entry) else { continue };
        if is_sensitive_name(&name) || is_sensitive_directory(&name) {
            continue;
        }
        let child_relative = relative.join(&name);
        let Ok(metadata) = root.dir.symlink_metadata(&child_relative) else {
            truncated = true;
            continue;
        };
        if check_reparse_or_symlink(&metadata) || (metadata.is_file() && is_hardlink(&metadata)) {
            continue;
        }
        let kind = if metadata.is_dir() {
            "directory"
        } else if metadata.is_file() && is_allowed_text_file(Path::new(&name)) {
            "file"
        } else {
            continue;
        };
        let candidate = FileEntry {
            path: display_relative(&child_relative),
            name,
            kind: kind.to_string(),
            size_bytes: if metadata.is_file() { metadata.len() } else { 0 },
        };
        let mut trial = output.clone();
        trial.push(candidate.clone());
        let trial_result = FileListResult {
            directory: directory.clone(),
            entries: trial,
            truncated: false,
        };
        if serde_json::to_vec(&trial_result).map(|v| v.len()).unwrap_or(MAX_OUTPUT_BYTES + 1)
            > MAX_OUTPUT_BYTES
        {
            truncated = true;
            break;
        }
        output.push(candidate);
    }
    Ok(FileListResult { directory, entries: output, truncated })
}

fn read_root(root: Arc<ApprovedRoot>, requested: String) -> Result<FileReadResult, String> {
    let relative = relative_path(&requested)?;
    if relative.as_os_str().is_empty() {
        return Err(error("A file path is required"));
    }
    check_relative_components(&root, &relative)?;
    let metadata = root
        .dir
        .symlink_metadata(&relative)
        .map_err(|_| error("The requested file does not exist"))?;
    if !metadata.is_file() || is_hardlink(&metadata) || !is_allowed_text_file(&relative) {
        return Err(error("Only approved UTF-8 text and source-code files can be read"));
    }
    let mut file = root
        .dir
        .open(&relative)
        .map_err(|_| error("The file cannot be read"))?;
    let mut bytes = Vec::with_capacity(MAX_READ_BYTES + 1);
    file.by_ref()
        .take((MAX_READ_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|_| error("The file cannot be read"))?;
    let input_truncated = bytes.len() > MAX_READ_BYTES;
    if input_truncated {
        bytes.truncate(MAX_READ_BYTES);
    }
    if bytes.contains(&0) {
        return Err(error("NUL bytes are not allowed in text files"));
    }
    let text = match String::from_utf8(bytes) {
        Ok(text) => text,
        Err(invalid) if input_truncated && invalid.utf8_error().error_len().is_none() => {
            let valid = invalid.utf8_error().valid_up_to();
            String::from_utf8(invalid.into_bytes()[..valid].to_vec())
                .map_err(|_| error("The selected file is not UTF-8 text"))?
        }
        Err(_) => return Err(error("The selected file is not UTF-8 text")),
    };
    let (content, output_truncated) = truncate_utf8(&text, MAX_OUTPUT_BYTES);
    Ok(FileReadResult {
        path: display_relative(&relative),
        content,
        truncated: input_truncated || output_truncated,
    })
}

fn truncate_utf8(value: &str, max_bytes: usize) -> (String, bool) {
    if value.len() <= max_bytes {
        return (value.to_string(), false);
    }
    let mut end = max_bytes;
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    (value[..end].to_string(), true)
}

struct WalkState {
    visited_entries: usize,
    scanned_files: usize,
    skipped: usize,
    truncated: bool,
    deadline: Instant,
}

impl WalkState {
    fn limited(&self) -> bool {
        self.visited_entries >= MAX_VISITED_ENTRIES
            || self.scanned_files >= MAX_SCANNED_FILES
            || Instant::now() >= self.deadline
    }
    fn visit(&mut self) -> bool {
        if self.limited() {
            self.truncated = true;
            return false;
        }
        self.visited_entries += 1;
        true
    }
}

fn walk_files(
    root: &Arc<ApprovedRoot>,
    directory: &Path,
    depth: usize,
    seen: &mut HashSet<PathBuf>,
    state: &mut WalkState,
    output: &mut Vec<PathBuf>,
) {
    if depth > MAX_DEPTH || state.limited() {
        state.truncated = true;
        return;
    }
    if !seen.insert(directory.to_path_buf()) {
        state.skipped += 1;
        return;
    }
    let Ok(entries) = sorted_entries(&root.dir, directory) else {
        state.skipped += 1;
        return;
    };
    for entry in entries {
        if !state.visit() {
            return;
        }
        let Some(name) = name_from_entry(&entry) else {
            state.skipped += 1;
            continue;
        };
        if is_sensitive_name(&name) || is_sensitive_directory(&name) {
            state.skipped += 1;
            continue;
        }
        let child = directory.join(&name);
        let Ok(metadata) = root.dir.symlink_metadata(&child) else {
            state.skipped += 1;
            continue;
        };
        if check_reparse_or_symlink(&metadata) || (metadata.is_file() && is_hardlink(&metadata)) {
            state.skipped += 1;
            continue;
        }
        if metadata.is_dir() {
            if depth >= MAX_DEPTH {
                state.skipped += 1;
                state.truncated = true;
            } else {
                walk_files(root, &child, depth + 1, seen, state, output);
            }
        } else if metadata.is_file() && is_allowed_text_file(Path::new(&name)) {
            if state.scanned_files >= MAX_SCANNED_FILES {
                state.truncated = true;
                return;
            }
            state.scanned_files += 1;
            output.push(child);
        }
    }
}

fn query(value: &str, message: &str) -> Result<String, String> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > MAX_QUERY_CHARS || value.contains('\0') {
        return Err(error(message));
    }
    Ok(value.to_lowercase())
}

fn fit_matches<T: Serialize + Clone>(matches: &mut Vec<T>, truncated: &mut bool, make: impl Fn(&[T], bool) -> SearchResult<T>) {
    while !serde_json::to_vec(&make(matches, *truncated))
        .map(|bytes| bytes.len() <= MAX_OUTPUT_BYTES)
        .unwrap_or(false)
    {
        if matches.pop().is_none() {
            *truncated = true;
            break;
        }
        *truncated = true;
    }
}

fn search_filenames_root(root: Arc<ApprovedRoot>, raw_query: String) -> Result<SearchResult<FilenameMatch>, String> {
    let query = query(&raw_query, "Filename search needs a short non-empty query")?;
    let mut state = WalkState {
        visited_entries: 0,
        scanned_files: 0,
        skipped: 0,
        truncated: false,
        deadline: Instant::now() + TIME_BUDGET,
    };
    let mut files = Vec::new();
    walk_files(&root, Path::new(""), 0, &mut HashSet::new(), &mut state, &mut files);
    let mut matches = Vec::new();
    for path in files {
        if path.to_string_lossy().to_lowercase().contains(&query) {
            if matches.len() >= MAX_MATCHES {
                state.truncated = true;
                break;
            }
            matches.push(FilenameMatch { path: display_relative(&path), kind: "file".to_string() });
        }
    }
    let skipped = state.skipped;
    let scanned_files = state.scanned_files;
    fit_matches(&mut matches, &mut state.truncated, |items, truncated| SearchResult {
        matches: items.to_vec(),
        truncated,
        skipped,
        scanned_files,
        accessed_files: Vec::new(),
    });
    Ok(SearchResult { matches, truncated: state.truncated, skipped: state.skipped, scanned_files: state.scanned_files, accessed_files: Vec::new() })
}

fn search_text_root(root: Arc<ApprovedRoot>, raw_query: String) -> Result<SearchResult<TextMatch>, String> {
    let query = query(&raw_query, "Text search needs a short non-empty query")?;
    let mut state = WalkState {
        visited_entries: 0,
        scanned_files: 0,
        skipped: 0,
        truncated: false,
        deadline: Instant::now() + TIME_BUDGET,
    };
    let mut files = Vec::new();
    walk_files(&root, Path::new(""), 0, &mut HashSet::new(), &mut state, &mut files);
    let mut matches = Vec::new();
    let mut accessed_files = Vec::new();
    let mut scan_bytes = 0;
    for path in files {
        if Instant::now() >= state.deadline || scan_bytes >= MAX_SCAN_BYTES {
            state.truncated = true;
            break;
        }
        if check_relative_components(&root, &path).is_err() {
            state.skipped += 1;
            continue;
        }
        let relative = display_relative(&path);
        let Ok(mut file) = root.dir.open(&path) else {
            state.skipped += 1;
            continue;
        };
        let remaining = MAX_SCAN_BYTES - scan_bytes;
        if remaining < MAX_READ_BYTES + 1 {
            state.truncated = true;
            break;
        }
        let limit = remaining.min(MAX_READ_BYTES + 1);
        let mut bytes = Vec::with_capacity(limit);
        if file.by_ref().take(limit as u64).read_to_end(&mut bytes).is_err() {
            state.skipped += 1;
            continue;
        }
        if bytes.len() > MAX_READ_BYTES || bytes.contains(&0) {
            state.skipped += 1;
            scan_bytes += bytes.len();
            if accessed_files.len() < MAX_ACCESSED_FILES {
                accessed_files.push(relative.clone());
            } else {
                state.truncated = true;
            }
            continue;
        }
        scan_bytes += bytes.len();
        if accessed_files.len() < MAX_ACCESSED_FILES {
            accessed_files.push(relative.clone());
        } else {
            state.truncated = true;
        }
        let Ok(content) = String::from_utf8(bytes) else {
            state.skipped += 1;
            continue;
        };
        for (line_index, line) in content.lines().enumerate() {
            let lower_line = line.to_lowercase();
            if let Some(byte_column) = lower_line.find(&query) {
                let preview = truncate_utf8(line.trim(), 240).0;
                if matches.len() >= MAX_MATCHES {
                    state.truncated = true;
                    break;
                }
                matches.push(TextMatch {
                    path: relative.clone(),
                    line: line_index + 1,
                    column: lower_line[..byte_column].chars().count() + 1,
                    preview,
                });
            }
        }
        if state.truncated || Instant::now() >= state.deadline {
            state.truncated = true;
            break;
        }
    }
    let skipped = state.skipped;
    let scanned_files = state.scanned_files;
    fit_matches(&mut matches, &mut state.truncated, |items, truncated| SearchResult {
        matches: items.to_vec(),
        truncated,
        skipped,
        scanned_files,
        accessed_files.clone(),
    });
    Ok(SearchResult { matches, truncated: state.truncated, skipped: state.skipped, scanned_files: state.scanned_files, accessed_files })
}

#[tauri::command]
pub async fn file_select_folder(
    app: AppHandle,
    window: WebviewWindow,
    state: State<'_, FileAccessState>,
) -> Result<Option<ApprovedFolder>, String> {
    if window.label() != "main" {
        return Err(error("Folder selection is only available from the main window"));
    }
    let opened = tauri::async_runtime::spawn_blocking(move || {
        let Some(selected) = app.dialog().file().set_parent(&window).blocking_pick_folder() else {
            return Ok(None);
        };
        let path = selected
            .into_path()
            .map_err(|_| error("The selected folder path is unavailable"))?;
        open_root(path).map(Some)
    })
        .await
        .map_err(|_| error("The selected folder could not be opened"))??;
    let Some(opened) = opened else { return Ok(None); };
    let result = ApprovedFolder { path: opened.path.to_string_lossy().to_string() };
    *state
        .approved_root
        .lock()
        .map_err(|_| error("File access state is unavailable"))? = Some(Arc::new(opened));
    Ok(Some(result))
}

#[tauri::command]
pub fn file_revoke_folder(state: State<'_, FileAccessState>) -> Result<(), String> {
    *state
        .approved_root
        .lock()
        .map_err(|_| error("File access state is unavailable"))? = None;
    Ok(())
}

#[tauri::command]
pub fn file_get_approved_folder(state: State<'_, FileAccessState>) -> Result<Option<ApprovedFolder>, String> {
    let guard = state.approved_root.lock().map_err(|_| error("File access state is unavailable"))?;
    Ok(guard.as_ref().map(|root| ApprovedFolder { path: root.path.to_string_lossy().to_string() }))
}

#[tauri::command]
pub async fn file_list(state: State<'_, FileAccessState>, relative_path: Option<String>) -> Result<FileListResult, String> {
    let approval = Arc::clone(&state.approved_root);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = approval.lock().map_err(|_| error("File access state is unavailable"))?;
        let root = guard.as_ref().ok_or_else(|| error("No project folder is approved. Select a folder first."))?;
        list_root(Arc::clone(root), relative_path.unwrap_or_default())
    })
        .await
        .map_err(|_| error("File operation failed"))?
}

#[tauri::command]
pub async fn file_read(state: State<'_, FileAccessState>, relative_path: String) -> Result<FileReadResult, String> {
    let approval = Arc::clone(&state.approved_root);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = approval.lock().map_err(|_| error("File access state is unavailable"))?;
        let root = guard.as_ref().ok_or_else(|| error("No project folder is approved. Select a folder first."))?;
        read_root(Arc::clone(root), relative_path)
    })
        .await
        .map_err(|_| error("File operation failed"))?
}

#[tauri::command]
pub async fn file_search_filenames(state: State<'_, FileAccessState>, query: String) -> Result<SearchResult<FilenameMatch>, String> {
    let approval = Arc::clone(&state.approved_root);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = approval.lock().map_err(|_| error("File access state is unavailable"))?;
        let root = guard.as_ref().ok_or_else(|| error("No project folder is approved. Select a folder first."))?;
        search_filenames_root(Arc::clone(root), query)
    })
        .await
        .map_err(|_| error("File operation failed"))?
}

#[tauri::command]
pub async fn file_search_text(state: State<'_, FileAccessState>, query: String) -> Result<SearchResult<TextMatch>, String> {
    let approval = Arc::clone(&state.approved_root);
    tauri::async_runtime::spawn_blocking(move || {
        let guard = approval.lock().map_err(|_| error("File access state is unavailable"))?;
        let root = guard.as_ref().ok_or_else(|| error("No project folder is approved. Select a folder first."))?;
        search_text_root(Arc::clone(root), query)
    })
        .await
        .map_err(|_| error("File operation failed"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn root(name: &str) -> Arc<ApprovedRoot> {
        let path = std::env::temp_dir().join(format!("desktop-ai-companion-file-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).unwrap();
        Arc::new(open_root(path).unwrap())
    }

    fn write(root: &ApprovedRoot, path: &str, content: &[u8]) {
        let path = root.path.join(path);
        if let Some(parent) = path.parent() { fs::create_dir_all(parent).unwrap(); }
        fs::write(path, content).unwrap();
    }

    #[test]
    fn no_approval_and_revoke_are_enforced() {
        let state = FileAccessState::default();
        assert!(approved_root(&state).is_err());
        let selected = root("revoke");
        *state.approved_root.lock().unwrap() = Some(selected);
        assert!(approved_root(&state).is_ok());
        *state.approved_root.lock().unwrap() = None;
        assert!(approved_root(&state).is_err());
    }

    #[test]
    fn rejects_path_forms_and_sensitive_components_at_every_level() {
        for path in ["../x", "a\\b", "/tmp/x", "C:x", "\\\\server\\share", "foo:bar", "a/.env/x", "a/.git/x", "a/private key.txt", "a/password.txt", "a/database/x", "a/node_modules/x", "a/CON.txt"] {
            assert!(relative_path(path).is_err(), "{path}");
        }
    }

    #[test]
    fn reads_unchanged_utf8_and_enforces_output_limit() {
        let root = root("read");
        write(&root, "src/main.rs", b"hello\n");
        let result = read_root(root.clone(), "src/main.rs".to_string()).unwrap();
        assert_eq!(result.content, "hello\n");
        assert!(!result.truncated);
        write(&root, "large.txt", &vec![b'x'; MAX_READ_BYTES]);
        let result = read_root(root.clone(), "large.txt".to_string()).unwrap();
        assert!(result.truncated);
        assert_eq!(result.content.len(), MAX_OUTPUT_BYTES);
        write(&root, "growing.txt", &vec![b'x'; MAX_READ_BYTES + 1]);
        assert!(read_root(root, "growing.txt".to_string()).unwrap().truncated);
    }

    #[test]
    fn direct_nested_sensitive_and_missing_reads_fail() {
        let root = root("sensitive");
        write(&root, "src/ok.txt", b"ok");
        write(&root, "src/.env", b"secret");
        assert!(read_root(root.clone(), "src/ok.txt".to_string()).is_ok());
        assert!(read_root(root.clone(), "src/.env".to_string()).is_err());
        assert!(read_root(root, "missing.txt".to_string()).is_err());
    }

    #[cfg(unix)]
    #[test]
    fn symlink_escape_is_denied() {
        use std::os::unix::fs::symlink;
        let root = root("symlink");
        let outside = root.path.parent().unwrap().join("desktop-ai-companion-outside");
        fs::write(&outside, b"outside").unwrap();
        symlink(&outside, root.path.join("escape.txt")).unwrap();
        assert!(read_root(root.clone(), "escape.txt".to_string()).is_err());
        let _ = fs::remove_file(outside);
    }

    #[test]
    fn list_and_search_report_bounds_and_scan_past_nonmatches() {
        let root = root("search");
        for index in 0..120 { write(&root, &format!("f{index:03}.txt"), b"no match"); }
        write(&root, "target.txt", b"needle here");
        let result = search_text_root(root.clone(), "needle".to_string()).unwrap();
        assert!(result.matches.iter().any(|item| item.path == "target.txt"));
        assert!(result.scanned_files >= 121);
        let listed = list_root(root, String::new()).unwrap();
        assert!(listed.entries.len() <= MAX_VISITED_ENTRIES);
    }

    #[test]
    fn depth_and_entry_limits_are_truthful() {
        let root = root("limits");
        let mut nested = root.path.clone();
        for depth in 0..(MAX_DEPTH + 2) { nested.push(format!("d{depth}")); }
        fs::create_dir_all(&nested).unwrap();
        fs::write(nested.join("deep.txt"), b"needle").unwrap();
        let result = search_text_root(root, "needle".to_string()).unwrap();
        assert!(result.truncated || result.skipped > 0);
    }

    #[test]
    fn invalid_utf8_nul_and_permissions_are_failures() {
        let root = root("invalid");
        write(&root, "bad.txt", &[0xff]);
        write(&root, "nul.txt", b"a\0b");
        assert!(read_root(root.clone(), "bad.txt".to_string()).is_err());
        assert!(read_root(root.clone(), "nul.txt".to_string()).is_err());
        assert!(search_text_root(root, "x".to_string()).is_ok());
    }

    #[test]
    fn helper_keeps_utf8_boundaries() {
        let input = "é".repeat(20);
        let (output, truncated) = truncate_utf8(&input, 3);
        assert!(truncated);
        assert!(output.is_char_boundary(output.len()));
    }

    #[cfg(windows)]
    #[test]
    fn windows_names_and_ads_are_rejected() {
        for path in ["CON.txt", "folder/NUL", "file.txt:stream", "C:/outside", "\\\\server\\share"] {
            assert!(relative_path(path).is_err());
        }
    }
}
