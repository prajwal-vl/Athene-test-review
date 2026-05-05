"use client";

import { useAuth } from "@clerk/nextjs";
import { useState } from "react";
import { CalendarDays, Mail, ListChecks, Sparkles } from "lucide-react";

export default function BriefingPage() {
  const { getToken } = useAuth();
  const [briefing, setBriefing] = useState("");

  async function planDay() {
    const token = await getToken();
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ prompt: "plan my day using my briefing sources" }),
    });
    const reader = response.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    setBriefing("");
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      for (const part of decoder.decode(value).split("\n\n")) {
        if (part.startsWith("data: ")) {
          const event = JSON.parse(part.slice(6));
          if (event.type === "token") setBriefing(prev => prev + event.content);
        }
      }
    }
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-semibold text-slate-900">Morning Briefing</h1><p className="text-sm text-slate-500">Summaries are stored. Email bodies and event bodies are not.</p></div>
        <button onClick={planDay} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white"><Sparkles className="w-4 h-4" />Plan my day</button>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        {[["Priority email", Mail], ["Calendar blocks", CalendarDays], ["Tasks", ListChecks]].map(([label, Icon]: any) => <div key={label} className="bg-white border border-slate-200 rounded-xl p-5"><Icon className="w-5 h-5 text-blue-600" /><h2 className="mt-4 font-semibold text-slate-900">{label}</h2><p className="text-sm text-slate-500 mt-1">Generated from live connected sources.</p></div>)}
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-6 min-h-64 whitespace-pre-wrap text-sm leading-6 text-slate-800">{briefing || "Run a briefing to generate a live summary."}</div>
    </div>
  );
}
