use serde::{Deserialize, Serialize};

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

// ── Tauri Commands ──

/// Send a prompt to Ollama and get a response
#[tauri::command]
async fn chat_ollama(prompt: String, model: String) -> Result<String, String> {
    let client = reqwest::Client::new();

    let body = OllamaRequest {
        model,
        prompt,
        stream: false, // simple non-streaming for now
    };

    let response = client
        .post("http://localhost:11434/api/generate")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to connect to Ollama: {}. Is Ollama running?", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(format!("Ollama error ({}): {}", status, text));
    }

    let data: OllamaResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Ollama response: {}", e))?;

    Ok(data.response)
}

/// List all models available in Ollama
#[tauri::command]
async fn list_ollama_models() -> Result<String, String> {
    let client = reqwest::Client::new();

    let response = client
        .get("http://localhost:11434/api/tags")
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
        .invoke_handler(tauri::generate_handler![chat_ollama, list_ollama_models])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
