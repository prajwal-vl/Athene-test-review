import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { deleteConnection } from "@/lib/nango/client";

/**
 * 🔒 SECURE DELETE ENDPOINT (Final Clean Version)
 * Strictly enforces Clerk Organization membership for deletion safety.
 */
export async function DELETE(request: Request) {
  // ⚡ Await auth() as required by Next.js 15+ / Turbopack
  const { userId, orgId } = await auth();

  // 🛡️ AUDIT CHECK: Enforce strict multi-tenant isolation
  if (!userId || !orgId) {
    return new NextResponse("Unauthorized: Organization membership required", { status: 401 });
  }

  // 📝 Extract parameters from URL search params
  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get('connectionId');
  const providerConfigKey = searchParams.get('providerConfigKey');

  if (!connectionId || !providerConfigKey) {
    return NextResponse.json(
      { 
        success: false,
        error: "Missing required parameters: connectionId, providerConfigKey" 
      },
      { status: 400 }
    );
  }

  try {
    // ⚡ Hardened deletion with strict OrgId ownership check
    await deleteConnection(connectionId, providerConfigKey, orgId);

    return NextResponse.json({
      success: true,
      message: "Connection deleted successfully",
      connectionId
    });
  } catch (err: any) {
    console.error("Error deleting connection:", err);
    
    return NextResponse.json(
      { 
        success: false,
        error: "Failed to delete connection",
        details: err.message,
        reason: err.reason || 'DELETE_FAILURE'
      }, 
      { status: err.status || 500 }
    );
  }
}
