import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { deleteConnection } from "@/lib/nango/client";
import { supabaseAdmin } from "@/lib/supabase/server";

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
    // Collect document IDs before deletion so we can clean up kg_nodes afterwards.
    // FK cascade will delete the documents rows, but kg_nodes.source_documents[]
    // is a text array that won't be touched by the cascade.
    const { data: docRows } = await supabaseAdmin
      .from('documents')
      .select('id')
      .eq('connection_id', connectionId)
      .eq('org_id', orgId)

    const deletedDocIds: string[] = (docRows ?? []).map((r: { id: string }) => r.id)

    // ⚡ Hardened deletion with strict OrgId ownership check
    await deleteConnection(connectionId, providerConfigKey, orgId);

    // Clean up stale document IDs from kg_nodes.source_documents[].
    // Run for each deleted document ID; if source_documents becomes empty,
    // delete those kg_nodes entirely (they have no remaining source).
    if (deletedDocIds.length > 0) {
      for (const docId of deletedDocIds) {
        // Remove this doc ID from every kg_node that references it
        const { error: updateErr } = await supabaseAdmin.rpc('array_remove_kg_source', {
          p_org_id: orgId,
          p_doc_id: docId,
        })
        if (updateErr) {
          // Non-fatal: log but don't fail the delete response
          console.error('[connections/delete] Failed to clean kg_nodes for doc', docId, updateErr.message)
        }
      }

      // Delete kg_nodes whose source_documents array is now empty
      const { error: pruneErr } = await supabaseAdmin
        .from('kg_nodes')
        .delete()
        .eq('org_id', orgId)
        .eq('source_documents', '{}')

      if (pruneErr) {
        console.error('[connections/delete] Failed to prune empty kg_nodes:', pruneErr.message)
      }
    }

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
