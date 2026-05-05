import OpenAI from "openai";
import { createHash } from "crypto";
import { verifyQStashRequest } from "@/lib/qstash/verify";
import { withNangoAccess, type SourceType } from "@/lib/nango/client";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getRedis } from "@/lib/redis/client";
import { requireEnv } from "@/lib/env";
import { fetchGoogleDriveDocument } from "@/lib/integrations/google/drive-fetcher";
import { fetchSharePointDocument } from "@/lib/integrations/microsoft/sharepoint-fetcher";

export const runtime = "nodejs";

function chunkText(text: string, size = 2200, overlap = 260) {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size - overlap) chunks.push(text.slice(i, i + size));
  return chunks.filter((chunk) => chunk.trim().length > 0);
}

async function fetchBySource(sourceType: SourceType, token: string, sourceId: string) {
  if (sourceType === "gdrive") return fetchGoogleDriveDocument(token, sourceId);
  if (sourceType === "sharepoint" || sourceType === "onedrive") return fetchSharePointDocument(token, sourceId);
  throw new Error(`Indexer fetch is not configured for ${sourceType}`);
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!(await verifyQStashRequest(req, raw))) return Response.json({ error: "Invalid QStash signature" }, { status: 401 });
  const body = JSON.parse(raw);
  const orgId = String(body.org_id || "");
  const sourceType = String(body.source_type || body.tool_args?.source_type || "gdrive") as SourceType;
  const sourceId = String(body.source_id || body.tool_args?.source_id || "");
  if (!orgId || !sourceId) return Response.json({ error: "org_id and source_id are required from trusted QStash payload" }, { status: 400 });

  const redis = getRedis();
  const throttleKey = `nango_concurrency:${orgId}:${sourceType}`;
  const inFlight = await redis.incr(throttleKey);
  if (inFlight === 1) await redis.expire(throttleKey, 900);
  if (inFlight > 3) {
    await redis.decr(throttleKey);
    await createSupabaseServiceClient().from("pending_background_jobs").insert({
      thread_id: body.thread_id,
      tool_call_id: body.tool_call_id,
      org_id: orgId,
      tool_name: "data-index",
      tool_args: body,
      status: "waiting",
    });
    return Response.json({ queued: true });
  }

  try {
    const openai = new OpenAI({ apiKey: requireEnv("OPENAI_API_KEY") });
    const supabase = createSupabaseServiceClient();
    const { data: integration, error } = await supabase
      .from("org_integrations")
      .select("dept_id, nango_connection_id, visibility_default")
      .eq("org_id", orgId)
      .eq("source_type", sourceType)
      .eq("is_active", true)
      .single();
    if (error) throw error;

    const indexed = await withNangoAccess(sourceType, integration.nango_connection_id, async (token) => {
      let doc = await fetchBySource(sourceType, token, sourceId);
      let chunks = chunkText(doc.content);
      const embeddings = await openai.embeddings.create({ model: "text-embedding-3-small", input: chunks });
      const rows = chunks.map((chunk, index) => ({
        org_id: orgId,
        dept_id: integration.dept_id,
        source_type: sourceType,
        source_id: sourceId,
        source_url: doc.sourceUrl,
        content_hash: createHash("sha256").update(chunk).digest("hex"),
        chunk_index: index,
        visibility: integration.visibility_default,
        embedding: embeddings.data[index].embedding,
        metadata: { title: doc.title, author: doc.author, last_modified: doc.lastModified },
      }));
      const result = await supabase.from("document_embeddings").upsert(rows, { onConflict: "org_id,source_id,chunk_index" });
      doc = null as any;
      chunks = null as any;
      if (result.error) throw result.error;
      return rows.length;
    });

    await supabase.from("org_integrations").update({ sync_status: "idle", last_synced_at: new Date().toISOString() }).eq("org_id", orgId).eq("source_type", sourceType);
    return Response.json({ ok: true, indexed_chunks: indexed });
  } finally {
    await redis.decr(throttleKey);
  }
}
