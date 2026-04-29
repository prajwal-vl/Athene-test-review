"use client";

import { OrganizationProfile, useOrganization } from "@clerk/nextjs";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, CheckCircle2 } from "lucide-react";

function DirectInviteTool() {
  const { organization, isLoaded } = useOrganization();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded || !organization) return;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      await organization.inviteMember({
        emailAddress: email,
        role: "org:member",
      });
      setSuccess(true);
      setEmail("");
    } catch (err: any) {
      console.error("Clerk Invitation Error:", err);
      setError(err.errors?.[0]?.longMessage || err.message || "Failed to send invitation");
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded || !organization) return null;

  return (
    <div className="mt-12 pt-8 border-t border-[var(--sidebar-border)]">
      <div className="max-w-xl">
        <h2 className="text-xl font-semibold text-[var(--foreground)]">Direct Invitation Tool</h2>
        <p className="text-sm text-[var(--sidebar-text-secondary)] mt-1 mb-6">
          Use this if the standard Clerk component above is still showing errors. This tool will show specific error feedback.
        </p>

        <form onSubmit={handleInvite} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="direct-email">Email Address</Label>
            <div className="flex gap-2">
              <Input
                id="direct-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
                required
                className="bg-[var(--background)] border-[var(--sidebar-border)]"
              />
              <Button type="submit" disabled={loading} className="bg-purple-600 hover:bg-purple-700 text-white">
                {loading ? "Sending..." : "Send Invite"}
              </Button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              <p>{error}</p>
            </div>
          )}

          {success && (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-500 text-sm flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              <p>Invitation sent successfully!</p>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

export default function UsersPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-4xl font-semibold text-[var(--foreground)] tracking-tight">
          User Management
        </h1>
        <p className="text-base text-[var(--sidebar-text-secondary)] mt-1">
          Manage organization users and their roles
        </p>
      </div>

      <div className="mt-8">
        <OrganizationProfile
          appearance={{
            elements: {
              rootBox: "w-full mx-0",
              card: "w-full mx-0 shadow-none border border-[var(--sidebar-border)] bg-[var(--background)]",
              navbar: "hidden",
              scrollBox: "p-0 rounded-none",
              pageScrollBox: "p-8",
            },
          }}
          routing="hash"
        />
      </div>

      <DirectInviteTool />
    </div>
  );
}
