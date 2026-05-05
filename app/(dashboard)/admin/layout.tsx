import { redirect } from "next/navigation";
import { auth } from "@clerk/nextjs/server";
import { resolveUserAccess } from "@/lib/auth/rbac";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, orgId, orgRole } = await auth();

  // Not signed in → send to sign-in. Not in an org → send to chat.
  if (!userId) redirect("/sign-in");
  if (!orgId) redirect("/chat");

  const userAccess = await resolveUserAccess(userId, orgId, orgRole);

  // Step 4: Role-guard admin pages
  // Check resolveUserAccess().role === 'admin'
  if (userAccess.role !== "admin") {
    // Show "Access Denied" if user tries to load a server component directly
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 animate-in fade-in zoom-in duration-500">
        <div className="relative">
          <div className="absolute -inset-4 bg-red-500/10 rounded-full blur-2xl" />
          <ShieldAlert className="h-16 w-16 text-red-500 relative" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-[var(--foreground)]">
            Access Denied
          </h1>
          <p className="text-[var(--sidebar-text-secondary)] max-w-md mx-auto">
            You do not have the necessary permissions to access the administration area. Please contact your organization administrator if you believe this is an error.
          </p>
        </div>
        {/* Redirect to /chat if not admin (via button click) */}
        <Button asChild variant="outline" className="mt-4 border-purple-500/20 hover:bg-purple-500/5">
          <Link href="/chat">Return to Chat</Link>
        </Button>
      </div>
    );
  }

  return <>{children}</>;
}
