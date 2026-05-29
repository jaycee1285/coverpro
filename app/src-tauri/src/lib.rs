use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::Path;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;
#[cfg(target_os = "android")]
use tauri::Manager;
use tokio::process::Command;
use tokio::sync::Mutex;

mod theme;
mod typst_engine;

// Track running processes for cancellation
fn processes() -> &'static Mutex<HashMap<u32, u32>> {
    static PROCESSES: OnceLock<Mutex<HashMap<u32, u32>>> = OnceLock::new();
    PROCESSES.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Serialize, Deserialize, Clone, Copy, PartialEq)]
pub enum LlmBackend {
    Claude,
    Codex,
}

#[derive(Serialize, Deserialize)]
pub struct LlmResult {
    output: String,
    pid: u32,
    backend: String,
}

// Check if an error suggests we should try fallback (rate limit, unavailable, etc.)
fn should_fallback(error: &str) -> bool {
    let fallback_indicators = [
        "rate limit",
        "rate_limit",
        "quota exceeded",
        "too many requests",
        "429",
        "503",
        "service unavailable",
        "capacity",
        "overloaded",
        "credits",
        "afford",
    ];
    let lower = error.to_lowercase();
    fallback_indicators
        .iter()
        .any(|indicator| lower.contains(indicator))
}

// Try to extract a retry-after timestamp or duration from an error message
fn parse_rate_limit_info(error: &str) -> Option<String> {
    let lower = error.to_lowercase();
    // Look for "retry after <N>" or "try again in <N>" patterns
    for prefix in ["retry after ", "try again in ", "wait ", "reset at "] {
        if let Some(idx) = lower.find(prefix) {
            let rest = &error[idx + prefix.len()..];
            let snippet: String = rest.chars().take(30).collect();
            return Some(format!("Rate limited ({}{})", prefix, snippet.trim()));
        }
    }
    if should_fallback(error) {
        return Some("Rate limited".to_string());
    }
    None
}

const CODEX_CHEAP_MODEL: &str = "gpt-5.1-codex-mini";
const CODEX_DEFAULT_MODEL: &str = "gpt-5.2-codex";
const CODEX_STRONG_MODEL: &str = "gpt-5.3-codex";

#[derive(Clone, Copy)]
enum ModelTier {
    Cheap,
    Default,
    Strong,
}

fn infer_model_tier(backend: LlmBackend, model: &str) -> ModelTier {
    let lower = model.to_lowercase();
    match backend {
        LlmBackend::Claude => {
            if lower.contains("haiku") {
                ModelTier::Cheap
            } else if lower.contains("opus") {
                ModelTier::Strong
            } else {
                ModelTier::Default
            }
        }
        LlmBackend::Codex => {
            if lower.contains("mini") {
                ModelTier::Cheap
            } else if lower.contains("5.3") || lower.contains("max") {
                ModelTier::Strong
            } else {
                ModelTier::Default
            }
        }
    }
}

fn model_for_tier(backend: LlmBackend, tier: ModelTier) -> &'static str {
    match backend {
        LlmBackend::Claude => match tier {
            ModelTier::Cheap => "haiku",
            ModelTier::Default => "sonnet",
            ModelTier::Strong => "opus",
        },
        LlmBackend::Codex => match tier {
            ModelTier::Cheap => CODEX_CHEAP_MODEL,
            ModelTier::Default => CODEX_DEFAULT_MODEL,
            ModelTier::Strong => CODEX_STRONG_MODEL,
        },
    }
}

fn translate_model_for_backend(
    source: LlmBackend,
    target: LlmBackend,
    model: Option<&str>,
) -> Option<String> {
    match model {
        None => None,
        Some(m) if source == target => Some(m.to_string()),
        Some(m) => {
            let tier = infer_model_tier(source, m);
            Some(model_for_tier(target, tier).to_string())
        }
    }
}

async fn run_cli(
    backend: LlmBackend,
    prompt: &str,
    model: Option<&str>,
) -> Result<(String, u32), String> {
    // For codex, use -o <tempfile> to capture clean output separately from noisy stdout
    let codex_out_path = if backend == LlmBackend::Codex {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or_default();
        let path = format!("/tmp/coverpro-codex-{}-{}.txt", std::process::id(), nonce);
        Some(path)
    } else {
        None
    };

    let (cmd, mut args): (&str, Vec<String>) = match backend {
        LlmBackend::Claude => (
            "claude",
            vec!["--print".into(), "--dangerously-skip-permissions".into()],
        ),
        LlmBackend::Codex => (
            "codex",
            vec![
                "exec".into(),
                "--dangerously-bypass-approvals-and-sandbox".into(),
                "--color".into(),
                "never".into(),
            ],
        ),
    };

    // Add -o for codex to capture clean last-message output
    if let Some(ref path) = codex_out_path {
        args.push("-o".into());
        args.push(path.clone());
    }

    // Add model flag
    let effective_model: Option<String> = model.map(|s| s.to_string());
    if let Some(ref m) = effective_model {
        match backend {
            LlmBackend::Claude => {
                args.push("--model".into());
                args.push(m.clone());
            }
            LlmBackend::Codex => {
                args.push("-m".into());
                args.push(m.clone());
            }
        }
    }

    // Add the prompt as the final argument
    match backend {
        LlmBackend::Claude => {
            args.push("-p".into());
            args.push(prompt.to_string());
        }
        LlmBackend::Codex => {
            args.push(prompt.to_string());
        }
    };

    let child = Command::new(cmd)
        .args(&args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("PATH", std::env::var("PATH").unwrap_or_default())
        .spawn()
        .map_err(|e| {
            format!(
                "Failed to spawn {}: {} (is it installed and in PATH?)",
                cmd, e
            )
        })?;

    let pid = child.id().unwrap_or(0);

    // Track the process
    {
        let mut procs = processes().lock().await;
        procs.insert(pid, pid);
    }

    // Wait for completion asynchronously — does NOT block the thread
    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("Failed to wait for {}: {}", cmd, e))?;

    // Remove from tracking
    {
        let mut procs = processes().lock().await;
        procs.remove(&pid);
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        let exit_code = output
            .status
            .code()
            .map(|c| c.to_string())
            .unwrap_or("unknown".to_string());
        let error_detail = if !stderr.is_empty() {
            stderr
        } else if !stdout.is_empty() {
            format!("(stdout): {}", stdout)
        } else {
            format!("Process exited with code {}", exit_code)
        };
        return Err(error_detail);
    }

    // For codex, read clean output from -o file; for claude, use stdout directly
    let result = if let Some(ref path) = codex_out_path {
        let clean = tokio::fs::read_to_string(path).await.unwrap_or_default();
        let _ = tokio::fs::remove_file(path).await;
        if clean.is_empty() {
            // Fall back to stdout if -o file was empty
            stdout
        } else {
            clean
        }
    } else {
        stdout
    };

    if result.is_empty() {
        return Err("Command succeeded but returned empty output".to_string());
    }

    Ok((result, pid))
}

