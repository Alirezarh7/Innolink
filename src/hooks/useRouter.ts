import type { RouteResult } from "../types";

const CODE_KEYWORDS = ["function", "class", "bug", "error", "fix", "code", "debug", "compile", "syntax", "variable", "import", "export", "async", "await", "promise", "api", "endpoint"];
const ARCH_KEYWORDS = ["design", "system", "architect", "architecture", "infrastructure", "scalable", "microservice", "pattern", "diagram"];

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw));
}

export function routePrompt(prompt: string): RouteResult {
  const trimmed = prompt.trim();

  // Rule 1: Architecture keywords → Claude API (paid)
  if (containsAny(trimmed, ARCH_KEYWORDS)) {
    return {
      model: "claude-sonnet",
      provider: "claude",
      isFree: false,
      reason: "Architecture/design question → Claude API",
    };
  }

  // Rule 2: Code keywords → qwen2.5-coder (free, local)
  if (containsAny(trimmed, CODE_KEYWORDS)) {
    return {
      model: "qwen2.5-coder:7b",
      provider: "ollama",
      isFree: true,
      reason: "Code-related question → Qwen Coder (local)",
    };
  }

  // Rule 3: Short simple prompts → phi4 (free, local)
  if (trimmed.length < 200) {
    return {
      model: "phi4",
      provider: "ollama",
      isFree: true,
      reason: "Short prompt → Phi4 (local)",
    };
  }

  // Default: longer general prompts → qwen2.5-coder as fallback
  return {
    model: "qwen2.5-coder:7b",
    provider: "ollama",
    isFree: true,
    reason: "General prompt → Qwen Coder (local)",
  };
}
