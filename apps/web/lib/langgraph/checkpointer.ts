import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { AtheneState } from "@/lib/langgraph/state";
import { stripEphemeralContent } from "@/lib/langgraph/state";

export class SupabaseCheckpointer {
  async save(state: AtheneState, metadata?: Record<string, unknown>) {
    const checkpoint = stripEphemeralContent(state);
    const supabase = createSupabaseServiceClient();
    const checkpointId = new Date().toISOString();
    const { error } = await supabase.from("langgraph_checkpoints").insert({
      thread_id: state.thread_id,
      checkpoint_ns: "",
      checkpoint_id: checkpointId,
      org_id: state.org_id,
      user_id: state.user_id,
      checkpoint,
      metadata: metadata || {},
    });
    if (error) throw error;
    return checkpointId;
  }

  async loadLatest(threadId: string): Promise<AtheneState | null> {
    const supabase = createSupabaseServiceClient();
    const { data, error } = await supabase
      .from("langgraph_checkpoints")
      .select("checkpoint")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return (data?.checkpoint as AtheneState) || null;
  }
}
