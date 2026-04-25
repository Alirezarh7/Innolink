import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface InstalledModel {
  name: string;
  size: string;
  modified: string;
}

interface ProviderStatus {
  name: string;
  url: string;
  status: string;
  models: string[];
}

function parseOllamaList(output: string): InstalledModel[] {
  const lines = output.trim().split("\n");
  if (lines.length <= 1) return [];
  return lines.slice(1).map((line) => {
    const parts = line.split(/\s{2,}/);
    return {
      name: (parts[0] || "").trim(),
      size: (parts[2] || "").trim(),
      modified: (parts[3] || "").trim(),
    };
  }).filter((m) => m.name.length > 0);
}

export default function ModelPanel({ onAddModel }: { onAddModel?: () => void }) {
  const [models, setModels] = useState<InstalledModel[]>([]);
  const [runningModels, setRunningModels] = useState<string[]>([]);
  const [ollamaRunning, setOllamaRunning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    setLoading(true);
    // Get installed models (works even when ollama serve is stopped)
    try {
      const output = await invoke<string>("list_installed_models");
      const parsed = parseOllamaList(output);
      setModels(parsed);
    } catch {
      setModels([]);
    }

    // Check if ollama serve is running by trying discover_providers
    try {
      const result = await invoke<string>("discover_providers");
      const providers: ProviderStatus[] = JSON.parse(result);
      const ollama = providers.find((p) => p.name === "Ollama");
      if (ollama && ollama.status === "connected") {
        setOllamaRunning(true);
        setRunningModels(ollama.models);
      } else {
        setOllamaRunning(false);
        setRunningModels([]);
      }
    } catch {
      setOllamaRunning(false);
      setRunningModels([]);
    }
    setLoading(false);
  }

  async function handleStartOllama() {
    setStarting(true);
    try {
      await invoke<string>("start_ollama");
      // Wait for ollama to start
      await new Promise((r) => setTimeout(r, 3000));
      await refresh();
    } catch (err) {
      console.error("Failed to start Ollama:", err);
    } finally {
      setStarting(false);
    }
  }

  function isModelRunning(name: string): boolean {
    return runningModels.some((r) => r === name || r.startsWith(name.split(":")[0]));
  }

  return (
    <div className="model-panel">
      <h3>Models</h3>

      {loading ? (
        <div className="status">Scanning models...</div>
      ) : models.length === 0 ? (
        <div className="status" style={{ color: "#888" }}>
          No models installed.
        </div>
      ) : (
        <>
          <div className="status" style={{ color: ollamaRunning ? "#4caf50" : "#ff9800" }}>
            Ollama: {ollamaRunning ? "Running" : "Stopped"}
            {!ollamaRunning && (
              <button
                onClick={handleStartOllama}
                disabled={starting}
                style={{ marginLeft: "8px", fontSize: "0.7rem", padding: "2px 8px" }}
              >
                {starting ? "Starting..." : "Start"}
              </button>
            )}
          </div>
          <ul>
            {models.map((m) => {
              const running = ollamaRunning && isModelRunning(m.name);
              return (
                <li key={m.name} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: running ? "#4caf50" : "#666",
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ flex: 1 }}>{m.name}</span>
                  <span className="size">({m.size})</span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {onAddModel && (
        <button onClick={onAddModel} style={{ marginTop: "4px" }}>
          + Add Model
        </button>
      )}
    </div>
  );
}
