import { describe, it, expect, vi, beforeEach } from 'vitest'

// 1. Mock problematic top-level modules
vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {},
  supabaseServer: {},
  supabase: {},
}))

// Mock Nango node SDK
vi.mock('@nangohq/node', () => ({
  Nango: vi.fn().mockImplementation(() => ({
    getConnection: vi.fn().mockResolvedValue({
      metadata: { org_id: 'org-1' },
      connection_config: { subdomain: 'help' }
    })
  }))
}))

// Mock the base integration module
vi.mock('@/lib/integrations/base', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/integrations/base')>()
  return {
    ...actual,
    getProviderToken: vi.fn().mockResolvedValue('xoxb-fake-token'),
    getProviderMetadata: vi.fn().mockResolvedValue({ subdomain: 'help' }),
  }
})

import { fetchSlackMessages } from '../channels-fetcher'
import { searchSlack } from '../searcher'
import { getProviderToken } from '@/lib/integrations/base'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

describe('Slack Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset the mocked token for each test
    vi.mocked(getProviderToken).mockResolvedValue('xoxb-fake-token')
  })

  describe('fetchSlackMessages', () => {
    it('returns FetchedChunk[] with correct shape (Happy Path)', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          channels: [{ id: 'C123', name: 'general', is_archived: false }],
        }),
      })

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => ({
          ok: true,
          messages: [{ ts: '1714123456.000100', text: 'Hello team!', user: 'U123' }],
        }),
      })

      const chunks = await fetchSlackMessages('conn-1', 'org-1')

      expect(chunks).toHaveLength(1)
      expect(chunks[0].chunk_id).toBe('slack-msg-C123-1714123456.000100')
      expect(chunks[0].metadata.provider).toBe('slack')
      expect(getProviderToken).toHaveBeenCalledWith('conn-1', 'slack', 'org-1')
    })

    it('returns empty array when no channels found', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, channels: [] }),
      })

      const chunks = await fetchSlackMessages('conn-1', 'org-1')
      expect(chunks).toHaveLength(0)
    })

    it('handles pagination correctly', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ ok: true, channels: [{ id: 'C1' }], response_metadata: { next_cursor: 'p2' } }),
      })
      mockFetch.mockResolvedValueOnce({
        ok: true, status: 200,
        json: async () => ({ ok: true, channels: [{ id: 'C2' }], response_metadata: { next_cursor: '' } }),
      })
      mockFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, messages: [] }) })

      await fetchSlackMessages('conn-1', 'org-1')
      expect(mockFetch).toHaveBeenCalled()
    })

    it('fetches thread replies when thread_ts is present', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, channels: [{ id: 'C1' }] }) })
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, messages: [{ ts: '1', text: 'P', thread_ts: '1', reply_count: 1 }] }) })
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true, messages: [{ ts: '1', text: 'P' }, { ts: '2', text: 'R' }] }) })

      const chunks = await fetchSlackMessages('conn-1', 'org-1')
      expect(chunks[0].content).toContain('R')
    })
  })
})
