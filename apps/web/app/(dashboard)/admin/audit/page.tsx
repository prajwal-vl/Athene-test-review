"use client";

import { useAuth } from "@clerk/nextjs";
import { FileClock } from "lucide-react";
import { useEffect, useState } from "react";

export default function AuditPage() {
  const { getToken } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { (async () => { const token = await getToken(); const res = await fetch("/api/admin/audit-log", { headers: { Authorization: `Bearer ${token}` } }); if (res.ok) setRows(await res.json()); })(); }, []);
  return <div className="max-w-6xl mx-auto space-y-6"><div className="flex items-center gap-3"><FileClock className="w-6 h-6 text-blue-600" /><div><h1 className="text-2xl font-semibold text-slate-900">Cross-Dept Audit Log</h1><p className="text-sm text-slate-500">Prompt hashes only. No raw cross-dept prompts are stored here.</p></div></div><div className="bg-white border border-slate-200 rounded-xl overflow-hidden"><table className="w-full text-sm"><thead className="bg-slate-50 text-slate-500"><tr><th className="p-4 text-left">User</th><th className="p-4 text-left">Prompt hash</th><th className="p-4 text-left">Accessed</th></tr></thead><tbody className="divide-y divide-slate-100">{rows.map(row => <tr key={row.id}><td className="p-4">{row.user_id}</td><td className="p-4 font-mono text-xs">{row.prompt_hash}</td><td className="p-4">{new Date(row.accessed_at).toLocaleString()}</td></tr>)}</tbody></table></div></div>;
}
