"use client";

import { useOrganization } from "@clerk/nextjs";
import { Users } from "lucide-react";

export default function AdminUsersPage() {
  const { memberships, isLoaded } = useOrganization({ memberships: true });
  const rows = memberships?.data || [];
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3"><Users className="w-6 h-6 text-blue-600" /><div><h1 className="text-2xl font-semibold text-slate-900">Org Members</h1><p className="text-sm text-slate-500">Roles come from Clerk organization membership.</p></div></div>
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500"><tr><th className="text-left p-4">User</th><th className="text-left p-4">Role</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {!isLoaded && <tr><td className="p-4" colSpan={2}>Loading Clerk membership...</td></tr>}
            {rows.map((member: any) => <tr key={member.id}><td className="p-4 text-slate-900">{member.publicUserData?.identifier || member.publicUserData?.userId}</td><td className="p-4"><span className="rounded-full bg-blue-50 px-2 py-1 text-xs text-blue-700">{member.role}</span></td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
