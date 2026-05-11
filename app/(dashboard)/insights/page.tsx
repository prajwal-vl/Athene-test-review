"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { BarChart3, Send } from "lucide-react";

export default function InsightsPage() {
  const { getToken } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function runQuery() {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    setAnswer("");

    try {
      const token = await getToken();
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: `${prompt} cross-dept BI gap analysis`,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API error ${response.status}: ${text}`);
      }

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value);
        for (const part of buffer.split("\n\n")) {
          if (part.startsWith("data: ")) {
            try {
              const event = JSON.parse(part.slice(6));
              if (event.type === "token") setAnswer((prev) => prev + event.content);
              if (event.type === "error") throw new Error(event.message);
            } catch {
              // partial chunk — keep buffering
            }
          }
        }
        // Keep the last incomplete chunk in the buffer
        const lastNewline = buffer.lastIndexOf("\n\n");
        if (lastNewline !== -1) buffer = buffer.slice(lastNewline + 2);
      }
    } catch (err) {
      console.error("BI query failed:", err);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-[var(--accent)] text-white">
          <BarChart3 className="w-5 h-5" />
        </div>
        <div>
          <h1 className="text-4xl font-semibold text-[var(--foreground)] tracking-tight">
            Analytics &amp; Insights
          </h1>
          <p className="text-base text-[var(--sidebar-text-secondary)] mt-1">
            BI mode — queries are scoped to granted departments and fully audited.
          </p>
        </div>
      </div>

      {/* Query input panel */}
      <div className="rounded-xl border border-[var(--sidebar-border)] bg-[var(--nav-hover)] p-5 space-y-3">
        <textarea
          id="bi-query-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) runQuery();
          }}
          className="w-full min-h-32 bg-transparent outline-none resize-none text-[var(--foreground)] placeholder:text-[var(--sidebar-text-secondary)] text-sm leading-6"
          placeholder="Ask for trends, gaps, risks, or comparisons across permitted departments…"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-[var(--sidebar-text-secondary)]">
            ⌘ + Enter to run
          </p>
          <button
            id="run-bi-query-btn"
            onClick={runQuery}
            disabled={loading || !prompt.trim()}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            <Send className="w-4 h-4" />
            {loading ? "Running…" : "Run BI Query"}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Answer output */}
      {answer && (
        <div className="rounded-xl border border-[var(--sidebar-border)] bg-[var(--nav-hover)] p-6 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">
          {answer}
        </div>
      )}

      {/* Empty state */}
      {!answer && !loading && (
        <div className="rounded-xl border border-[var(--sidebar-border)] bg-[var(--nav-hover)] flex items-center justify-center min-h-64">
          <p className="text-[var(--sidebar-text-secondary)] text-sm">
            Results will appear here after you run a query.
          </p>
        </div>
      )}
    </div>
  );
}
