"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  ShieldOff,
  Trash2,
  Plus,
  Loader2,
  Users,
  Building2,
  Info,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OrgMember {
  id: string;
  clerk_user_id: string;
  email: string;
  display_name: string | null;
  role: string;
  department_id: string | null;
}

interface Department {
  id: string;
  name: string;
  slug: string;
}

interface BiGrant {
  id: string;
  is_active: boolean;
  expires_at: string | null;
  created_at: string;
  user_id: string | null;
  clerk_user_id: string | null;
  user_email: string;
  user_display_name: string | null;
  dept_id: string | null;
  dept_name: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function memberLabel(m: OrgMember) {
  return m.display_name ? `${m.display_name} (${m.email})` : m.email;
}

function isExpired(expiresAt: string | null) {
  if (!expiresAt) return false;
  return new Date(expiresAt) < new Date();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function GrantsPage() {
  // ---- data state ----------------------------------------------------------
  const [grants, setGrants] = useState<BiGrant[]>([]);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  // ---- form state ----------------------------------------------------------
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [selectedDeptId, setSelectedDeptId] = useState("");
  const [deptNameInput, setDeptNameInput] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addSuccess, setAddSuccess] = useState(false);

  // ---- deletion state ------------------------------------------------------
  const [deleting, setDeleting] = useState<string | null>(null);

  // ---- fetch helpers -------------------------------------------------------

  const fetchAll = async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [grantsRes, membersRes, deptsRes] = await Promise.all([
        fetch("/api/admin/bi-grants"),
        fetch("/api/admin/members"),
        fetch("/api/admin/departments"),
      ]);

      if (!grantsRes.ok) throw new Error(`Failed to load grants (${grantsRes.status})`);
      if (!membersRes.ok) throw new Error(`Failed to load members (${membersRes.status})`);
      if (!deptsRes.ok) throw new Error(`Failed to load departments (${deptsRes.status})`);

      const [gData, mData, dData] = await Promise.all([
        grantsRes.json(),
        membersRes.json(),
        deptsRes.json(),
      ]);

      setGrants(gData.grants ?? []);
      setMembers(mData.members ?? []);
      setDepartments(dData.departments ?? []);
    } catch (e: any) {
      setPageError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  // Auto-fill dept name when a department is selected from the dropdown
  useEffect(() => {
    if (!selectedDeptId) { setDeptNameInput(""); return; }
    const dept = departments.find((d) => d.id === selectedDeptId);
    if (dept) setDeptNameInput(dept.name);
  }, [selectedDeptId, departments]);

  // ---- grant submission ----------------------------------------------------

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberId || !selectedDeptId) return;

    setAdding(true);
    setAddError(null);
    setAddSuccess(false);

