import type { AtheneState } from "@/lib/langgraph/state";

export function supervisorNode(state: AtheneState): Partial<AtheneState> {
  const prompt = String(state.messages.at(-1)?.content || "").toLowerCase();
  const wantsWrite = /\b(send|email|reply|schedule|create event|reschedule)\b/.test(prompt);
  const wantsIndex = /\b(index|sync|connect|ingest)\b/.test(prompt);
  const crossDept = /\b(cross[- ]dept|department|all teams|gap analysis|bi)\b/.test(prompt);
  const report = /\b(report|briefing|summarize|synthesis|plan my day)\b/.test(prompt);
  let active = "retrieval_agent";
  if (wantsIndex) active = "data_index_agent";
  else if (wantsWrite && /\b(calendar|schedule|event|slot)\b/.test(prompt)) active = "calendar_agent";
  else if (wantsWrite) active = "email_agent";
  else if (crossDept) active = "cross_dept_agent";
  else if (report) active = "report_agent";
  return {
    active_agent: active,
    task_type: active.replace("_agent", ""),
    complexity: crossDept || report ? "complex" : wantsWrite ? "medium" : "simple",
    is_cross_dept_query: crossDept,
  };
}
