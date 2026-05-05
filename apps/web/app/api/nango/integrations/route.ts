import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface ConfiguredIntegration {
    uniqueKey: string;   // e.g. "github-getting-started"
    provider: string;    // e.g. "github"
    displayName: string;
    logo: string;
}

// Returns integrations you have configured in your Nango dashboard.
// Only these can be connected by users — the rest show "Request Integration".
export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const res = await fetch("https://api.nango.dev/integrations", {
            headers: {
                Authorization: `Bearer ${process.env.NANGO_SECRET_KEY}`,
            },
        });

        if (!res.ok) {
            const body = await res.text();
            console.error(`[nango/integrations] HTTP ${res.status}:`, body.slice(0, 500));
            return NextResponse.json([], { status: 200 }); // graceful fallback
        }

        const json = await res.json() as {
            data: Array<{
                unique_key: string;
                provider: string;
                display_name?: string;
                logo?: string;
            }>;
        };

        const integrations: ConfiguredIntegration[] = (json.data ?? []).map((c) => ({
            uniqueKey: c.unique_key,
            provider: c.provider,
            displayName: c.display_name || c.provider,
            logo: c.logo ?? `https://cdn.simpleicons.org/${c.provider}`,
        }));

        return NextResponse.json(integrations, {
            headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
        });
    } catch (error) {
        console.error("[nango/integrations] Error:", error);
        return NextResponse.json([], { status: 200 }); // graceful fallback
    }
}
