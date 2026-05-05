"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { BarChart3, Send } from "lucide-react";

export default function InsightsPage() {
  const { getToken } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState("");

  async function run() {
    const token = await getToken();
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt: `${prompt} cross-dept BI gap analysis` }),
    });
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let next = "";
    setAnswer("");
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      next += decoder.decode(value);
      for (const part of next.split("\n\n")) {
        if (part.startsWith("data: ")) {
          const event = JSON.parse(part.slice(6));
          if (event.type === "token") setAnswer(prev => prev + event.content);
        }
      }
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-blue-600 text-white"><BarChart3 className="w-5 h-5" /></div>
        <div><h1 className="text-2xl font-semibold text-slate-900">Cross-Department Insights</h1><p className="text-sm text-slate-500">BI mode enforces granted departments and audits each query.</p></div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="w-full min-h-32 outline-none text-slate-900" placeholder="Ask for trends, gaps, risks, or comparisons across permitted departments..." />
        <button onClick={run} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"><Send className="w-4 h-4" />Run BI Query</button>
      </div>
      {answer && <div className="bg-white border border-slate-200 rounded-xl p-6 whitespace-pre-wrap text-sm leading-6 text-slate-800">{answer}</div>}
    </div>
  );
}
