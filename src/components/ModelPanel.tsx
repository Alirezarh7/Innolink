import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

interface OllamaModel {
  name: string;
  size: string;
}

export default function ModelPanel() {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [ollamaStatus, setOllamaStatus] = useState<"connected" | "disconnected">("disconnected");

  useEffect(() => {
    checkOllama();
  }, []);

  async function checkOllama() {
    try {
      const result = await invoke<string>("list_ollama_models");
      const parsed: OllamaModel[] = JSON.parse(result);
      setModels(parsed);
      setOllamaStatus("connected");
    } catch {
      setOllamaStatus("disconnected");
    }
  }

  return (
    <div className="model-panel">
      <h3>Models</h3>
      <div className={`status ${ollamaStatus}`}>
        Ollama: {ollamaStatus}
      </div>
      <ul>
        {models.map((m) => (
          <li key={m.name}>
            {m.name} <span className="size">({m.size})</span>
          </li>
        ))}
      </ul>
      <button onClick={checkOllama}>Refresh</button>
    </div>
  );
}
