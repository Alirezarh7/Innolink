use serde::{Deserialize, Serialize};
use std::env;
use std::io::{BufRead, BufReader};
use std::os::windows::process::CommandExt;
use std::process::{Command, Stdio};
use tauri::Emitter;
use futures_util::StreamExt;

fn ollama_base_url() -> String {
    env::var("OLLAMA_HOST").unwrap_or_else(|_| "http://127.0.0.1:11434".to_string())
}

// ── Ollama API types ──

#[derive(Serialize)]
struct OllamaRequest {
    model: String,
    prompt: String,
    stream: bool,
}

#[derive(Deserialize)]
struct OllamaResponse {
    response: String,
}

#[derive(Serialize)]
struct OllamaModelInfo {
    name: String,
    size: String,
}

#[derive(Deserialize)]
struct OllamaListResponse {
    models: Vec<OllamaModelEntry>,
}

#[derive(Deserialize)]
struct OllamaModelEntry {
    name: String,
    size: u64,
}

#[derive(Serialize)]
struct ProviderStatus {
    name: String,
    url: String,
    status: String,
    models: Vec<String>,
}

#[derive(Deserialize)]
struct OpenAIModelList {
    data: Vec<OpenAIModelEntry>,
}

#[derive(Deserialize)]
struct OpenAIModelEntry {
    id: String,
}

#[derive(Clone, Serialize)]
struct PullProgress {
    model: String,
    status: String,
    percent: f64,
}

#[derive(Serialize)]
struct SystemInfo {
    cpu_name: String,
    cpu_cores: String,
    ram_total: String,
    ram_free: String,
    gpu_name: String,
    gpu_vram: String,
    disks: Vec<DiskInfo>,
}

#[derive(Serialize)]
struct DiskInfo {
    name: String,
    total: String,
    free: String,
    used_percent: f64,
}

// ── Tauri Commands ──

/// Send a prompt to Ollama with streaming — emits tokens in real-time
#[tauri::command]
async fn chat_ollama(app: tauri::AppHandle, prompt: String, model: String) -> Result<String, String> {
    let client = reqwest::Client::new();

    let body = OllamaRequest {
        model,
        prompt,
        stream: true,
    };

    let response = client
        .post(format!("{}/api/generate", ollama_base_url()))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}. Is Ollama running?", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Ollama error ({}): {}", status, text));
    }

    let mut full_response = String::new();
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Stream error: {}", e))?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.lines() {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(data) = serde_json::from_str::<OllamaResponse>(line) {
                full_response.push_str(&data.response);
                let _ = app.emit("ollama-token", &data.response);
            }
        }
    }

    let _ = app.emit("ollama-done", &full_response);
    Ok(full_response)
}

/// List all models available in Ollama
#[tauri::command]
async fn list_ollama_models() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let response = client
        .get(format!("{}/api/tags", ollama_base_url()))
        .send()
        .await
        .map_err(|e| format!("Cannot reach Ollama: {}", e))?;

    let data: OllamaListResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse model list: {}", e))?;

    let models: Vec<OllamaModelInfo> = data
        .models
        .into_iter()
        .map(|m| OllamaModelInfo {
            name: m.name,
            size: format_size(m.size),
        })
        .collect();

    serde_json::to_string(&models).map_err(|e| format!("JSON error: {}", e))
}

