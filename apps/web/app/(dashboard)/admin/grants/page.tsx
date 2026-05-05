"use client";

import { useAuth } from "@clerk/nextjs";
import { ShieldCheck } from "lucide-react";
import { useState } from "react";

export default function GrantsPage() {
  const { getToken } = useAuth();
  const [userId, setUserId] = useState("");
  const [deptIds, setDeptIds] = useState("");
  const [result, setResult] = useState("");
  async function grant() {
    const token = await getToken();
    const res = await fetch("/api/admin/bi-grants", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ user_id: userId, granted_dept_ids: deptIds.split(",").map(v => v.trim()).filter(Boolean) }) });
    setResult(res.ok ? "Grant created" : await res.text());
  }
  return <div className="max-w-4xl mx-auto space-y-6"><div className="flex items-center gap-3"><ShieldCheck className="w-6 h-6 text-blue-600" /><div><h1 className="text-2xl font-semibold text-slate-900">BI Access Grants</h1><p className="text-sm text-slate-500">BI analysts only see bi_accessible documents from granted departments.</p></div></div><div className="bg-white border border-slate-200 rounded-xl p-4 grid gap-3"><input value={userId} onChange={e => setUserId(e.target.value)} placeholder="Clerk user ID" className="border border-slate-200 rounded-lg px-3 py-2" /><input value={deptIds} onChange={e => setDeptIds(e.target.value)} placeholder="Department UUIDs, comma separated" className="border border-slate-200 rounded-lg px-3 py-2" /><button onClick={grant} className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm w-fit">Create Grant</button></div>{result && <p className="text-sm text-slate-600">{result}</p>}</div>;
}