#[tauri::command]
async fn run_claude_code(prompt: String) -> Result<LlmResult, String> {
    // Try Claude first
    match run_cli(LlmBackend::Claude, &prompt, None).await {
        Ok((output, pid)) => {
            return Ok(LlmResult {
                output,
                pid,
                backend: "claude".to_string(),
            });
        }
        Err(claude_err) => {
            // Check if we should try Codex as fallback
            if should_fallback(&claude_err) {
                eprintln!("Claude rate limited, falling back to Codex...");
                match run_cli(LlmBackend::Codex, &prompt, None).await {
                    Ok((output, pid)) => {
                        return Ok(LlmResult {
                            output,
                            pid,
                            backend: "codex".to_string(),
                        });
                    }
                    Err(codex_err) => {
                        return Err(format!(
                            "Both backends failed. Claude: {}. Codex: {}",
                            claude_err, codex_err
                        ));
                    }
                }
            } else {
                return Err(format!("Claude Code failed: {}", claude_err));
            }
        }
    }
}

// Allow explicitly choosing a backend with optional model selection
#[tauri::command]
async fn run_with_backend(
    prompt: String,
    backend: String,
    model: Option<String>,
) -> Result<LlmResult, String> {
    let backend_enum = match backend.to_lowercase().as_str() {
        "codex" => LlmBackend::Codex,
        _ => LlmBackend::Claude,
    };

    match run_cli(backend_enum, &prompt, model.as_deref()).await {
        Ok((output, pid)) => Ok(LlmResult {
            output,
            pid,
            backend,
        }),
        Err(e) => {
            if should_fallback(&e) {
                let info = parse_rate_limit_info(&e).unwrap_or_default();
                match backend_enum {
                    // Claude: fall back to Codex
                    LlmBackend::Claude => {
                        eprintln!("Claude hit limit ({}), falling back to Codex", info);
                        let fallback_model = translate_model_for_backend(
                            LlmBackend::Claude,
                            LlmBackend::Codex,
                            model.as_deref(),
                        );
                        match run_cli(LlmBackend::Codex, &prompt, fallback_model.as_deref()).await {
                            Ok((output, pid)) => Ok(LlmResult {
                                output,
                                pid,
                                backend: format!("codex(fallback from claude: {})", info),
                            }),
                            Err(codex_err) => Err(format!(
                                "Claude failed ({}). Codex fallback also failed: {}",
                                info, codex_err
                            )),
                        }
                    }
                    // Codex: fall back to Claude
                    LlmBackend::Codex => {
                        eprintln!("Codex hit limit ({}), falling back to Claude", info);
                        let fallback_model = translate_model_for_backend(
                            LlmBackend::Codex,
                            LlmBackend::Claude,
                            model.as_deref(),
                        );
                        match run_cli(LlmBackend::Claude, &prompt, fallback_model.as_deref()).await
                        {
                            Ok((output, pid)) => Ok(LlmResult {
                                output,
                                pid,
                                backend: format!("claude(fallback from codex: {})", info),
                            }),
                            Err(claude_err) => Err(format!(
                                "Codex failed ({}). Claude fallback also failed: {}",
                                info, claude_err
                            )),
                        }
                    }
                }
            } else {
                Err(format!("{} failed: {}", backend, e))
            }
        }
    }
}

#[tauri::command]
async fn kill_process(pid: u32) -> Result<(), String> {
    // Send SIGTERM to the process
    #[cfg(unix)]
    {
        unsafe {
            libc::kill(pid as i32, libc::SIGTERM);
        }
    }

    #[cfg(windows)]
    {
        std::process::Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/F"])
            .output()
            .map_err(|e| format!("Failed to kill process: {}", e))?;
    }

    // Remove from tracking
    {
        let mut procs = processes().lock().await;
        procs.remove(&pid);
    }

    Ok(())
}

#[tauri::command]
async fn kill_all_processes() -> Result<u32, String> {
    let pids: Vec<u32> = {
        let procs = processes().lock().await;
        procs.keys().copied().collect()
    };

    for pid in &pids {
        #[cfg(unix)]
        unsafe {
            libc::kill(*pid as i32, libc::SIGTERM);
        }

        #[cfg(windows)]
        {
            std::process::Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/F"])
                .output()
                .map_err(|e| format!("Failed to kill process {}: {}", pid, e))?;
        }
    }

    {
        let mut procs = processes().lock().await;
        for pid in &pids {
            procs.remove(pid);
        }
    }

    Ok(pids.len() as u32)
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg(target_os = "android")]
fn coverpro_temp_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_cache_dir()
        .map(|path| path.join("coverpro"))
        .map_err(|e| format!("Failed to resolve Android app cache dir: {}", e))
}