/// Discover all local AI providers running on the system
#[tauri::command]
async fn discover_providers() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let mut providers: Vec<ProviderStatus> = Vec::new();

    // Check Ollama (default: 127.0.0.1:11434)
    let ollama_url = ollama_base_url();
    match client.get(format!("{}/api/tags", &ollama_url)).send().await {
        Ok(resp) if resp.status().is_success() => {
            if let Ok(data) = resp.json::<OllamaListResponse>().await {
                let models: Vec<String> = data.models.into_iter().map(|m| m.name).collect();
                providers.push(ProviderStatus {
                    name: "Ollama".to_string(),
                    url: ollama_url,
                    status: "connected".to_string(),
                    models,
                });
            }
        }
        _ => {
            providers.push(ProviderStatus {
                name: "Ollama".to_string(),
                url: ollama_url,
                status: "disconnected".to_string(),
                models: vec![],
            });
        }
    }

    // Check LM Studio (default: 127.0.0.1:1234)
    let lmstudio_url = env::var("LMSTUDIO_HOST")
        .unwrap_or_else(|_| "http://127.0.0.1:1234".to_string());
    match client.get(format!("{}/v1/models", &lmstudio_url)).send().await {
        Ok(resp) if resp.status().is_success() => {
            if let Ok(data) = resp.json::<OpenAIModelList>().await {
                let models: Vec<String> = data.data.into_iter().map(|m| m.id).collect();
                providers.push(ProviderStatus {
                    name: "LM Studio".to_string(),
                    url: lmstudio_url,
                    status: "connected".to_string(),
                    models,
                });
            }
        }
        _ => {}
    }

    // Check LocalAI (default: 127.0.0.1:8080)
    let localai_url = env::var("LOCALAI_HOST")
        .unwrap_or_else(|_| "http://127.0.0.1:8080".to_string());
    match client.get(format!("{}/v1/models", &localai_url)).send().await {
        Ok(resp) if resp.status().is_success() => {
            if let Ok(data) = resp.json::<OpenAIModelList>().await {
                let models: Vec<String> = data.data.into_iter().map(|m| m.id).collect();
                providers.push(ProviderStatus {
                    name: "LocalAI".to_string(),
                    url: localai_url,
                    status: "connected".to_string(),
                    models,
                });
            }
        }
        _ => {}
    }

    serde_json::to_string(&providers).map_err(|e| format!("JSON error: {}", e))
}

/// List models installed on system via `ollama list` (works even when ollama serve is not running)
#[tauri::command]
async fn list_installed_models() -> Result<String, String> {
    let output = std::process::Command::new("ollama")
        .arg("list")
        .output()
        .map_err(|e| format!("Cannot run ollama: {}", e))?;
    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Start ollama serve as a background process with multi-model support.
/// Kills any existing ollama serve process first to ensure OLLAMA_MAX_LOADED_MODELS is applied.
#[tauri::command]
async fn start_ollama() -> Result<String, String> {
    // Kill any existing ollama serve so we can restart with the right env
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", "ollama_llama_server.exe"])
        .creation_flags(0x08000000)
        .output();
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", "ollama.exe"])
        .creation_flags(0x08000000)
        .output();

    // Small delay to let the process fully exit
    std::thread::sleep(std::time::Duration::from_millis(500));

    std::process::Command::new("ollama")
        .arg("serve")
        .env("OLLAMA_MAX_LOADED_MODELS", "4")
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| format!("Failed to start Ollama: {}", e))?;
    Ok("started".to_string())
}

/// Restart ollama with multi-model support enabled
#[tauri::command]
async fn restart_ollama() -> Result<String, String> {
    // Kill existing
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", "ollama_llama_server.exe"])
        .creation_flags(0x08000000)
        .output();
    let _ = Command::new("taskkill")
        .args(["/F", "/IM", "ollama.exe"])
        .creation_flags(0x08000000)
        .output();

    std::thread::sleep(std::time::Duration::from_millis(1000));

    std::process::Command::new("ollama")
        .arg("serve")
        .env("OLLAMA_MAX_LOADED_MODELS", "4")
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| format!("Failed to restart Ollama: {}", e))?;
    Ok("restarted".to_string())
}

