import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export async function withRLS<T>(
  userId: string,
  orgId: string,
  fn: (client: SupabaseClient) => Promise<T>,
): Promise<T> {
  const client = createSupabaseServiceClient();
  const { error } = await client.rpc("set_app_context", { p_org_id: orgId, p_user_id: userId });
  if (error) throw error;
  return fn(client);
}