fn remap_temp_path_for_android(_app: &AppHandle, path: &str) -> Result<PathBuf, String> {
    #[cfg(target_os = "android")]
    {
        if path == "/tmp/coverpro-debug.log" {
            return Ok(coverpro_temp_dir(_app)?.join("coverpro-debug.log"));
        }

        if let Some(rest) = path.strip_prefix("/tmp/coverpro/") {
            return Ok(coverpro_temp_dir(_app)?.join(rest));
        }

        Ok(PathBuf::from(path))
    }
    #[cfg(not(target_os = "android"))]
    {
        Ok(PathBuf::from(path))
    }
}

#[tauri::command]
async fn read_file(app: AppHandle, path: String) -> Result<String, String> {
    let actual_path = remap_temp_path_for_android(&app, &path)?;
    tokio::fs::read_to_string(&actual_path)
        .await
        .map_err(|e| format!("Failed to read file {}: {}", actual_path.display(), e))
}

#[tauri::command]
async fn write_file(app: AppHandle, path: String, contents: String) -> Result<(), String> {
    let actual_path = remap_temp_path_for_android(&app, &path)?;
    // Create parent directories if needed
    if let Some(parent) = actual_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
    }
    tokio::fs::write(&actual_path, &contents)
        .await
        .map_err(|e| format!("Failed to write file {}: {}", actual_path.display(), e))
}

#[tauri::command]
async fn append_to_file(app: AppHandle, path: String, content: String) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;

    let actual_path = remap_temp_path_for_android(&app, &path)?;
    // Create parent directories if needed
    if let Some(parent) = actual_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create directory {}: {}", parent.display(), e))?;
    }

    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&actual_path)
        .await
        .map_err(|e| format!("Failed to open file {}: {}", actual_path.display(), e))?;

    file.write_all(content.as_bytes())
        .await
        .map_err(|e| format!("Failed to append to file {}: {}", actual_path.display(), e))
}

/// Check if the app can write to external storage.
/// On Android, probes /storage/emulated/0/Download. On desktop, always true.
#[tauri::command]
async fn check_storage_permission() -> bool {
    #[cfg(target_os = "android")]
    {
        let test_path = "/storage/emulated/0/Download/.coverpro_permission_test";
        match tokio::fs::write(test_path, "test").await {
            Ok(_) => {
                let _ = tokio::fs::remove_file(test_path).await;
                true
            }
            Err(_) => false,
        }
    }
    #[cfg(not(target_os = "android"))]
    {
        true
    }
}

/// Return the default output directory for the current platform.
#[tauri::command]
fn get_default_output_dir() -> Result<String, String> {
    #[cfg(target_os = "android")]
    {
        Ok("/storage/emulated/0/Download".to_string())
    }
    #[cfg(not(target_os = "android"))]
    {
        let home = std::env::var("HOME").map_err(|_| "HOME not set".to_string())?;
        Ok(format!("{}/Downloads/resumescovers", home))
    }
}

// Embed templates at compile time so they work in release builds
const RESUME_TEMPLATE: &str = include_str!("../templates/resume.typ");
const COVER_LETTER_TEMPLATE: &str = include_str!("../templates/cover-letter.typ");
const BULLET_MEASURE_TEMPLATE: &str = r#"
#let data = sys.inputs.at("data")
#let content-width = 7.1in

#set page(
  paper: "us-letter",
  margin: (top: 0.5in, bottom: 0.5in, left: 0.7in, right: 0.7in),
)

#set text(
  font: ("Nacelle", "Mulish"),
  size: 10pt,
)

#set par(leading: 0.5em)

#let bullet-body(text) = [#h(10pt)•#h(5pt)#text \ ]

