import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { routePrompt } from "../hooks/useRouter";
import type { ChatMessage } from "../types";

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const prompt = input.trim();
    if (!prompt || isLoading) return;

    const route = routePrompt(prompt);

    // Add user message
    const userMsg: ChatMessage = {
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    try {
      if (route.provider === "ollama") {
        // Call Ollama via Tauri backend
        const response = await invoke<string>("chat_ollama", {
          prompt,
          model: route.model,
        });

        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: response,
          model: route.model,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      } else {
        // Claude API placeholder
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: `[Claude API not configured yet]\nRoute: ${route.reason}`,
          model: route.model,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
    } catch (err) {
      const errorMsg: ChatMessage = {
        role: "assistant",
        content: `Error: ${err}`,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            {msg.model && (
              <span className="model-badge">{msg.model}</span>
            )}
            <p>{msg.content}</p>
          </div>
        ))}
        {isLoading && <div className="message assistant loading">Thinking...</div>}
        <div ref={bottomRef} />
      </div>

      <form
        className="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          handleSend();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything... (auto-routes to best model)"
          disabled={isLoading}
        />
        <button type="submit" disabled={isLoading}>
          Send
        </button>
      </form>
    </div>
  );
}
