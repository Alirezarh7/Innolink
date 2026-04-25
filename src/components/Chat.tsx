import { useState, useRef, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { routePrompt } from "../hooks/useRouter";
import type { ChatMessage } from "../types";

function detectDirection(text: string): "rtl" | "ltr" {
  const firstChar = text.replace(/[\s\d\p{P}\p{S}]/gu, "").charAt(0);
  if (!firstChar) return "ltr";
  const rtlRegex = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
  return rtlRegex.test(firstChar) ? "rtl" : "ltr";
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingModel, setStreamingModel] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const messagesRef = useRef<ChatMessage[]>([]);

  // Keep ref in sync with state
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  const handleSend = useCallback(async () => {
    const prompt = input.trim();
    if (!prompt || isLoading) return;

    const route = routePrompt(prompt);

    const userMsg: ChatMessage = {
      role: "user",
      content: prompt,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);
    setStreamingText("");
    setStreamingModel(route.model);

    if (route.provider === "ollama") {
      let fullText = "";
      let listenersCleaned = false;
      let unlistenToken: (() => void) | null = null;
      let unlistenDone: (() => void) | null = null;

      const cleanup = () => {
        if (listenersCleaned) return;
        listenersCleaned = true;
        unlistenToken?.();
        unlistenDone?.();
      };

      unlistenToken = await listen<string>("ollama-token", (event) => {
        fullText += event.payload;
        setStreamingText(fullText);
      });

      unlistenDone = await listen<string>("ollama-done", (event) => {
        const assistantMsg: ChatMessage = {
          role: "assistant",
          content: event.payload,
          model: route.model,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
        setStreamingText("");
        setStreamingModel("");
        setIsLoading(false);
        cleanup();
      });

      try {
        await invoke<string>("chat_ollama", {
          prompt,
          model: route.model,
        });
      } catch (err) {
        cleanup();
        setStreamingText("");
        setStreamingModel("");
        const errorMsg: ChatMessage = {
          role: "assistant",
          content: `Error: ${err}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errorMsg]);
        setIsLoading(false);
      }
    } else {
      const assistantMsg: ChatMessage = {
        role: "assistant",
        content: `[Claude API not configured yet]\nRoute: ${route.reason}`,
        model: route.model,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setIsLoading(false);
    }
  }, [input, isLoading]);

  return (
    <div className="chat-container">
      <div className="chat-messages">
        {messages.map((msg, i) => {
          const dir = detectDirection(msg.content);
          return (
            <div
              key={i}
              className={`message ${msg.role}`}
              dir={dir}
              style={{ textAlign: dir === "rtl" ? "right" : "left" }}
            >
              {msg.model && (
                <span className="model-badge">{msg.model}</span>
              )}
              <p>{msg.content}</p>
            </div>
          );
        })}
        {streamingText && (
          <div
            className="message assistant"
            dir={detectDirection(streamingText)}
            style={{
              textAlign:
                detectDirection(streamingText) === "rtl" ? "right" : "left",
            }}
          >
            <span className="model-badge">{streamingModel}</span>
            <p>
              {streamingText}
              <span className="cursor">|</span>
            </p>
          </div>
        )}
        {isLoading && !streamingText && (
          <div className="message assistant loading">Thinking...</div>
        )}
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