#context [
  #let single-line = measure(block(width: content-width)[#bullet-body("Probe width baseline.")])
  #metadata((
    contentWidth: content-width,
    singleLineHeight: single-line.height,
    bullets: data.bullets.map(item => {
      let natural = measure([#bullet-body(item.text)])
      let wrapped = measure(block(width: content-width)[#bullet-body(item.text)])
      (
        fieldKey: item.fieldKey,
        naturalWidth: natural.width,
        wrappedHeight: wrapped.height,
      )
    }),
  )) <coverpro-bullet-measurement>
]
"#;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    success: bool,
    resume_path: Option<String>,
    cover_letter_path: Option<String>,
    preflight: ResumePreflight,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct ResumePreflight {
    page_count: u32,
    target_page_count: u32,
    content_width_pt: Option<f64>,
    available_height_pt: Option<f64>,
    total_content_height_pt: Option<f64>,
    total_content_width_pt: Option<f64>,
    sections: Vec<PreflightSectionMetric>,
    failures: Vec<PreflightFailure>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PreflightSectionMetric {
    id: String,
    name: String,
    width_pt: Option<f64>,
    height_pt: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PreflightFailure {
    code: String,
    message: String,
    section_id: Option<String>,
    details: Option<Value>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BulletMeasureInput {
    field_key: String,
    text: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BulletMeasureResult {
    field_key: String,
    text: String,
    content_width_pt: Option<f64>,
    natural_width_pt: Option<f64>,
    wrapped_height_pt: Option<f64>,
    single_line_height_pt: Option<f64>,
    overflow_width_pt: Option<f64>,
    single_line: bool,
    estimated_trim_chars: Option<u32>,
    estimated_line_count: Option<u32>,
}

#[derive(Debug, Deserialize)]
struct TypstQueryItem {
    func: String,
    value: Option<Value>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TypstPreflightValue {
    page_count: Option<u32>,
    target_page_count: Option<u32>,
    content_width: Option<String>,
    available_height: Option<String>,
    total_size: Option<TypstMeasuredSize>,
    sections: Option<Vec<TypstSectionMetric>>,
}

#[derive(Debug, Deserialize)]
struct TypstMeasuredSize {
    width: String,
    height: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TypstBulletMeasureItem {
    field_key: String,
    natural_width: Option<String>,
    wrapped_height: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TypstBulletMeasureValue {
    content_width: Option<String>,
    single_line_height: Option<String>,
    bullets: Option<Vec<TypstBulletMeasureItem>>,
}

#[derive(Debug, Deserialize)]
struct TypstSectionMetric {
    id: String,
    name: String,
    width: Option<String>,
    height: Option<String>,
}

fn parse_typst_length_pt(raw: &str) -> Option<f64> {
    let trimmed = raw.trim();
    let units = [
        ("pt", 1.0),
        ("in", 72.0),
        ("cm", 72.0 / 2.54),
        ("mm", 72.0 / 25.4),
    ];

    for (suffix, factor) in units {
        if let Some(number) = trimmed.strip_suffix(suffix) {
            let value = number.trim().parse::<f64>().ok()?;
            return Some(value * factor);
        }
    }

    trimmed.parse::<f64>().ok()
}

fn preflight_failure(
    code: &str,
    message: String,
    section_id: Option<&str>,
    details: Option<Value>,
) -> PreflightFailure {
    PreflightFailure {
        code: code.to_string(),
        message,
        section_id: section_id.map(str::to_string),
        details,
    }
}

fn preflight_with_failure(code: &str, message: String, details: Option<Value>) -> ResumePreflight {
    let mut preflight = ResumePreflight {
        target_page_count: 1,
        ..ResumePreflight::default()
    };
    preflight
        .failures
        .push(preflight_failure(code, message, None, details));
    preflight
}

fn parse_preflight_query_output(stdout: &str) -> Result<ResumePreflight, String> {
    let items: Vec<TypstQueryItem> = serde_json::from_str(stdout)
        .map_err(|e| format!("Failed to parse Typst preflight JSON: {}", e))?;

    let value: TypstPreflightValue = items
        .into_iter()
        .find(|item| item.func == "metadata")
        .and_then(|item| item.value)
        .ok_or_else(|| "Typst preflight metadata was missing".to_string())
        .and_then(|value| {
            serde_json::from_value(value)
                .map_err(|e| format!("Failed to decode Typst preflight metadata: {}", e))
        })?;

    let sections = value
        .sections
        .unwrap_or_default()
        .into_iter()
        .map(|section| PreflightSectionMetric {
            id: section.id,
            name: section.name,
            width_pt: section.width.as_deref().and_then(parse_typst_length_pt),
            height_pt: section.height.as_deref().and_then(parse_typst_length_pt),
        })
        .collect::<Vec<_>>();

    Ok(ResumePreflight {
        page_count: value.page_count.unwrap_or(0),
        target_page_count: value.target_page_count.unwrap_or(1),
        content_width_pt: value
            .content_width
            .as_deref()
            .and_then(parse_typst_length_pt),
        available_height_pt: value
            .available_height
            .as_deref()
            .and_then(parse_typst_length_pt),
        total_content_height_pt: value
            .total_size
            .as_ref()
            .and_then(|size| parse_typst_length_pt(&size.height)),
        total_content_width_pt: value
            .total_size
            .as_ref()
            .and_then(|size| parse_typst_length_pt(&size.width)),
        sections,
        failures: Vec::new(),
    })
}

fn finalize_preflight(mut preflight: ResumePreflight) -> ResumePreflight {
    if preflight.page_count > preflight.target_page_count {
        preflight.failures.push(preflight_failure(
            "resume_exceeds_page_budget",
            format!(
                "Resume renders to {} pages; target is {}.",
                preflight.page_count, preflight.target_page_count
            ),
            None,
            Some(serde_json::json!({
                "pageCount": preflight.page_count,
                "targetPageCount": preflight.target_page_count,
            })),
        ));
    }

    if let (Some(total_height), Some(available_height)) = (
        preflight.total_content_height_pt,
        preflight.available_height_pt,
    ) {
        if total_height > available_height {
            preflight.failures.push(preflight_failure(
                "resume_content_exceeds_available_height",
                format!(
                    "Measured content height {:.2}pt exceeds available page height {:.2}pt.",
                    total_height, available_height
                ),
                None,
                Some(serde_json::json!({
                    "totalContentHeightPt": total_height,
                    "availableHeightPt": available_height,
                    "overflowPt": total_height - available_height,
                })),
            ));
        }
    }

    preflight
}

fn run_typst_query(
    template_source: &str,
    data_value: serde_json::Value,
) -> Result<ResumePreflight, String> {
    let world = typst_engine::TypstWorld::new(template_source.to_string(), data_value);
    let doc = typst_engine::compile_document(&world)?;
    let values = typst_engine::query_metadata_values(&doc, "coverpro-preflight")?;
    let wrapped = serde_json::Value::Array(
        values
            .into_iter()
            .map(|v| serde_json::json!({ "func": "metadata", "value": v }))
            .collect(),
    );
    let preflight = parse_preflight_query_output(&wrapped.to_string())?;
    Ok(finalize_preflight(preflight))
}

fn parse_bullet_measure_query_output(
    stdout: &str,
    inputs: &[BulletMeasureInput],
) -> Result<Vec<BulletMeasureResult>, String> {
    let items: Vec<TypstQueryItem> = serde_json::from_str(stdout)
        .map_err(|e| format!("Failed to parse Typst bullet measurement JSON: {}", e))?;

    let value: TypstBulletMeasureValue = items
        .into_iter()
        .find(|item| item.func == "metadata")
        .and_then(|item| item.value)
        .ok_or_else(|| "Typst bullet measurement metadata was missing".to_string())
        .and_then(|value| {
            serde_json::from_value(value)
                .map_err(|e| format!("Failed to decode bullet measurement metadata: {}", e))
        })?;

    let content_width_pt = value
        .content_width
        .as_deref()
        .and_then(parse_typst_length_pt);
    let single_line_height_pt = value
        .single_line_height
        .as_deref()
        .and_then(parse_typst_length_pt);
    let measured = value.bullets.unwrap_or_default();

    let mut measured_by_key: HashMap<String, TypstBulletMeasureItem> = HashMap::new();
    for item in measured {
        measured_by_key.insert(item.field_key.clone(), item);
    }

    let mut results = Vec::new();
    for input in inputs {
        let measured = measured_by_key.get(&input.field_key);
        let natural_width_pt = measured
            .and_then(|item| item.natural_width.as_deref())
            .and_then(parse_typst_length_pt);
        let wrapped_height_pt = measured
            .and_then(|item| item.wrapped_height.as_deref())
            .and_then(parse_typst_length_pt);
        let overflow_width_pt = match (natural_width_pt, content_width_pt) {
            (Some(natural_width), Some(content_width)) if natural_width > content_width => {
                Some(natural_width - content_width)
            }
            _ => Some(0.0),
        };
        let single_line = matches!((natural_width_pt, content_width_pt), (Some(natural_width), Some(content_width)) if natural_width <= content_width + 0.5);
        let estimated_trim_chars = match (natural_width_pt, content_width_pt) {
            (Some(natural_width), Some(content_width))
                if natural_width > content_width && !input.text.is_empty() =>
            {
                let overflow_ratio =
                    ((natural_width - content_width) / natural_width).clamp(0.0, 1.0);
                Some(
                    ((input.text.chars().count() as f64 * overflow_ratio)
                        .ceil()
                        .max(1.0)) as u32,
                )
            }
            _ => None,
        };
        let estimated_line_count = match (wrapped_height_pt, single_line_height_pt) {
            (Some(height), Some(single_line_height)) if single_line_height > 0.0 => {
                Some((height / single_line_height).round().max(1.0) as u32)
            }
            _ => None,
        };

        results.push(BulletMeasureResult {
            field_key: input.field_key.clone(),
            text: input.text.clone(),
            content_width_pt,
            natural_width_pt,
            wrapped_height_pt,
            single_line_height_pt,
            overflow_width_pt,
            single_line,
            estimated_trim_chars,
            estimated_line_count,
        });
    }

    Ok(results)
}

fn run_bullet_measure_query(
    template_source: &str,
    data_value: serde_json::Value,
    inputs: &[BulletMeasureInput],
) -> Result<Vec<BulletMeasureResult>, String> {
    let world = typst_engine::TypstWorld::new(template_source.to_string(), data_value);
    let doc = typst_engine::compile_document(&world)?;
    let values = typst_engine::query_metadata_values(&doc, "coverpro-bullet-measurement")?;
    let wrapped = serde_json::Value::Array(
        values
            .into_iter()
            .map(|v| serde_json::json!({ "func": "metadata", "value": v }))
            .collect(),
    );
    parse_bullet_measure_query_output(&wrapped.to_string(), inputs)
}

#[tauri::command]
async fn measure_typst_bullets(
    _app: AppHandle,
    bullets: Vec<BulletMeasureInput>,
) -> Result<Vec<BulletMeasureResult>, String> {
    let data_value = serde_json::json!({ "bullets": bullets });
    run_bullet_measure_query(BULLET_MEASURE_TEMPLATE, data_value, bullets.as_slice())
}

fn compile_typst(
    template_source: &str,
    output_path: &str,
    data_value: serde_json::Value,
) -> Result<(), String> {
    let world = typst_engine::TypstWorld::new(template_source.to_string(), data_value);
    let doc = typst_engine::compile_document(&world)?;
    let pdf_bytes = typst_engine::document_to_pdf(&doc)?;
    if let Some(parent) = Path::new(output_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create output dir {}: {}", parent.display(), e))?;
    }
    std::fs::write(output_path, pdf_bytes)
        .map_err(|e| format!("Failed to write PDF to {}: {}", output_path, e))
}

#[tauri::command]
async fn export_pdf(
    _app: AppHandle,
    json_data: String,
    resume_filename: String,
    cover_letter_filename: String,
    output_dir: Option<String>,
) -> Result<ExportResult, String> {
    let output_dir = match output_dir {
        Some(dir) if !dir.is_empty() => dir,
        _ => get_default_output_dir()?,
    };
    std::fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create output dir: {}", e))?;

    let data_value: serde_json::Value = serde_json::from_str(&json_data)
        .map_err(|e| format!("Failed to parse export JSON: {}", e))?;

    let resume_path = format!("{}/{}", output_dir, resume_filename);
    let cover_letter_path = format!("{}/{}", output_dir, cover_letter_filename);

    let mut preflight = match run_typst_query(RESUME_TEMPLATE, data_value.clone()) {
        Ok(preflight) => preflight,
        Err(stderr) => preflight_with_failure(
            "resume_preflight_failed",
            "Typst preflight failed before PDFs could be written.".to_string(),
            Some(serde_json::json!({ "stderr": stderr })),
        ),
    };

    if preflight.failures.is_empty() {
        if let Err(stderr) = compile_typst(RESUME_TEMPLATE, &resume_path, data_value.clone()) {
            preflight.failures.push(preflight_failure(
                "resume_compile_failed",
                "Typst failed while compiling the resume PDF.".to_string(),
                None,
                Some(serde_json::json!({ "stderr": stderr })),
            ));
        }
    }

    let mut cover_letter_exists = false;
    if preflight.failures.is_empty() {
        if let Err(stderr) =
            compile_typst(COVER_LETTER_TEMPLATE, &cover_letter_path, data_value)
        {
            preflight.failures.push(preflight_failure(
                "cover_letter_compile_failed",
                "Typst failed while compiling the cover letter PDF.".to_string(),
                None,
                Some(serde_json::json!({ "stderr": stderr })),
            ));
        } else {
            cover_letter_exists = true;
        }
    }

    let success = preflight.failures.is_empty();
    let resume_path = if success && Path::new(&resume_path).exists() {
        Some(resume_path)
    } else {
        None
    };
    let cover_letter_path =
        if success && cover_letter_exists && Path::new(&cover_letter_path).exists() {
            Some(cover_letter_path)
        } else {
            None
        };

    Ok(ExportResult {
        success,
        resume_path,
        cover_letter_path,
        preflight,
    })
}

#[tauri::command]
async fn preflight_pdf(_app: AppHandle, json_data: String) -> Result<ResumePreflight, String> {
    let data_value: serde_json::Value = serde_json::from_str(&json_data)
        .map_err(|e| format!("Failed to parse preflight JSON: {}", e))?;
    let preflight = match run_typst_query(RESUME_TEMPLATE, data_value) {
        Ok(preflight) => preflight,
        Err(stderr) => preflight_with_failure(
            "resume_preflight_failed",
            "Typst preflight failed before PDFs could be written.".to_string(),
            Some(serde_json::json!({ "stderr": stderr })),
        ),
    };
    Ok(preflight)
}

#[tauri::command]
fn get_gtk_colors() -> theme::GtkTheme {
    theme::parse_gtk_theme()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            run_claude_code,
            run_with_backend,
            kill_process,
            kill_all_processes,
            read_file,
            write_file,
            append_to_file,
            get_gtk_colors,
            export_pdf,
            preflight_pdf,
            measure_typst_bullets,
            check_storage_permission,
            get_default_output_dir
        ])
        .setup(|app| {
            theme::watch_gtk_theme(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{
        finalize_preflight, parse_preflight_query_output, parse_typst_length_pt,
        preflight_with_failure, run_bullet_measure_query, run_typst_query, BulletMeasureInput,
        PreflightSectionMetric, ResumePreflight, BULLET_MEASURE_TEMPLATE, RESUME_TEMPLATE,
    };

    fn make_bullets(items: &[(&str, &str)]) -> Vec<BulletMeasureInput> {
        items
            .iter()
            .map(|(key, text)| BulletMeasureInput {
                field_key: (*key).to_string(),
                text: (*text).to_string(),
            })
            .collect()
    }

    /// Build a resume data fixture. `project_bullets` and `job_bullets` are
    /// independent so tests can isolate which sections drive overflow.
    fn resume_fixture(
        job_bullets: usize,
        project_bullets: usize,
        bullet_text: &str,
    ) -> serde_json::Value {
        let jobs: Vec<&str> = std::iter::repeat(bullet_text).take(job_bullets).collect();
        let projects: Vec<&str> = std::iter::repeat(bullet_text)
            .take(project_bullets)
            .collect();
        serde_json::json!({
            "jobTitle": "Senior Content Strategist",
            "summary": "Twenty years across editorial systems, content strategy, and SEO architecture.",
            "experience": {
                "labDemand": jobs,
                "focusDigital": jobs,
                "firstPageSage": jobs,
                "learMarketing": jobs,
                "ebay": [],
                "gestallt": projects,
                "coverpro": projects,
                "traverse": [],
                "daylight": [],
                "openswarm": [],
                "earlierExperience": "Earlier roles include freelance writing and SEO consulting."
            }
        })
    }

    // ─── End-to-end engine tests using bundled fonts ───
    // These run the real typst engine in-process. They prove font bundling
    // works (no missing-glyph fallbacks), the data-as-input path is wired
    // correctly, and label-selector queries return the expected metadata.

    #[test]
    fn bullet_measure_short_text_fits_single_line() {
        let bullets = make_bullets(&[("short", "Built a thing in three weeks.")]);
        let data = serde_json::json!({ "bullets": bullets });
        let result = run_bullet_measure_query(BULLET_MEASURE_TEMPLATE, data, &bullets)
            .expect("bullet measurement succeeds");
        assert_eq!(result.len(), 1);
        let m = &result[0];
        assert!(m.single_line, "30-char bullet should fit on one line");
        assert_eq!(m.estimated_line_count, Some(1));
        assert_eq!(m.estimated_trim_chars, None);
    }

    #[test]
    fn bullet_measure_long_text_wraps() {
        // ~280 chars, well past the 7.1in content-width budget for Mulish 10pt.
        let long = "Led a cross-functional initiative spanning content operations, technical SEO, and editorial governance, partnering with engineering, product, and design teams to deliver measurable improvements in organic traffic, lead quality, and downstream pipeline conversion across enterprise verticals.";
        let bullets = make_bullets(&[("long", long)]);
        let data = serde_json::json!({ "bullets": bullets });
        let result = run_bullet_measure_query(BULLET_MEASURE_TEMPLATE, data, &bullets)
            .expect("bullet measurement succeeds");
        assert_eq!(result.len(), 1);
        let m = &result[0];
        assert!(!m.single_line, "long bullet must not be marked single_line");
        assert!(
            m.estimated_line_count.unwrap_or(0) >= 2,
            "expected ≥2 wrapped lines, got {:?}",
            m.estimated_line_count
        );
        assert!(
            m.overflow_width_pt.unwrap_or(0.0) > 0.0,
            "long bullet must report overflow width >0"
        );
        assert!(
            m.estimated_trim_chars.unwrap_or(0) > 0,
            "long bullet must suggest trimming chars"
        );
    }

    #[test]
    fn bullet_measure_borderline_bullet_reports_overflow() {
        // Just past the single-line budget — should overflow but only by a sliver.
        let borderline = "Owned the full editorial pipeline across web, email, and partner channels for a portfolio of fifteen B2B brands during fiscal year twenty twenty-four end.";
        let bullets = make_bullets(&[("borderline", borderline)]);
        let data = serde_json::json!({ "bullets": bullets });
        let result = run_bullet_measure_query(BULLET_MEASURE_TEMPLATE, data, &bullets)
            .expect("bullet measurement succeeds");
        let m = &result[0];
        assert!(
            !m.single_line,
            "borderline bullet length {} chars should overflow content-width",
            borderline.len()
        );
    }

    #[test]
    fn resume_preflight_minimal_fits_one_page() {
        // 1 short bullet per job, no project bullets — leanest realistic resume.
        let data = resume_fixture(1, 0, "Shipped a feature.");
        let preflight = run_typst_query(RESUME_TEMPLATE, data).expect("preflight runs");
        assert_eq!(
            preflight.page_count, 1,
            "minimal resume must render in 1 page (got {} pages)",
            preflight.page_count
        );
        assert!(
            preflight.failures.is_empty(),
            "minimal resume must have no preflight failures, got {:?}",
            preflight.failures.iter().map(|f| &f.code).collect::<Vec<_>>()
        );
        assert!(
            preflight.content_width_pt.unwrap_or(0.0) > 500.0,
            "content_width should be ~511pt (7.1in), got {:?}",
            preflight.content_width_pt
        );
    }

    #[test]
    fn bundled_fonts_cover_all_template_glyphs() {
        // Every codepoint used by the templates (or by symbol shorthands like
        // `sym.bullet` / `sym.bar.v`) must be present in at least one bundled
        // font, otherwise typst silently falls back to its embedded fallback
        // font and the rendered character looks visually off.
        use typst::text::Font;
        let mut all_chars = std::collections::HashSet::new();
        for raw in super::typst_engine::EMBEDDED_FONTS {
            let bytes = typst::foundations::Bytes::new(raw.to_vec());
            for font in Font::iter(bytes) {
                for c in font.ttf().tables().cmap.iter().flat_map(|c| c.subtables) {
                    subtable_codepoints(c, &mut all_chars);
                }
            }
        }
        // Codepoints referenced literally in templates/lib.rs:
        //   • U+2022 BULLET  (body bullet, sym.bullet)
        //   — U+2014 EM DASH (project section labels)
        //   | U+007C VERTICAL LINE (education separator)
        let required: &[(char, &str)] = &[
            ('\u{2022}', "BULLET"),
            ('\u{2014}', "EM DASH"),
            ('\u{007C}', "VERTICAL LINE"),
        ];
        for (c, name) in required {
            assert!(
                all_chars.contains(c),
                "no bundled font contains required glyph U+{:04X} {}",
                *c as u32,
                name
            );
        }
        // And explicitly assert the old buggy bullet (BLACK CIRCLE) is *not*
        // a required codepoint anymore — guards against regressions.
        let template_src = super::RESUME_TEMPLATE.to_string()
            + super::COVER_LETTER_TEMPLATE
            + super::BULLET_MEASURE_TEMPLATE;
        assert!(
            !template_src.contains('\u{25CF}'),
            "templates still reference U+25CF BLACK CIRCLE which no bundled font supports"
        );
    }

    fn subtable_codepoints(
        subtable: ttf_parser::cmap::Subtable,
        out: &mut std::collections::HashSet<char>,
    ) {
        subtable.codepoints(|cp| {
            if let Some(c) = char::from_u32(cp) {
                out.insert(c);
            }
        });
    }

    /// Build a fixture matching the per-section bullet distribution that one
    /// of the 8 resume modes actually exports to the PDF. Keys mirror the
    /// fields rendered by templates/resume.typ — OpenSwarm bullets, if any,
    /// are intentionally omitted because that section has no Typst block.
    struct ModeShape {
        name: &'static str,
        lab_demand: usize,
        focus_digital: usize,
        first_page_sage: usize,
        lear_marketing: usize,
        ebay: usize,
        gestallt: usize,
        coverpro: usize,
        traverse: usize,
        daylight: usize,
        openswarm: usize,
    }

    fn mode_fixture(shape: &ModeShape, bullet_text: &str) -> serde_json::Value {
        let fill = |n: usize| -> Vec<&str> { std::iter::repeat(bullet_text).take(n).collect() };
        serde_json::json!({
            "jobTitle": "Senior Content Strategist",
            "summary": "Twenty years across editorial systems, content strategy, and SEO architecture.",
            "experience": {
                "labDemand": fill(shape.lab_demand),
                "focusDigital": fill(shape.focus_digital),
                "firstPageSage": fill(shape.first_page_sage),
                "learMarketing": fill(shape.lear_marketing),
                "ebay": fill(shape.ebay),
                "gestallt": fill(shape.gestallt),
                "coverpro": fill(shape.coverpro),
                "traverse": fill(shape.traverse),
                "daylight": fill(shape.daylight),
                "openswarm": fill(shape.openswarm),
                "earlierExperience": "Earlier roles include freelance writing and SEO consulting."
            }
        })
    }

    #[test]
    fn resume_preflight_each_mode_fits_one_page() {
        // Distributions come straight from RESUME_MODE_DEFINITIONS in
        // app/src/lib/config/resume-modes.ts. devrel and fe now use the
        // openswarm field (newly added to resume.typ) for the OpenSwarm
        // bullets. Content mode is tested in both either/or branches.
        let shapes = [
            ModeShape { name: "pm",          lab_demand: 1, focus_digital: 2, first_page_sage: 0, lear_marketing: 1, ebay: 0, gestallt: 3, coverpro: 2, traverse: 0, daylight: 2, openswarm: 0 },
            ModeShape { name: "content-ebay", lab_demand: 1, focus_digital: 5, first_page_sage: 3, lear_marketing: 3, ebay: 3, gestallt: 0, coverpro: 0, traverse: 0, daylight: 0, openswarm: 0 },
            ModeShape { name: "content-gestallt", lab_demand: 1, focus_digital: 5, first_page_sage: 3, lear_marketing: 3, ebay: 0, gestallt: 2, coverpro: 0, traverse: 0, daylight: 0, openswarm: 0 },
            ModeShape { name: "fme",         lab_demand: 2, focus_digital: 3, first_page_sage: 0, lear_marketing: 1, ebay: 0, gestallt: 2, coverpro: 1, traverse: 0, daylight: 0, openswarm: 0 },
            ModeShape { name: "pmm",         lab_demand: 2, focus_digital: 3, first_page_sage: 0, lear_marketing: 1, ebay: 0, gestallt: 2, coverpro: 1, traverse: 1, daylight: 0, openswarm: 0 },
            ModeShape { name: "devrel",      lab_demand: 0, focus_digital: 1, first_page_sage: 0, lear_marketing: 1, ebay: 0, gestallt: 2, coverpro: 2, traverse: 1, daylight: 0, openswarm: 2 },
            ModeShape { name: "dxe",         lab_demand: 0, focus_digital: 1, first_page_sage: 0, lear_marketing: 1, ebay: 0, gestallt: 2, coverpro: 2, traverse: 2, daylight: 1, openswarm: 0 },
            ModeShape { name: "isd",         lab_demand: 0, focus_digital: 1, first_page_sage: 0, lear_marketing: 1, ebay: 0, gestallt: 2, coverpro: 2, traverse: 3, daylight: 1, openswarm: 0 },
            ModeShape { name: "fe",          lab_demand: 1, focus_digital: 0, first_page_sage: 0, lear_marketing: 0, ebay: 0, gestallt: 2, coverpro: 2, traverse: 0, daylight: 3, openswarm: 2 },
        ];
        let bullet = "Drove measurable lift in organic traffic by rebuilding the editorial taxonomy across nine brands.";
        assert!(
            (90..=110).contains(&bullet.len()),
            "fixture bullet length {} should sit inside the 90–110 char band",
            bullet.len()
        );

        for shape in &shapes {
            let data = mode_fixture(shape, bullet);
            let preflight = run_typst_query(RESUME_TEMPLATE, data)
                .unwrap_or_else(|e| panic!("[{}] preflight runs: {}", shape.name, e));
            assert_eq!(
                preflight.page_count, 1,
                "[{}] resume must render in 1 page (got {} pages, failures={:?})",
                shape.name,
                preflight.page_count,
                preflight.failures.iter().map(|f| &f.code).collect::<Vec<_>>()
            );
            assert!(
                preflight.failures.is_empty(),
                "[{}] resume must have no preflight failures, got {:?}",
                shape.name,
                preflight.failures.iter().map(|f| &f.code).collect::<Vec<_>>()
            );
            assert!(
                preflight.sections.iter().any(|s| s.id == "education"),
                "[{}] education section must appear in preflight metadata",
                shape.name
            );
        }
    }

    #[test]
    fn resume_preflight_overflow_emits_failure() {
        // 12 bullets per role across 5 roles plus 4 project sections is well
        // beyond what fits on one US Letter page at 10pt.
        let bullet = "Delivered measurable results across multiple cross-functional initiatives spanning quarters.";
        let data = resume_fixture(12, 4, bullet);
        let preflight = run_typst_query(RESUME_TEMPLATE, data).expect("preflight runs");
        let codes: Vec<&str> = preflight.failures.iter().map(|f| f.code.as_str()).collect();
        assert!(
            preflight.page_count > 1
                || codes.contains(&"resume_exceeds_page_budget")
                || codes.contains(&"resume_content_exceeds_available_height"),
            "overflowing resume must emit page/height failure or render >1 page; got page_count={} failures={:?}",
            preflight.page_count,
            codes
        );
    }

    #[test]
    fn parses_typst_lengths_into_points() {
        assert_eq!(parse_typst_length_pt("72pt"), Some(72.0));
        assert_eq!(parse_typst_length_pt("1in"), Some(72.0));
        assert_eq!(parse_typst_length_pt("25.4mm"), Some(72.0));
    }

    #[test]
    fn parses_typst_preflight_metadata() {
        let stdout = r#"[{
            "func": "metadata",
            "value": {
                "pageCount": 2,
                "targetPageCount": 1,
                "contentWidth": "511.2pt",
                "availableHeight": "720pt",
                "totalSize": { "width": "511.2pt", "height": "744pt" },
                "sections": [
                    { "id": "summary", "name": "Summary", "width": "511.2pt", "height": "80pt" }
                ]
            }
        }]"#;

        let preflight = parse_preflight_query_output(stdout).expect("preflight parsed");

        assert_eq!(preflight.page_count, 2);
        assert_eq!(preflight.target_page_count, 1);
        assert_eq!(preflight.available_height_pt, Some(720.0));
        assert_eq!(preflight.total_content_height_pt, Some(744.0));
        assert_eq!(preflight.sections.len(), 1);
        assert_eq!(preflight.sections[0].id, "summary");
        assert_eq!(preflight.sections[0].height_pt, Some(80.0));
    }

    #[test]
    fn emits_machine_readable_failures_for_page_budget_and_height() {
        let preflight = ResumePreflight {
            page_count: 2,
            target_page_count: 1,
            content_width_pt: Some(511.2),
            available_height_pt: Some(720.0),
            total_content_height_pt: Some(744.0),
            total_content_width_pt: Some(511.2),
            sections: vec![PreflightSectionMetric {
                id: "professional-experience".to_string(),
                name: "Professional Experience".to_string(),
                width_pt: Some(511.2),
                height_pt: Some(260.0),
            }],
            failures: Vec::new(),
        };

        let finalized = finalize_preflight(preflight);

        assert_eq!(finalized.failures.len(), 2);
        assert_eq!(finalized.failures[0].code, "resume_exceeds_page_budget");
        assert_eq!(
            finalized.failures[1].code,
            "resume_content_exceeds_available_height"
        );
    }

    #[test]
    fn keeps_query_failures_in_structured_preflight_payload() {
        let preflight = preflight_with_failure(
            "resume_preflight_failed",
            "Typst preflight failed before PDFs could be written.".to_string(),
            Some(serde_json::json!({ "stderr": "query stderr" })),
        );

        assert_eq!(preflight.target_page_count, 1);
        assert_eq!(preflight.failures.len(), 1);
        assert_eq!(preflight.failures[0].code, "resume_preflight_failed");
        assert_eq!(
            preflight.failures[0]
                .details
                .as_ref()
                .and_then(|details| details.get("stderr"))
                .and_then(|value| value.as_str()),
            Some("query stderr")
        );
    }
}
