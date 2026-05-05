import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { withNangoAccess } from "@/lib/nango/client";
import { readTodayMicrosoftCalendar } from "@/lib/integrations/microsoft/calendar-fetcher";
import { readTodayGoogleCalendar } from "@/lib/integrations/google/calendar-fetcher";

export async function readTodayCalendar(orgId: string, source: "outlook" | "gmail") {
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
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return withNangoAccess(source, data.nango_connection_id, async (token) =>
    source === "gmail"
      ? readTodayGoogleCalendar(token, start.toISOString(), end.toISOString())
      : readTodayMicrosoftCalendar(token, start.toISOString(), end.toISOString()),
  );
}
