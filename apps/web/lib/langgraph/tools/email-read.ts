import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { withNangoAccess } from "@/lib/nango/client";
import { readUnreadOutlookMessages } from "@/lib/integrations/microsoft/outlook-fetcher";
import { readUnreadGmailMessages } from "@/lib/integrations/google/gmail-fetcher";

export async function readUnreadEmail(orgId: string, source: "outlook" | "gmail") {
  const supabase = createSupabaseServiceClient();
  const { data, error } = await supabase
    .from("org_integrations")
    .select("nango_connection_id")
    .eq("org_id", orgId)
    .eq("source_type", source)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`No active ${source} integration`);
  return withNangoAccess(source, data.nango_connection_id, async (token) =>
    source === "gmail" ? readUnreadGmailMessages(token) : readUnreadOutlookMessages(token),
  );
}
