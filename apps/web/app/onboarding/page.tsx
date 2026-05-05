"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { CreateOrganization, useOrganizationList } from "@clerk/nextjs";
import { Building2, User, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
    const router = useRouter();
    const [selection, setSelection] = useState<"idle" | "organization">("idle");

    // Check if user already belongs to any organizations (invited member)
    const { userMemberships, setActive, isLoaded } = useOrganizationList({
        userMemberships: { infinite: true },
    });

    useEffect(() => {
        if (!isLoaded || !userMemberships.data) return;

        // Invited members already have org memberships — set active org and proceed
        if (userMemberships.data.length > 0) {
            setActive({ organization: userMemberships.data[0].organization.id })
                .then(() => router.push("/"))
                .catch(console.error);
        }
    }, [isLoaded, userMemberships.data, setActive, router]);

    // Show loading state while Clerk resolves memberships, or while redirecting invited members
    if (!isLoaded || (isLoaded && userMemberships.data && userMemberships.data.length > 0)) {
        return (
            <div className="flex min-h-screen w-full items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                    <p className="text-sm text-slate-500">Setting up your workspace...</p>
                </div>
            </div>
        );
    }

    // New user — no existing orgs → show admin setup flow
    return (
        <div className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-50 p-4">

            <div className="mb-8 flex flex-col items-center">
                <Image
                    src="/athene-logo.png"
                    alt="Athene AI"
                    width={200}
                    height={60}
                    className="object-contain"
                    priority
                />
            </div>

            {/* View 1: Workspace type selection */}
            {selection === "idle" && (
                <div className="w-full max-w-150 bg-white shadow-lg border border-slate-200 rounded-xl p-8">
                    <div className="mb-8 text-center">
                        <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">
                            Set up your workspace
                        </h1>
                        <p className="text-sm text-slate-500 mt-2">
                            You&apos;re the first person here. Create an organisation to invite your team and start orchestrating agents.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Organisation (active) */}
                        <button
                            onClick={() => setSelection("organization")}
                            className="flex flex-col items-start p-6 border-2 border-slate-200 rounded-xl hover:border-blue-600 hover:bg-blue-50/50 transition-all text-left group"
                        >
                            <div className="p-3 bg-blue-100 text-blue-600 rounded-lg mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                <Building2 className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-1">Organisation</h3>
                            <p className="text-sm text-slate-500">
                                Create a corporate workspace to orchestrate agents and invite your team.
                            </p>
                        </button>

                        {/* Personal (locked) */}
                        <button
                            disabled
                            className="flex flex-col items-start p-6 border-2 border-slate-100 rounded-xl bg-slate-50 opacity-70 cursor-not-allowed text-left relative overflow-hidden"
                        >
                            <div className="absolute top-4 right-4 bg-slate-200 text-slate-600 text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider">
                                Coming Soon
                            </div>
                            <div className="p-3 bg-slate-200 text-slate-500 rounded-lg mb-4">
                                <User className="w-6 h-6" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-900 mb-1">Personal</h3>
                            <p className="text-sm text-slate-500">
                                For individual developers building isolated intelligence layers.
                            </p>
                        </button>
                    </div>
                </div>
            )}

            {/* View 2: Clerk org creation */}
            {selection === "organization" && (
                <div className="w-full max-w-100 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <CreateOrganization
                        afterCreateOrganizationUrl="/onboarding/integrations"
                        appearance={{
                            elements: {
                                card: "bg-white shadow-lg border border-slate-200 rounded-xl w-full",
                                headerTitle: "text-2xl font-semibold text-slate-900 tracking-tight",
                                headerSubtitle: "text-sm text-slate-500",
                                formFieldInput: "flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all shadow-sm",
                                formFieldLabel: "text-sm font-medium text-slate-700",
                                formButtonPrimary: "bg-blue-600 hover:bg-blue-700 h-10 px-4 py-2 rounded-md font-medium w-full text-white transition-colors shadow-sm",
                                logoBox: "hidden",
                                dividerLine: "bg-slate-200",
                            },
                        }}
                    />

                    <button
                        onClick={() => setSelection("idle")}
                        className="mt-6 text-sm text-slate-500 hover:text-slate-900 flex w-full justify-center transition-colors"
                    >
                        ← Back to options
                    </button>
                </div>
            )}
        </div>
    );
}
