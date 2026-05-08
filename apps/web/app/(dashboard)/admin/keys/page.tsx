"use client";

import { useAuth } from "@clerk/nextjs";
import { KeyRound } from "lucide-react";
import { useState, useEffect } from "react";

export default function KeysPage() {
  const { getToken } = useAuth();
  const [provider, setProvider] = useState("openai");
  const [key, setKey] = useState("");
  const [saved, setSaved] = useState<any>(null);
  const [existingKeys, setExistingKeys] = useState<any[]>([]);

  async function fetchKeys() {
    const token = await getToken();
    const res = await fetch("/api/admin/keys", { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setExistingKeys(await res.json());
  }

  useEffect(() => {
    fetchKeys();
  }, []);

  async function save() {
    const token = await getToken();
    const res = await fetch("/api/admin/keys", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ provider, key, label: provider }) });
    if (res.ok) {
      setSaved(await res.json());
      fetchKeys();
    }
    setKey("");
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <KeyRound className="w-6 h-6 text-blue-600" />
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">BYOK Keys</h1>
          <p className="text-sm text-slate-500">Keys are encrypted with pgcrypto. Only the last four characters are displayed.</p>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-xl p-4 flex gap-3">
        <input value={provider} onChange={e => setProvider(e.target.value)} className="border border-slate-200 rounded-lg px-3 py-2 text-slate-700" />
        <input value={key} onChange={e => setKey(e.target.value)} type="password" placeholder="Provider API key" className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-slate-700 placeholder:text-slate-400" />
        <button onClick={save} className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm">Store</button>
      </div>
      
      {saved && (
        <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-4 text-sm font-medium">
          Successfully stored {saved.provider} key ending in •••• {saved.key_hint}
        </div>
      )}

      {existingKeys.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
            <h2 className="font-medium text-slate-700">Active Keys</h2>
          </div>
          <ul className="divide-y divide-slate-200">
            {existingKeys.map(k => (
              <li key={k.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-900">{k.provider}</p>
                  <p className="text-sm text-slate-500">Ending in •••• {k.key_hint}</p>
                </div>
                <div className="text-sm text-slate-400">
                  {new Date(k.created_at || Date.now()).toLocaleDateString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
