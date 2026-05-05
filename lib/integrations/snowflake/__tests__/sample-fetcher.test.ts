import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchSnowflakeSamples } from '../sample-fetcher'
import * as client from '../client'
import * as nango from '@/lib/nango/client'

vi.mock('../client', () => ({
  snowflakeFetch: vi.fn(),
}))

vi.mock('@/lib/nango/client', () => ({
  getConnection: vi.fn(),
  getToken: vi.fn(),
}))

describe('snowflake sample-fetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should fetch samples from allowlisted tables', async () => {
    // Mock connection metadata
    vi.mocked(nango.getConnection).mockResolvedValue({
      metadata: {
        account_identifier: 'test-acc',
        allowlist: ['DB.SCH.TABLE1']
      }
    } as any)

    // Mock snowflake fetch
    vi.mocked(client.snowflakeFetch).mockImplementation(async (connectionId, orgId, sql) => ({
      resultSetMetaData: {
        rowType: [
          { name: 'ID' },
          { name: 'NAME' }
        ]
      },
      data: [
        ['1', 'Alice'],
        ['2', 'Bob']
      ]
    }))

    const chunks = await fetchSnowflakeSamples('conn-123', 'org-123')

    expect(chunks).toHaveLength(1)
    expect(chunks[0].title).toBe('table: TABLE1')
    expect(chunks[0].content).toContain('id: 1, name: Alice')
    expect(chunks[0].content).toContain('id: 2, name: Bob')
  })
})