/// Get system hardware info via PowerShell (Windows 11 compatible)
#[tauri::command]
async fn get_system_info() -> Result<String, String> {
    fn run_ps(script: &str) -> String {
        Command::new("powershell.exe")
            .args(["-NoProfile", "-Command", script])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
            .unwrap_or_default()
    }

    fn bytes_to_gb(val: f64) -> String {
        format!("{:.0} GB", val / 1_073_741_824.0)
    }

    fn kb_to_gb(val: f64) -> String {
        format!("{:.1} GB", val / 1_048_576.0)
    }

    // CPU
    let cpu_json = run_ps("Get-CimInstance Win32_Processor | Select-Object Name,NumberOfCores | ConvertTo-Json");
    let cpu_name;
    let cpu_cores;
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&cpu_json) {
        cpu_name = v["Name"].as_str().unwrap_or("Unknown").trim().to_string();
        cpu_cores = v["NumberOfCores"].as_u64().map(|n| n.to_string()).unwrap_or_else(|| "Unknown".to_string());
    } else {
        cpu_name = "Unknown".to_string();
        cpu_cores = "Unknown".to_string();
    }

    // RAM total
    let ram_total_json = run_ps("Get-CimInstance Win32_ComputerSystem | Select-Object TotalPhysicalMemory | ConvertTo-Json");
    let ram_total = serde_json::from_str::<serde_json::Value>(&ram_total_json)
        .ok()
        .and_then(|v| v["TotalPhysicalMemory"].as_f64())
        .map(bytes_to_gb)
        .unwrap_or_else(|| "Unknown".to_string());

    // RAM free
    let ram_free_json = run_ps("Get-CimInstance Win32_OperatingSystem | Select-Object FreePhysicalMemory | ConvertTo-Json");
    let ram_free = serde_json::from_str::<serde_json::Value>(&ram_free_json)
        .ok()
        .and_then(|v| v["FreePhysicalMemory"].as_f64())
        .map(kb_to_gb)
        .unwrap_or_else(|| "Unknown".to_string());

    // GPU — try nvidia-smi first for accurate VRAM (AdapterRAM is 32-bit, caps at 4GB)
    let nvidia_smi_out = run_ps("nvidia-smi --query-gpu=name,memory.total --format=csv,noheader 2>$null");
    let (gpu_name, gpu_vram);
    if !nvidia_smi_out.is_empty() && !nvidia_smi_out.contains("not recognized") {
        // nvidia-smi returns e.g. "NVIDIA GeForce RTX 5070 Ti Laptop GPU, 12227 MiB"
        let parts: Vec<&str> = nvidia_smi_out.splitn(2, ", ").collect();
        gpu_name = parts.first().unwrap_or(&"Unknown").trim().to_string();
        let vram_str = parts.get(1).unwrap_or(&"Unknown").trim().to_string();
        // Convert "12227 MiB" to "12 GB"
        gpu_vram = vram_str
            .split_whitespace()
            .next()
            .and_then(|n| n.parse::<f64>().ok())
            .map(|mib| format!("{:.0} GB", mib / 1024.0))
            .unwrap_or(vram_str);
    } else {
        // Fallback to WMI (AdapterRAM may overflow for >4GB GPUs)
        let gpu_json = run_ps("Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json");
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&gpu_json) {
            let entries: Vec<&serde_json::Value> = if v.is_array() {
                v.as_array().unwrap().iter().collect()
            } else {
                vec![&v]
            };
            let best = entries.iter()
                .max_by_key(|e| e["AdapterRAM"].as_u64().unwrap_or(0))
                .copied();
            gpu_name = best
                .and_then(|e| e["Name"].as_str())
                .unwrap_or("Unknown").trim().to_string();
            gpu_vram = best
                .and_then(|e| e["AdapterRAM"].as_f64())
                .map(bytes_to_gb)
                .unwrap_or_else(|| "Unknown".to_string());
        } else {
            gpu_name = "Unknown".to_string();
            gpu_vram = "Unknown".to_string();
        }
    }

    // Disks
    let disk_json = run_ps("Get-CimInstance Win32_LogicalDisk | Select-Object Name,Size,FreeSpace | ConvertTo-Json");
    let mut disks: Vec<DiskInfo> = Vec::new();
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&disk_json) {
        let entries: Vec<&serde_json::Value> = if v.is_array() {
            v.as_array().unwrap().iter().collect()
        } else {
            vec![&v]
        };
        for entry in entries {
            let name = entry["Name"].as_str().unwrap_or("").to_string();
            let total_b = entry["Size"].as_f64().unwrap_or(0.0);
            let free_b = entry["FreeSpace"].as_f64().unwrap_or(0.0);
            if total_b <= 0.0 || name.is_empty() {
                continue;
            }
            let used_percent = ((total_b - free_b) / total_b * 100.0).round();
            disks.push(DiskInfo {
                name: format!("{}\\", name),
                total: bytes_to_gb(total_b),
                free: bytes_to_gb(free_b),
                used_percent,
            });
        }
    }

    let info = SystemInfo {
        cpu_name,
        cpu_cores,
        ram_total,
        ram_free,
        gpu_name,
        gpu_vram,
        disks,
    };

    serde_json::to_string(&info).map_err(|e| format!("JSON error: {}", e))
}

