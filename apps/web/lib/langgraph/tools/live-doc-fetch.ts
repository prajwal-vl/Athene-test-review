import { withNangoAccess, type SourceType } from "@/lib/nango/client";
import { fetchGoogleDriveDocument } from "@/lib/integrations/google/drive-fetcher";
import { fetchSharePointDocument } from "@/lib/integrations/microsoft/sharepoint-fetcher";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export async function liveFetchDocument(input: { orgId: string; sourceType: SourceType; sourceId: string }) {
  const supabase = createSupabaseServiceClient();
  const { data: integration, error } = await supabase
    .from("org_integrations")
    .select("nango_connection_id")
    .eq("org_id", input.orgId)
    .eq("source_type", input.sourceType)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!integration) throw new Error(`No active ${input.sourceType} integration for this org`);

  return withNangoAccess(input.sourceType, integration.nango_connection_id, async (token) => {
    if (input.sourceType === "gdrive") return fetchGoogleDriveDocument(token, input.sourceId);
    if (input.sourceType === "sharepoint" || input.sourceType === "onedrive") return fetchSharePointDocument(token, input.sourceId);
    throw new Error(`Live document fetch is not implemented for ${input.sourceType}`);
  });
}
