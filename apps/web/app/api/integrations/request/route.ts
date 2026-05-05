import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// TODO: Replace file-based storage with a proper database (e.g. Postgres/Supabase) before production.
// File writes do NOT persist across Vercel serverless function invocations.
const REQUESTS_FILE = join(process.cwd(), "data", "integration-requests.json");

interface IntegrationRequest {
    providerKey: string;
    providerName: string;
    userId: string;
    orgId: string | null;
    requestedAt: string;
}

function readRequests(): IntegrationRequest[] {
    try {
        return JSON.parse(readFileSync(REQUESTS_FILE, "utf-8"));
    } catch {
        return [];
    }
}

function writeRequests(requests: IntegrationRequest[]) {
    mkdirSync(join(process.cwd(), "data"), { recursive: true });
    writeFileSync(REQUESTS_FILE, JSON.stringify(requests, null, 2));
}

// POST /api/integrations/request — log a user request for an unconfigured integration
export async function POST(req: NextRequest) {
    const { userId, orgId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json() as { providerKey: string; providerName: string };
    const { providerKey, providerName } = body;

    if (!providerKey || !providerName) {
        return NextResponse.json({ error: "providerKey and providerName are required" }, { status: 400 });
    }

    const requests = readRequests();

    // Deduplicate: one request per provider per org
    const alreadyRequested = requests.some(
        (r) => r.providerKey === providerKey && r.orgId === (orgId ?? null)
    );

    if (!alreadyRequested) {
        requests.push({ providerKey, providerName, userId, orgId: orgId ?? null, requestedAt: new Date().toISOString() });
        writeRequests(requests);
    }

    return NextResponse.json({ success: true, alreadyRequested });
}

// GET /api/integrations/request — retrieve all requests (admin visibility)
export async function GET() {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    return NextResponse.json(readRequests());
}
