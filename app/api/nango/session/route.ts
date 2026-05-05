import { NextResponse } from "next/server";
import { Nango } from "@nangohq/node";
import { auth } from "@clerk/nextjs/server";

export async function POST() {
  const { userId, orgId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const nango = new Nango({ secretKey: process.env.NANGO_SECRET_KEY || "" });

  const { data } = await nango.createConnectSession({
    end_user: {
      id: userId,
    },
    organization: orgId ? { id: orgId } : undefined,
  });

  return NextResponse.json({ token: data.token });
}
