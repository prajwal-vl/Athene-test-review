"use client";

import { useAuth } from "@clerk/nextjs";
import { useState } from "react";
import { CalendarDays, Mail, ListChecks, Sparkles } from "lucide-react";

export default function BriefingPage() {
  const { getToken } = useAuth();
  const [briefing, setBriefing] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeAgent, setActiveAgent] = useState("");

  async function planDay() {
    setLoading(true);
    setError("");
    setBriefing("");
    setActiveAgent("");
    try {
      const token = await getToken();
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ prompt: "plan my day using my briefing sources" }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API error ${response.status}: ${text}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        for (const part of decoder.decode(value).split("\n\n")) {
          if (!part.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(part.slice(6));
            if (event.type === "token") setBriefing((prev) => prev + event.content);
            if (event.type === "agent") setActiveAgent(event.content);
            if (event.type === "done")  setActiveAgent("");
            if (event.type === "error") throw new Error(event.message);
          } catch (parseErr) {
            console.warn("SSE parse error:", parseErr, "raw part:", part);
          }
        }
      }
    } catch (err) {
      console.error("planDay failed:", err);
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
      setActiveAgent("");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-semibold text-[var(--foreground)] tracking-tight">
            Daily Briefing
          </h1>
          <p className="text-base text-[var(--sidebar-text-secondary)] mt-1">
            Your personalized daily digest — summaries only, no raw content stored.
          </p>
        </div>
        <button
          id="plan-my-day-btn"
          onClick={planDay}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium text-white bg-[var(--accent)] hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          <Sparkles className="w-4 h-4" />
          {loading ? "Planning…" : "Plan my day"}
        </button>
      </div>

      {/* Source category cards */}
      <div className="grid md:grid-cols-3 gap-4">
        {(
          [
            ["Priority email", Mail],
            ["Calendar blocks", CalendarDays],
            ["Tasks", ListChecks],
          ] as const
        ).map(([label, Icon]) => (
          <div
            key={label}
            className="rounded-xl border border-[var(--sidebar-border)] bg-[var(--nav-hover)] p-5"
          >
            <Icon className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="mt-4 font-semibold text-[var(--foreground)]">{label}</h2>
            <p className="text-sm text-[var(--sidebar-text-secondary)] mt-1">
              Generated from live connected sources.
            </p>
          </div>
        ))}
      </div>

      {/* Live agent activity indicator */}
      {activeAgent && (
        <p className="text-xs text-[var(--sidebar-text-secondary)] italic">
          Running: {activeAgent}…
        </p>
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Briefing output */}
      <div className="rounded-xl border border-[var(--sidebar-border)] bg-[var(--nav-hover)] p-6 min-h-64 whitespace-pre-wrap text-sm leading-6 text-[var(--foreground)]">
        {briefing || "Run a briefing to generate a live summary."}
      </div>
    </div>
  );
}

