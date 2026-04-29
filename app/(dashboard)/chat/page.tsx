"use client";

import { useState, useRef, useEffect, FormEvent } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [threadId] = useState<string>(() => `thread-${Date.now()}`);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const userMessage = input.trim();
    if (!userMessage || isLoading) return;

    const userEntry: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userMessage,
    };

    setMessages((prev) => [...prev, userEntry]);
    setInput("");
    setIsLoading(true);

    const assistantId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "" },
    ]);

    try {
      const res = await fetch("/api/agent/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userMessage, threadId }),
      });

      if (!res.ok || !res.body) {
        throw new Error(`Server error: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.content) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: payload.content }
                    : m
                )
              );
            }
          } catch {
            // Ignore malformed SSE frames
          }
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                content:
                  err instanceof Error
                    ? `Error: ${err.message}`
                    : "An unexpected error occurred.",
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="pb-4 border-b border-[var(--sidebar-border)]">
        <h1 className="text-3xl font-semibold text-[var(--foreground)] tracking-tight">
          Chat
        </h1>
        <p className="text-sm text-[var(--sidebar-text-secondary)] mt-1">
          Ask your AI assistant anything about your organization.
        </p>
      </div>

      {/* Message list */}
      <div className="flex-1 overflow-y-auto py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-[var(--sidebar-text-secondary)] text-sm">
              Start a conversation below.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap ${
                msg.role === "user"
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "bg-[var(--nav-hover)] text-[var(--foreground)] border border-[var(--sidebar-border)]"
              }`}
            >
              {msg.content || (
                <span className="opacity-50 animate-pulse">Thinking…</span>
              )}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSubmit}
        className="border-t border-[var(--sidebar-border)] pt-4 flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isLoading}
          placeholder="Ask something…"
          className="flex-1 rounded-lg border border-[var(--sidebar-border)] bg-[var(--nav-hover)] px-4 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--sidebar-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--foreground)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-lg bg-[var(--foreground)] text-[var(--background)] px-4 py-2 text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
        >
          {isLoading ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
