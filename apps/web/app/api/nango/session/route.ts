import { NextResponse } from "next/server";
import { Nango } from "@nangohq/node";
import { auth } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST() {
    try {
        const { userId, orgId } = await auth();

        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY || "" });

        // SDK 0.69.x uses the `tags` shape (not `end_user`)
        const { data } = await nango.createConnectSession({
            tags: {
                end_user_id: userId,
                ...(orgId && { org_id: orgId }),
            },
        });

        return NextResponse.json({ token: data.token });
    } catch (error) {
        console.error("Error creating Nango session:", error);
        return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
    }
}
