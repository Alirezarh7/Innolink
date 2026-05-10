import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import "./AddModelPage.css";

interface SystemInfo {
  cpu_name: string;
  cpu_cores: string;
  ram_total: string;
  ram_free: string;
  gpu_name: string;
  gpu_vram: string;
  disks: DiskInfo[];
}

interface DiskInfo {
  name: string;
  total: string;
  free: string;
  used_percent: number;
}

interface SavedAPI {
  provider: string;
  apiKey: string;
  baseUrl: string;
}

interface InstalledModel {
  name: string;
  size: string;
}

interface PullProgress {
  model: string;
  status: string;
  percent: number;
}

const AVAILABLE_MODELS = [
  { name: "phi4", maker: "Microsoft", size: "9.1GB", desc: "Great for reasoning", color: "#00a4ef", initials: "MS" },
  { name: "qwen2.5-coder:7b", maker: "Alibaba", size: "4.7GB", desc: "Best for coding", color: "#ff6a00", initials: "QW" },
  { name: "llama3.1:8b", maker: "Meta", size: "4.7GB", desc: "Balanced, general use", color: "#0668E1", initials: "LL" },
  { name: "mistral:7b", maker: "Mistral", size: "4.1GB", desc: "Fast and efficient", color: "#f54e42", initials: "MI" },
  { name: "deepseek-r1:8b", maker: "DeepSeek", size: "4.9GB", desc: "Strong reasoning", color: "#4a6cf7", initials: "DS" },
  { name: "gemma3:4b", maker: "Google", size: "3.3GB", desc: "Lightweight, fast", color: "#34a853", initials: "GE" },
];

const PROVIDER_URLS: Record<string, string> = {
  Claude: "https://api.anthropic.com",
  OpenAI: "https://api.openai.com",
};

function parseOllamaList(output: string): InstalledModel[] {
  const lines = output.trim().split("\n");
  if (lines.length <= 1) return [];
  return lines.slice(1).map((line) => {
    const parts = line.split(/\s{2,}/);
    return { name: (parts[0] || "").trim(), size: (parts[2] || "").trim() };
  }).filter((m) => m.name.length > 0);
}

