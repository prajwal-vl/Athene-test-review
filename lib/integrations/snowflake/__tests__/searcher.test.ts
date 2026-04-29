import { describe, it, expect, vi, beforeEach } from 'vitest'
import { snowflakeSearch } from '../searcher'
import * as client from '../client'
import * as nango from '@/lib/nango/client'

vi.mock('../client', () => ({
  snowflakeFetch: vi.fn(),
}))

vi.mock('@/lib/nango/client', () => ({
  getConnection: vi.fn(),
}))

describe('snowflake searcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(nango.getConnection).mockResolvedValue({
      metadata: { allowlist: ['DB.SCH.TABLE1'] }
    } as any)
  })

  it('should escape queries and search with LIKE', async () => {
    // 1st call for DESCRIBE
    vi.mocked(client.snowflakeFetch).mockResolvedValueOnce({
      resultSetMetaData: { rowType: [{ name: 'NAME' }, { name: 'TYPE' }] },
      data: [['COL1', 'VARCHAR']]
    })
    // 2nd call for SEARCH
    vi.mocked(client.snowflakeFetch).mockResolvedValueOnce({
      resultSetMetaData: { rowType: [{ name: 'COL1' }] },
      data: [['Match 1']]
    })

    const results = await snowflakeSearch('conn-1', 'org-1', "O'Reilly")

    expect(results).toHaveLength(1)
    expect(results[0].content).toContain('Match 1')
    // Verify escaping (O'Reilly -> O''Reilly)
    expect(client.snowflakeFetch).toHaveBeenCalledWith('conn-1', 'org-1', expect.stringContaining("LIKE '%O''Reilly%'"))
  })
})
