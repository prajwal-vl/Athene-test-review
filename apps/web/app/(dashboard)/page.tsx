"use client";

import Link from "next/link";
import { Activity, BarChart3, Database, KeyRound, MessageSquare, ShieldCheck } from "lucide-react";

const actions = [
  { name: "Ask Athene", href: "/chat", icon: MessageSquare, text: "Search connected systems through the supervised agent graph." },
  { name: "BI Insights", href: "/insights", icon: BarChart3, text: "Run audited cross-department analysis using explicit grants." },
  { name: "Integrations", href: "/admin/integrations", icon: Database, text: "Register Nango connections without storing OAuth tokens." },
  { name: "BYOK", href: "/admin/keys", icon: KeyRound, text: "Store encrypted provider keys for model routing." },
  { name: "Grants", href: "/admin/grants", icon: ShieldCheck, text: "Control BI access to department-scoped documents." },
  { name: "Audit", href: "/admin/audit", icon: Activity, text: "Review immutable cross-dept access logs." },
];

export default function CommandCenterPage() {
  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Athene Supervisor</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Enterprise intelligence, scoped to your org.</h1>
        <p className="mt-2 max-w-2xl text-slate-500">Use the left navigation to connect sources, manage access, and query documents. Athene stores embeddings and metadata only.</p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link key={action.href} href={action.href} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-blue-300 hover:shadow-sm transition">
              <Icon className="w-5 h-5 text-blue-600" />
              <h2 className="mt-4 font-semibold text-slate-900">{action.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{action.text}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
