import { BaseCheckpointSaver, Checkpoint, CheckpointMetadata, CheckpointTuple } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import { supabaseAdmin } from "../supabase/server";

export class SupabaseCheckpointer extends BaseCheckpointSaver {
  constructor() {
    super();
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const thread_id = config.configurable?.thread_id;
    if (!thread_id) return undefined;

    const { data, error } = await supabaseAdmin
      .from("langgraph_checkpoints")
      .select("checkpoint")
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return undefined;

    return {
      config,
      checkpoint: data.checkpoint as Checkpoint,
      metadata: { source: 'loop' as const, step: 0, parents: {} },
    };
  }

  async *list(
    config: RunnableConfig,
    _options?: { limit?: number; before?: RunnableConfig; filter?: Record<string, unknown> }
  ): AsyncGenerator<CheckpointTuple> {
    const thread_id = config.configurable?.thread_id;
    if (!thread_id) return;

    let query = supabaseAdmin
      .from("langgraph_checkpoints")
      .select("checkpoint")
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: false });

    if (_options?.limit) {
      query = query.limit(_options.limit);
    }

    const { data, error } = await query;
    if (!error && data) {
      for (const row of data) {
        yield {
          config,
          checkpoint: row.checkpoint as Checkpoint,
          metadata: { source: 'loop' as const, step: 0, parents: {} },
        };
      }
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    _metadata: CheckpointMetadata,
    _newVersions?: Record<string, unknown>
  ): Promise<RunnableConfig> {
    const thread_id = config.configurable?.thread_id;
    const org_id = config.configurable?.org_id;
    const user_id = config.configurable?.user_id;

    if (!thread_id || !org_id || !user_id) {
      throw new Error("Missing thread_id, org_id, or user_id in runnable config");
    }

    const { error } = await supabaseAdmin.from("langgraph_checkpoints").insert({
      thread_id,
      org_id,
      user_id,
      checkpoint,
    });

    if (error) {
      console.error("[SupabaseCheckpointer] Failed to save checkpoint:", error.message);
      throw error;
    }

    return {
      configurable: {
        ...config.configurable,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  async putWrites(
    _config: RunnableConfig,
    _writes: [string, unknown][],
    _taskId: string
  ): Promise<void> {
    // No-op: write-through is handled by put()
  }

  async deleteThread(_threadId: string): Promise<void> {
    await supabaseAdmin
      .from("langgraph_checkpoints")
      .delete()
      .eq("thread_id", _threadId);
  }
}

// Singleton export
let _instance: SupabaseCheckpointer | null = null;

export async function getCheckpointer(): Promise<SupabaseCheckpointer> {
  if (!_instance) {
    _instance = new SupabaseCheckpointer();
  }
  return _instance;
}

export async function _resetCheckpointer(): Promise<void> {
  _instance = null;
}
