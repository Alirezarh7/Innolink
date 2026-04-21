# InnoLink

**Open-source AI Workspace Agent** built with Tauri + React + TypeScript.

InnoLink routes your prompts to the best AI model automatically — using free local models when possible, and paid APIs only when needed.

## Architecture

```
┌─────────────────────────────────────────────┐
│                  InnoLink App               │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐ │
│  │   Chat   │  │  Model   │  │   Cost    │ │
│  │    UI    │  │  Panel   │  │  Tracker  │ │
│  └────┬─────┘  └──────────┘  └───────────┘ │
│       │                                     │
│  ┌────▼──────────────────┐                  │
│  │    Smart Router       │                  │
│  │  (useRouter.ts)       │                  │
│  └────┬──────────┬───────┘                  │
│       │          │                          │
│  ┌────▼───┐  ┌──▼────────┐                 │
│  │ Ollama │  │ Claude API│                  │
│  │ (free) │  │  (paid)   │                  │
│  └────────┘  └───────────┘                  │
│                                             │
│  ── Tauri (Rust Backend) ──                 │
│  • chat_ollama command                      │
│  • list_ollama_models command               │
└─────────────────────────────────────────────┘
```

## Smart Router

Prompts are automatically routed to the best model:

| Condition | Model | Provider | Cost |
|-----------|-------|----------|------|
| Architecture/design keywords | Claude Sonnet | Claude API | Paid |
| Code keywords (function, class, bug...) | qwen2.5-coder:7b | Ollama (local) | Free |
| Short prompts (< 200 chars) | phi4 | Ollama (local) | Free |
| Default | qwen2.5-coder:7b | Ollama (local) | Free |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | [Tauri v2](https://tauri.app/) (Rust) |
| Frontend | React 19 + TypeScript |
| Build Tool | Vite 7 |
| Local AI | [Ollama](https://ollama.ai/) (phi4, qwen2.5-coder:7b) |
| Cloud AI | Claude API (optional) |

## Prerequisites

- **Node.js** >= 20 LTS
- **Rust** (via [rustup](https://rustup.rs/))
- **Ollama** with models pulled:
  ```bash
  ollama pull phi4
  ollama pull qwen2.5-coder:7b
  ```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## Getting Started

```bash
# Install dependencies
npm install

# Start development (opens desktop window)
npm run tauri dev

# Build for production
npm run tauri build
```

## Project Structure

```
innolink/
├── src/                        # React frontend
│   ├── components/
│   │   ├── Chat.tsx            # Main chat interface
│   │   ├── ModelPanel.tsx      # Model status display
│   │   └── CostTracker.tsx     # API cost tracking
│   ├── hooks/
│   │   └── useRouter.ts        # Smart model routing
│   ├── types/
│   │   └── index.ts            # Shared TypeScript types
│   ├── App.tsx                 # Root layout
│   └── App.css                 # Dark theme styles
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── lib.rs              # Tauri commands (Ollama integration)
│   │   └── main.rs             # App entry point
│   ├── Cargo.toml              # Rust dependencies
│   └── tauri.conf.json         # Tauri configuration
├── .gitignore
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Environment Setup Report

| Tool | Status | Version |
|------|--------|---------|
| Node.js | Installed | v24.11.0 |
| Rust | Installed | 1.95.0 |
| Cargo | Installed | 1.95.0 |
| Ollama | Installed | Running locally |
| phi4 | Pulled | Available |
| qwen2.5-coder:7b | Pulled | Available |

## License

MIT
