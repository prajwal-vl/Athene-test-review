import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface NangoProvider {
    key: string;        // e.g. "github"
    name: string;       // e.g. "GitHub"
    categories: string[];
    logoUrl: string;
}

// Returns all ~400+ providers Nango supports.
// Requires auth — do not expose the secret key to the browser.
export async function GET() {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const res = await fetch("https://api.nango.dev/providers", {
            headers: {
                Authorization: `Bearer ${process.env.NANGO_SECRET_KEY}`,
            },
        });

        if (!res.ok) {
            const body = await res.text();
            console.error(`[nango/providers] HTTP ${res.status}:`, body.slice(0, 300));
            return NextResponse.json({ error: "Failed to fetch providers", status: res.status }, { status: 502 });
        }

        const json = await res.json() as {
            data: Array<{
                name: string;
                display_name: string;
                categories?: string[];
                logo_url?: string;
            }>;
        };

        const providers: NangoProvider[] = (json.data ?? [])
            .map((p) => ({
                key: p.name,
                name: p.display_name || p.name,
                categories: p.categories ?? [],
                logoUrl: p.logo_url ?? "",
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

        return NextResponse.json(providers, {
            headers: { "Cache-Control": "private, max-age=3600, stale-while-revalidate=7200" },
        });
    } catch (error) {
        console.error("[nango/providers] Error:", error);
        return NextResponse.json({ error: "Failed to fetch providers" }, { status: 500 });
    }
}
