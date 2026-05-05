import { vi, describe, it, expect, beforeEach } from 'vitest';

// 1. Mock Supabase
let mockSupabaseTable: any[] = [];
vi.mock('@supabase/supabase-js', () => {
  return {
    createClient: () => ({
      from: (table: string) => ({
        insert: (data: any) => {
          mockSupabaseTable.push({ id: Math.random().toString(), ...data });
          return { error: null };
        },
        select: () => ({
          eq: (field: string, val: string) => ({
            eq: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => {
                    const jobs = mockSupabaseTable.filter(j => j.status === 'waiting');
                    return { data: jobs.length > 0 ? [jobs[0]] : [], error: null };
                  }
                })
              })
            })
          })
        }),
        delete: () => ({
          eq: (field: string, val: string) => {
            mockSupabaseTable = mockSupabaseTable.filter(j => j.id !== val);
            return { error: null };
          }
        }),
      })
    })
  };
});

// 2. Mock Redis Wrapper completely
let redisCounters: Record<string, number> = {};
vi.mock('@/lib/redis/client', () => {
  return {
    redis: {
      decr: vi.fn().mockImplementation(async (key: string) => {
        redisCounters[key] = (redisCounters[key] || 0) - 1;
        return redisCounters[key];
      }),
      set: vi.fn(),
    },
    incrWithExpire: vi.fn().mockImplementation(async (key: string) => {
      redisCounters[key] = (redisCounters[key] || 0) + 1;
      return redisCounters[key];
    })
  };
});

// 3. Mock @upstash/qstash
let pushCount = 0;
vi.mock('@upstash/qstash', () => ({
  Client: class {
    async publishJSON() {
      pushCount++;
      return { messageId: 'msg_test' };
    }
  },
  Receiver: class {
    async verify({ signature }: { signature: string }) {
      if (signature === 'invalid') throw new Error('Invalid signature');
      return true;
    }
  }
}));

import { dispatchThrottled, releaseSlot } from '@/lib/qstash/client';
import { verifyQStashSignature } from '@/lib/qstash/verify';

describe('Background Jobs Concurrency & Queueing', () => {
  beforeEach(() => {
    redisCounters = {};
    mockSupabaseTable = [];
    pushCount = 0;
  });

  const DUMMY_JOB = {
    orgId: 'org1',
    sourceType: 'slack',
    url: 'https://test/endpoint',
    body: { command: 'sync' }
  };

  it('allows 3 concurrent dispatches without queuing', async () => {
    for (let i = 0; i < 3; i++) {
      const res = await dispatchThrottled(DUMMY_JOB);
      expect(res.dispatched).toBe(true);
    }
    expect(pushCount).toBe(3);
    expect(mockSupabaseTable.length).toBe(0);
    expect(redisCounters['nango_concurrency:org1:slack']).toBe(3);
  });

  it('queues the 4th dispatch to Supabase instead of QStash', async () => {
    // Fill 3 slots
    for (let i = 0; i < 3; i++) await dispatchThrottled(DUMMY_JOB);
    
    // Attempt 4th
    const res = await dispatchThrottled(DUMMY_JOB);
    expect(res.dispatched).toBe(false);
    expect(pushCount).toBe(3); // Did NOT push
    
    // Counter should have retreated back to 3 after over-stepping
    expect(redisCounters['nango_concurrency:org1:slack']).toBe(3);
    
    // Job should be in supabase waiting
    expect(mockSupabaseTable.length).toBe(1);
    expect(mockSupabaseTable[0].status).toBe('waiting');
  });

  it('releaseSlot pulls the oldest queued job and dispatches it', async () => {
    // Push 4 jobs to set up the state
    for (let i = 0; i < 4; i++) await dispatchThrottled(DUMMY_JOB);
    
    expect(mockSupabaseTable.length).toBe(1);
    expect(pushCount).toBe(3);
    
    // Complete one slot
    await releaseSlot('org1', 'slack');

    // Supabase queue should now be empty because it was selected & deleted
    expect(mockSupabaseTable.length).toBe(0);
    
    // Push count should have increased to 4!
    expect(pushCount).toBe(4);
    
    // Since the queue dispatched the cached job, the concurrency goes back up
    expect(redisCounters['nango_concurrency:org1:slack']).toBe(3);
  });
});

describe('Webhook Signature Verification', () => {
  it('fails verification gracefully when signature is invalid', async () => {
    const req = new Request('https://test', {
      headers: { 'upstash-signature': 'invalid' },
      method: 'POST',
      body: 'test'
    });
    const isValid = await verifyQStashSignature(req);
    expect(isValid).toBe(false);
  });
  
  it('rejects completely missing signatures', async () => {
    const req = new Request('https://test', {
      method: 'POST',
      body: 'test'
    });
    const isValid = await verifyQStashSignature(req);
    expect(isValid).toBe(false);
  });
});
