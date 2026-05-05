import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { withNangoAccess, type SourceType } from "@/lib/nango/client";

export async function pureLiveSearch(input: { orgId: string; sourceType: SourceType; query: string }) {
  const supabase = createSupabaseServiceClient();
  const { data: integration, error } = await supabase
    .from("org_integrations")
    .select("nango_connection_id")
    .eq("org_id", input.orgId)
    .eq("source_type", input.sourceType)
    .eq("index_mode", "pure_live_search")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!integration) return [];
  return withNangoAccess(input.sourceType, integration.nango_connection_id, async () => {
    throw new Error(`Pure live search for ${input.sourceType} requires provider-specific search scope configuration`);
  });
}