export default function AddModelPage({ onBack }: { onBack: () => void }) {
  // ── System Info ──
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null);
  const [sysLoading, setSysLoading] = useState(true);

  // ── Paid API ──
  const [provider, setProvider] = useState<string>("Claude");
  const [apiKey, setApiKey] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [savedAPIs, setSavedAPIs] = useState<SavedAPI[]>([]);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  // ── Local Models ──
  const [installed, setInstalled] = useState<InstalledModel[]>([]);
  const [installedLoading, setInstalledLoading] = useState(true);
  const [pulling, setPulling] = useState<Record<string, PullProgress>>({});
  const [deleting, setDeleting] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadSystemInfo();
    loadInstalledModels();
    loadSavedAPIs();

    const unlisten = listen<PullProgress>("pull-progress", (event) => {
      const p = event.payload;
      if (p.status === "complete") {
        setPulling((prev) => {
          const next = { ...prev };
          delete next[p.model];
          return next;
        });
        loadInstalledModels();
      } else {
        setPulling((prev) => ({ ...prev, [p.model]: p }));
      }
    });

    return () => { unlisten.then((fn) => fn()); };
  }, []);

  async function loadSystemInfo() {
    setSysLoading(true);
    try {
      const result = await invoke<string>("get_system_info");
      setSysInfo(JSON.parse(result));
    } catch (err) {
      console.error("System info error:", err);
    }
    setSysLoading(false);
  }

  async function loadInstalledModels() {
    setInstalledLoading(true);
    try {
      const output = await invoke<string>("list_installed_models");
      setInstalled(parseOllamaList(output));
    } catch {
      setInstalled([]);
    }
    setInstalledLoading(false);
  }

  function loadSavedAPIs() {
    try {
      const raw = localStorage.getItem("innolink-apis");
      if (raw) setSavedAPIs(JSON.parse(raw));
    } catch { /* empty */ }
  }

  function saveAPI() {
    if (!apiKey.trim()) return;
    const baseUrl = provider === "Custom" ? customUrl : PROVIDER_URLS[provider] || "";
    const entry: SavedAPI = { provider, apiKey: apiKey.trim(), baseUrl };
    const updated = [...savedAPIs.filter((a) => a.provider !== provider), entry];
    setSavedAPIs(updated);
    localStorage.setItem("innolink-apis", JSON.stringify(updated));
    setApiKey("");
    setCustomUrl("");
  }

  function removeAPI(providerName: string) {
    const updated = savedAPIs.filter((a) => a.provider !== providerName);
    setSavedAPIs(updated);
    localStorage.setItem("innolink-apis", JSON.stringify(updated));
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      const baseUrl = provider === "Custom" ? customUrl : PROVIDER_URLS[provider] || "";
      let url = "";
      const headers: Record<string, string> = {};

      if (provider === "OpenAI") {
        url = `${baseUrl}/v1/models`;
        headers["Authorization"] = `Bearer ${apiKey}`;
      } else if (provider === "Claude") {
        url = `${baseUrl}/v1/models`;
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
      } else {
        url = `${baseUrl}/v1/models`;
        headers["Authorization"] = `Bearer ${apiKey}`;
      }

      const resp = await fetch(url, { headers });
      if (resp.ok) {
        setTestResult("Connected successfully!");
      } else {
        setTestResult(`Error: ${resp.status} ${resp.statusText}`);
      }
    } catch (err) {
      setTestResult(`Connection failed: ${err}`);
    }
    setTesting(false);
  }

  async function handleInstall(modelName: string) {
    setPulling((prev) => ({
      ...prev,
      [modelName]: { model: modelName, status: "Starting...", percent: 0 },
    }));
    try {
      await invoke("pull_model", { model: modelName });
    } catch (err) {
      console.error("Pull failed:", err);
      setPulling((prev) => {
        const next = { ...prev };
        delete next[modelName];
        return next;
      });
    }
  }

  async function handleDelete(modelName: string) {
    setDeleting((prev) => ({ ...prev, [modelName]: true }));
    try {
      await invoke("delete_model", { model: modelName });
      await loadInstalledModels();
    } catch (err) {
      console.error("Delete failed:", err);
    }
    setDeleting((prev) => ({ ...prev, [modelName]: false }));
  }

  async function handleStop(modelName: string) {
    try {
      await invoke("stop_model", { model: modelName });
    } catch (err) {
      console.error("Stop failed:", err);
    }
  }

  function isInstalled(name: string): boolean {
    return installed.some((m) => m.name === name || m.name.startsWith(name.split(":")[0]));
  }

  // ── Render ──
  return (
    <div className="add-model-page">
      <div className="add-model-topbar">
        <button className="back-btn" onClick={onBack}>
          &larr; Back to Chat
        </button>
        <h2>Add Model</h2>
      </div>

      <div className="add-model-content">
        {/* ══════ Section A: System Specs ══════ */}
        <section className="amp-section">
          <h3>System Specs</h3>
          {sysLoading ? (
            <div className="amp-loading">Loading system info...</div>
          ) : sysInfo ? (
            <>
              <div className="spec-cards">
                <div className="spec-card">
                  <div className="spec-label">CPU</div>
                  <div className="spec-value">{sysInfo.cpu_name}</div>
                  <div className="spec-sub">{sysInfo.cpu_cores} cores</div>
                </div>
                <div className="spec-card">
                  <div className="spec-label">RAM</div>
                  <div className="spec-value">{sysInfo.ram_total}</div>
                  <div className="spec-sub">{sysInfo.ram_free} free</div>
                </div>
                <div className="spec-card">
                  <div className="spec-label">GPU</div>
                  <div className="spec-value">{sysInfo.gpu_name}</div>
                  <div className="spec-sub">{sysInfo.gpu_vram} VRAM</div>
                </div>
              </div>
              {sysInfo.disks.length > 0 && (
                <div className="disk-list">
                  {sysInfo.disks.map((d) => (
                    <div className="disk-row" key={d.name}>
                      <span className="disk-name">{d.name}</span>
                      <span className="disk-info">{d.total} total</span>
                      <span className="disk-info">{d.free} free</span>
                      <div className="disk-bar-container">
                        <div
                          className="disk-bar-fill"
                          style={{ width: `${d.used_percent}%` }}
                        />
                      </div>
                      <span className="disk-percent">{d.used_percent}%</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="amp-loading">Could not load system info</div>
          )}
        </section>

        {/* ══════ Section B: Paid API ══════ */}
        <section className="amp-section">
          <h3>Paid API Providers</h3>

          {savedAPIs.length > 0 && (
            <div className="api-badges">
              {savedAPIs.map((a) => (
                <span className="api-badge" key={a.provider}>
                  {a.provider}
                  <button className="badge-remove" onClick={() => removeAPI(a.provider)}>x</button>
                </span>
              ))}
            </div>
          )}

          <div className="api-form">
            <div className="api-form-row">
              <label>Provider</label>
              <select value={provider} onChange={(e) => { setProvider(e.target.value); setTestResult(null); }}>
                <option>Claude</option>
                <option>OpenAI</option>
                <option>Custom</option>
              </select>
            </div>

            <div className="api-form-row">
              <label>API Key</label>
              <div className="key-input-wrap">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-..."
                />
                <button className="toggle-key" onClick={() => setShowKey(!showKey)}>
                  {showKey ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {provider === "Custom" && (
              <div className="api-form-row">
                <label>Base URL</label>
                <input
                  type="text"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://api.example.com"
                />
              </div>
            )}

            <div className="api-form-actions">
              <button onClick={testConnection} disabled={testing || !apiKey.trim()}>
                {testing ? "Testing..." : "Test Connection"}
              </button>
              <button onClick={saveAPI} disabled={!apiKey.trim()}>
                Save
              </button>
            </div>

            {testResult && (
              <div className={`test-result ${testResult.startsWith("Connected") ? "success" : "error"}`}>
                {testResult}
              </div>
            )}
          </div>
        </section>

        {/* ══════ Section C: Local Models ══════ */}
        <section className="amp-section">
          <h3>Local Models</h3>

          {/* Installed Models */}
          <div className="subsection">
            <h4>Installed Models</h4>
            {installedLoading ? (
              <div className="amp-loading">Scanning...</div>
            ) : installed.length === 0 ? (
              <div className="amp-loading">No models installed</div>
            ) : (
              <div className="installed-list">
                {installed.map((m) => (
                  <div className="installed-row" key={m.name}>
                    <span className="installed-name">{m.name}</span>
                    <span className="installed-size">{m.size}</span>
                    <div className="installed-actions">
                      <button className="btn-small" onClick={() => handleStop(m.name)}>Stop</button>
                      <button
                        className="btn-small btn-danger"
                        onClick={() => handleDelete(m.name)}
                        disabled={deleting[m.name]}
                      >
                        {deleting[m.name] ? "..." : "Delete"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Available to Install */}
          <div className="subsection">
            <h4>Available to Install</h4>
            <div className="model-cards">
              {AVAILABLE_MODELS.map((m) => {
                const alreadyInstalled = isInstalled(m.name);
                const progress = pulling[m.name];
                return (
                  <div className="model-card" key={m.name}>
                    <div className="model-card-header">
                      <div className="model-logo" style={{ background: m.color }}>
                        {m.initials}
                      </div>
                      <div className="model-card-info">
                        <div className="model-card-name">{m.name}</div>
                        <div className="model-card-maker">{m.maker}</div>
                      </div>
                    </div>
                    <div className="model-card-desc">{m.desc}</div>
                    <div className="model-card-size">{m.size}</div>
                    <div className="model-card-footer">
                      {progress ? (
                        <div className="pull-progress">
                          <div className="pull-bar-container">
                            <div className="pull-bar-fill" style={{ width: `${progress.percent}%` }} />
                          </div>
                          <span className="pull-status">{progress.status}</span>
                        </div>
                      ) : alreadyInstalled ? (
                        <span className="installed-badge">Installed</span>
                      ) : (
                        <button className="btn-install" onClick={() => handleInstall(m.name)}>
                          Install
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
