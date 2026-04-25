use serde::{Deserialize, Serialize};
use std::env;
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

/// Start ollama serve as a background process
#[tauri::command]
async fn start_ollama() -> Result<String, String> {
    std::process::Command::new("ollama")
        .arg("serve")
        .spawn()
        .map_err(|e| format!("Failed to start Ollama: {}", e))?;
    Ok("started".to_string())
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
        .invoke_handler(tauri::generate_handler![chat_ollama, list_ollama_models, discover_providers, list_installed_models, start_ollama])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