    try {
      const body: Record<string, string> = {
        user_id: selectedMemberId,
        dept_id: selectedDeptId,
        dept_name: deptNameInput.trim(), // server validates this matches dept_id
      };
      if (expiresAt) body.expires_at = new Date(expiresAt).toISOString();

      const res = await fetch("/api/admin/bi-grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add grant");

      setAddSuccess(true);
      setSelectedMemberId("");
      setSelectedDeptId("");
      setDeptNameInput("");
      setExpiresAt("");
      await fetchAll();
    } catch (e: any) {
      setAddError(e.message);
    } finally {
      setAdding(false);
    }
  };

  // ---- grant deletion ------------------------------------------------------

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch("/api/admin/bi-grants", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Delete failed");
      }
      await fetchAll();
    } catch (e: any) {
      setPageError(e.message);
    } finally {
      setDeleting(null);
    }
  };

  // ---- render --------------------------------------------------------------

  const canSubmit =
    !adding &&
    selectedMemberId !== "" &&
    selectedDeptId !== "" &&
    deptNameInput.trim() !== "";

  return (
    <div className="space-y-8">
      {/* ---- Header -------------------------------------------------------- */}
      <div>
        <h1 className="text-4xl font-semibold text-[var(--foreground)] tracking-tight">
          BI Access Grants
        </h1>
        <p className="text-base text-[var(--sidebar-text-secondary)] mt-1 max-w-2xl">
          Grant verified organisation members cross-department data access for BI
          queries. A user can hold grants for multiple departments simultaneously —
          there is no limit.
        </p>
      </div>

      {/* ---- Info banner --------------------------------------------------- */}
      <div className="flex items-start gap-3 p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 text-sm text-purple-300">
        <Info className="h-4 w-4 mt-0.5 shrink-0 text-purple-400" />
        <span>
          Grants take effect <strong>immediately</strong> — the RBAC cache is
          invalidated on save. Only active, Clerk-verified organisation members
          can receive grants.
        </span>
      </div>

      {/* ---- Add grant form ------------------------------------------------ */}
      <div className="p-6 rounded-xl border border-[var(--sidebar-border)] bg-[var(--nav-hover)] space-y-5">
        <h2 className="text-lg font-semibold text-[var(--foreground)] flex items-center gap-2">
          <Plus className="h-4 w-4 text-purple-400" />
          Add Grant
        </h2>

        <form onSubmit={handleAdd} className="space-y-4">
          {/* Row 1: Member + Department pickers */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Member picker */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <Users className="h-3.5 w-3.5 text-[var(--sidebar-text-secondary)]" />
                Member
              </Label>
              {loading ? (
                <div className="h-10 rounded-lg bg-[var(--background)] border border-[var(--sidebar-border)] animate-pulse" />
              ) : (
                <select
                  id="grant-member-select"
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  required
                  className="w-full h-10 rounded-lg border border-[var(--sidebar-border)] bg-[var(--background)] text-[var(--foreground)] text-sm px-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-colors"
                >
                  <option value="">— select a member —</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {memberLabel(m)}
                    </option>
                  ))}
                </select>
              )}
              {members.length === 0 && !loading && (
                <p className="text-xs text-amber-400">
                  No members found. Invite users to your organisation first.
                </p>
              )}
            </div>

            {/* Department picker */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-sm font-medium">
                <Building2 className="h-3.5 w-3.5 text-[var(--sidebar-text-secondary)]" />
                Department
              </Label>
              {loading ? (
                <div className="h-10 rounded-lg bg-[var(--background)] border border-[var(--sidebar-border)] animate-pulse" />
              ) : (
                <select
                  id="grant-dept-select"
                  value={selectedDeptId}
                  onChange={(e) => setSelectedDeptId(e.target.value)}
                  required
                  className="w-full h-10 rounded-lg border border-[var(--sidebar-border)] bg-[var(--background)] text-[var(--foreground)] text-sm px-3 focus:outline-none focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-colors"
                >
                  <option value="">— select a department —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}  ·  ID: {d.id.slice(0, 8)}…
                    </option>
                  ))}
                </select>
              )}
              {/* Read-only chip showing the full Department ID after selection */}
              {selectedDeptId && (
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className="text-xs text-[var(--sidebar-text-secondary)] font-medium">
                    Department ID:
                  </span>
                  <code className="text-xs font-mono bg-[var(--background)] border border-purple-500/20 px-2 py-0.5 rounded text-purple-300 select-all">
                    {selectedDeptId}
                  </code>
                </div>
              )}
              {departments.length === 0 && !loading && (
                <p className="text-xs text-amber-400">
                  No departments found. Create departments before issuing grants.
                </p>
              )}
            </div>
          </div>

          {/* Row 2: Dept name confirmation + Expiry */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Department name confirmation (validated server-side) */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Department Name
                <span className="ml-1 text-[var(--sidebar-text-secondary)] font-normal text-xs">
                  (must match the department selected above — server-validated against Department ID)
                </span>
              </Label>
              <Input
                id="grant-dept-name"
                value={deptNameInput}
                onChange={(e) => setDeptNameInput(e.target.value)}
                placeholder="e.g. Engineering"
                required
                className="bg-[var(--background)] border-[var(--sidebar-border)] focus:ring-purple-500/50 focus:border-purple-500"
              />
            </div>

            {/* Expiry */}
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">
                Expires
                <span className="ml-1 text-[var(--sidebar-text-secondary)] font-normal text-xs">
                  (leave blank for permanent)
                </span>
              </Label>
              <Input
                id="grant-expires"
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="bg-[var(--background)] border-[var(--sidebar-border)] focus:ring-purple-500/50 focus:border-purple-500"
              />
            </div>
          </div>

          {/* Submit */}
          <div className="flex items-center gap-3 pt-1">
            <Button
              id="grant-submit-btn"
              type="submit"
              disabled={!canSubmit}
              className="bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50 transition-colors"
            >
              {adding ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Saving…
                </>
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  Grant Access
                </>
              )}
            </Button>

            {addSuccess && (
              <span className="flex items-center gap-1.5 text-green-400 text-sm animate-in fade-in duration-300">
                <CheckCircle2 className="h-4 w-4" />
                Grant created — cache evicted.
              </span>
            )}
          </div>

          {addError && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {addError}
            </div>
          )}
        </form>
      </div>

      {/* ---- Grants table -------------------------------------------------- */}
      <div className="rounded-xl border border-[var(--sidebar-border)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--sidebar-border)] bg-[var(--nav-hover)] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">
            Active Grants
          </h2>
          <span className="text-xs text-[var(--sidebar-text-secondary)]">
            {grants.length} grant{grants.length !== 1 ? "s" : ""} total
          </span>
        </div>

        {loading ? (
          <div className="p-10 flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--sidebar-text-secondary)]" />
          </div>
        ) : pageError ? (
          <div className="p-6 flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {pageError}
          </div>
        ) : grants.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <ShieldOff className="h-8 w-8 mx-auto text-[var(--sidebar-text-secondary)] opacity-40" />
            <p className="text-sm text-[var(--sidebar-text-secondary)]">
              No grants yet. Add one above.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-[var(--nav-hover)] border-b border-[var(--sidebar-border)]">
                <tr>
                  <th className="text-left px-5 py-3 font-medium text-[var(--sidebar-text-secondary)] text-xs uppercase tracking-wide">
                    Member
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-[var(--sidebar-text-secondary)] text-xs uppercase tracking-wide">
                    Department
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-[var(--sidebar-text-secondary)] text-xs uppercase tracking-wide">
                    Status
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-[var(--sidebar-text-secondary)] text-xs uppercase tracking-wide">
                    Expires
                  </th>
                  <th className="text-left px-5 py-3 font-medium text-[var(--sidebar-text-secondary)] text-xs uppercase tracking-wide">
                    Granted
                  </th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--sidebar-border)]">
                {grants.map((g) => {
                  const expired = isExpired(g.expires_at);
                  const statusActive = g.is_active && !expired;

                  return (
                    <tr
                      key={g.id}
                      className="hover:bg-[var(--nav-hover)] transition-colors group"
                    >
                      {/* Member */}
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col">
                          <span className="text-[var(--foreground)] font-medium leading-snug">
                            {g.user_display_name ?? g.user_email}
                          </span>
                          {g.user_display_name && (
                            <span className="text-xs text-[var(--sidebar-text-secondary)] leading-snug">
                              {g.user_email}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Department — shows both name and ID */}
                      <td className="px-5 py-3.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="inline-flex items-center gap-1.5 text-[var(--foreground)] font-medium leading-snug">
                            <Building2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                            <span>
                              <span className="text-[var(--sidebar-text-secondary)] font-normal text-xs mr-1">
                                Department Name:
                              </span>
                              {g.dept_name}
                            </span>
                          </span>
                          {g.dept_id && (
                            <span className="text-xs text-[var(--sidebar-text-secondary)] pl-5 font-mono">
                              <span className="not-italic font-sans text-[var(--sidebar-text-secondary)] mr-1">
                                Department ID:
                              </span>
                              {g.dept_id}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status */}
                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full font-medium ${
                            statusActive
                              ? "bg-green-500/10 text-green-400 border border-green-500/20"
                              : "bg-red-500/10 text-red-400 border border-red-500/20"
                          }`}
                        >
                          {statusActive ? (
                            <ShieldCheck className="h-3 w-3" />
                          ) : (
                            <ShieldOff className="h-3 w-3" />
                          )}
                          {!g.is_active ? "Revoked" : expired ? "Expired" : "Active"}
                        </span>
                      </td>

                      {/* Expires */}
                      <td className="px-5 py-3.5 text-[var(--sidebar-text-secondary)] text-sm">
                        {g.expires_at ? (
                          <span className={expired ? "text-red-400" : ""}>
                            {new Date(g.expires_at).toLocaleDateString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            })}
                          </span>
                        ) : (
                          <span className="text-purple-400 text-xs font-medium">
                            Permanent
                          </span>
                        )}
                      </td>

                      {/* Created */}
                      <td className="px-5 py-3.5 text-[var(--sidebar-text-secondary)] text-sm">
                        {new Date(g.created_at).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </td>

                      {/* Delete */}
                      <td className="px-5 py-3.5 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={deleting === g.id}
                          onClick={() => handleDelete(g.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"
                          title="Revoke grant"
                        >
                          {deleting === g.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
