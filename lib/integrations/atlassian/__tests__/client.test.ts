import { vi, describe, it, expect, beforeEach } from 'vitest'
import { jiraFetch, confluenceFetch, getAtlassianResources } from '../client'
import * as base from '@/lib/integrations/base'

vi.mock('@/lib/integrations/base', () => ({
  baseFetch: vi.fn(),
  getProviderToken: vi.fn().mockResolvedValue('mock-token'),
}))

describe('Atlassian Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('getAtlassianResources calls the correct endpoint', async () => {
    const mockResources = [{ id: 'site-1', url: 'https://site-1.atlassian.net', name: 'Site 1' }]
    ;(base.baseFetch as any).mockResolvedValue(mockResources)

    const resources = await getAtlassianResources('conn-1', 'jira', 'org-1')
    
    expect(base.getProviderToken).toHaveBeenCalledWith('conn-1', 'jira', 'org-1')
    expect(base.baseFetch).toHaveBeenCalledWith(
      'https://api.atlassian.com/oauth/token/accessible-resources',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-token',
        }),
      })
    )
    expect(resources).toEqual(mockResources)
  })

  it('jiraFetch constructs the correct cloud URL', async () => {
    ;(base.baseFetch as any).mockResolvedValue({ status: 'ok' })

    await jiraFetch('conn-1', 'org-1', 'cloud-123', '/rest/api/3/issue/KEY-1')

    expect(base.baseFetch).toHaveBeenCalledWith(
      'https://api.atlassian.com/ex/jira/cloud-123/rest/api/3/issue/KEY-1',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-token',
        }),
      })
    )
  })

  it('confluenceFetch constructs the correct cloud URL', async () => {
    ;(base.baseFetch as any).mockResolvedValue({ status: 'ok' })

    await confluenceFetch('conn-1', 'org-1', 'cloud-123', '/wiki/rest/api/content/123')

    expect(base.baseFetch).toHaveBeenCalledWith(
      'https://api.atlassian.com/ex/confluence/cloud-123/wiki/rest/api/content/123',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer mock-token',
        }),
      })
    )
  })
})
