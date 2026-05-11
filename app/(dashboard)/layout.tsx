import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { Header } from "@/components/header";
import { resolveUserAccess } from "@/lib/auth/rbac";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, orgId, orgRole } = await auth();

  // Protect dashboard routes
  if (!userId) {
    redirect("/");
  }

  const userAccess = orgId
    ? await resolveUserAccess(userId, orgId, orgRole)
    : { role: 'member' as const, dept_id: null, accessible_dept_ids: [], bi_grant_id: null };

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      {/* Sidebar */}
      <Sidebar role={userAccess.role ?? 'member'} className="hidden lg:flex" />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header role={userAccess.role ?? 'member'} />

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-gradient-to-b from-[var(--background)] via-[var(--background)] to-purple-950/5 dark:to-purple-950/20">
          <div className="container mx-auto max-w-7xl px-8 py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