/// Pull a model from Ollama with progress events
#[tauri::command]
async fn pull_model(app: tauri::AppHandle, model: String) -> Result<String, String> {
    let mut child = Command::new("ollama")
        .arg("pull")
        .arg(&model)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .creation_flags(0x08000000)
        .spawn()
        .map_err(|e| format!("Failed to start ollama pull: {}", e))?;

    let stderr = child.stderr.take().ok_or("No stderr")?;
    let reader = BufReader::new(stderr);

    for line in reader.lines() {
        if let Ok(line) = line {
            let trimmed = line.trim().to_string();
            if trimmed.is_empty() {
                continue;
            }
            // Try to parse percent from lines like "pulling abc123...  45%"
            let percent = trimmed
                .split_whitespace()
                .filter_map(|w| w.trim_end_matches('%').parse::<f64>().ok())
                .last()
                .unwrap_or(0.0);

            let _ = app.emit("pull-progress", PullProgress {
                model: model.clone(),
                status: trimmed,
                percent,
            });
        }
    }

    let status = child.wait().map_err(|e| format!("Wait error: {}", e))?;
    if status.success() {
        let _ = app.emit("pull-progress", PullProgress {
            model: model.clone(),
            status: "complete".to_string(),
            percent: 100.0,
        });
        Ok("done".to_string())
    } else {
        Err(format!("ollama pull failed with exit code: {:?}", status.code()))
    }
}

/// Delete a model from Ollama
#[tauri::command]
async fn delete_model(model: String) -> Result<String, String> {
    let output = Command::new("ollama")
        .args(["rm", &model])
        .creation_flags(0x08000000)
        .output()
        .map_err(|e| format!("Failed to delete model: {}", e))?;

    if output.status.success() {
        Ok("deleted".to_string())
    } else {
        let err = String::from_utf8_lossy(&output.stderr);
        Err(format!("Delete failed: {}", err))
    }
}

/// Stop a running model in Ollama by setting keep_alive to 0
#[tauri::command]
async fn stop_model(model: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let body = serde_json::json!({
        "model": model,
        "prompt": "",
        "keep_alive": 0
    });

    let response = client
        .post(format!("{}/api/generate", ollama_base_url()))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to stop model: {}", e))?;

    if response.status().is_success() {
        Ok("stopped".to_string())
    } else {
        let text = response.text().await.unwrap_or_default();
        Err(format!("Stop failed: {}", text))
    }
}

/// Run (load) a model in Ollama so it's ready for inference.
/// Uses keep_alive=-1 so the model stays loaded until explicitly stopped.
/// This allows multiple models to be loaded simultaneously.
#[tauri::command]
async fn run_model(model: String) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let body = serde_json::json!({
        "model": model,
        "prompt": "",
        "keep_alive": -1
    });

    let response = client
        .post(format!("{}/api/generate", ollama_base_url()))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to start model: {}", e))?;

    if response.status().is_success() {
        Ok("running".to_string())
    } else {
        let text = response.text().await.unwrap_or_default();
        Err(format!("Failed to start model: {}", text))
    }
}

/// List currently running/loaded models in Ollama
#[tauri::command]
async fn list_running_models() -> Result<String, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("HTTP client error: {}", e))?;

    let response = client
        .get(format!("{}/api/ps", ollama_base_url()))
        .send()
        .await
        .map_err(|e| format!("Cannot reach Ollama: {}", e))?;

    let text = response.text().await.unwrap_or_else(|_| "{}".to_string());
    Ok(text)
}

/// Format bytes into human-readable size
fn format_size(bytes: u64) -> String {
    let gb = bytes as f64 / 1_073_741_824.0;
    if gb >= 1.0 {
        format!("{:.1} GB", gb)
    } else {
        let mb = bytes as f64 / 1_048_576.0;
        format!("{:.0} MB", mb)
    }
}

// ── App Entry ──

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![chat_ollama, list_ollama_models, discover_providers, list_installed_models, start_ollama, restart_ollama, get_system_info, pull_model, delete_model, stop_model, run_model, list_running_models])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
