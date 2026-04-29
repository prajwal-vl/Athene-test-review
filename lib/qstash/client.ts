import { Client } from '@upstash/qstash';
import { createClient } from '@supabase/supabase-js';
import { incrWithExpire, redis } from '@/lib/redis/client';

export const qstash = new Client({
  token: process.env.QSTASH_TOKEN || '',
});

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://local-dummy.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || 'dummy'
);

export type DispatchOptions = {
  orgId: string;
  sourceType: string;
  url: string;
  body: any;
};

const CONCURRENCY_LIMIT = 3;
const CONCURRENCY_TTL_SECONDS = 900; // 15 min max-age prevents leaked slots from blocking forever

export async function dispatchThrottled({
  orgId,
  sourceType,
  url,
  body,
}: DispatchOptions): Promise<{ dispatched: boolean; msgId?: string }> {
  const key = `nango_concurrency:${orgId}:${sourceType}`;

  try {
    const count = await incrWithExpire(key, CONCURRENCY_TTL_SECONDS);

    if (count === null) {
      console.warn(`[QStash] Redis unreachable — throttling ${key}`);
      return { dispatched: false };
    }

    if (count > CONCURRENCY_LIMIT) {
      // Give back the slot we just took — we're not going to use it
      await redis.decr(key);

      const { error } = await supabase.from('pending_background_jobs').insert({
        org_id: orgId,
        source_type: sourceType,
        url,
        body,
        status: 'waiting',
      });

      if (error) {
        console.error('[QStash] Failed to queue pending job:', error);
      }

      return { dispatched: false };
    }

    // Publish — decrement our slot if the publish call itself fails so it isn't leaked
    try {
      const response = await qstash.publishJSON({ url, body });
      return { dispatched: true, msgId: response.messageId };
    } catch (publishErr) {
      await redis.decr(key);
      throw publishErr;
    }
  } catch (error) {
    console.error('[QStash] Dispatch error:', error);
    return { dispatched: false };
  }
}

export async function releaseSlot(orgId: string, sourceType: string) {
  try {
    const key = `nango_concurrency:${orgId}:${sourceType}`;

    const count = await redis.decr(key);
    if ((count as number) < 0) {
      await redis.set(key, 0);
    }

    // Atomically claim the oldest waiting job by updating its status only if it is
    // still 'waiting'. This prevents two concurrent releaseSlot calls from both
    // claiming the same job (the second UPDATE matches 0 rows and gets no data back).
    const { data: jobs, error: selectErr } = await supabase
      .from('pending_background_jobs')
      .select('id, org_id, source_type, url, body')
      .eq('org_id', orgId)
      .eq('source_type', sourceType)
      .eq('status', 'waiting')
      .order('created_at', { ascending: true })
      .limit(1);

    if (selectErr) {
      console.error('[QStash] Error fetching pending jobs:', selectErr);
      return;
    }

    if (!jobs || jobs.length === 0) return;

    const job = jobs[0];

    // Claim atomically — only succeeds if status is still 'waiting'
    const { data: claimed } = await supabase
      .from('pending_background_jobs')
      .update({ status: 'processing' })
      .eq('id', job.id)
      .eq('status', 'waiting') // guard: prevents double-claim
      .select('id')
      .maybeSingle();

    if (!claimed) return; // Another worker claimed it first

    await supabase.from('pending_background_jobs').delete().eq('id', job.id);

    await dispatchThrottled({
      orgId: job.org_id,
      sourceType: job.source_type,
      url: job.url,
      body: job.body,
    });
  } catch (error) {
    console.error('[QStash] releaseSlot error:', error);
  }
}
