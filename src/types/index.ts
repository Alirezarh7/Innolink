export type Provider = "ollama" | "claude";

export type ModelId = "phi4" | "qwen2.5-coder:7b" | "claude-sonnet";

export interface RouteResult {
  model: ModelId;
  provider: Provider;
  isFree: boolean;
  reason: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  model?: ModelId;
  timestamp: number;
}

export interface ModelStatus {
  name: string;
  isRunning: boolean;
  ramUsage?: string;
}

export interface CostEntry {
  model: ModelId;
  provider: Provider;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  timestamp: number;
}
