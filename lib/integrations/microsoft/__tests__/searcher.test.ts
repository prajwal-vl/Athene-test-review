import { describe, it, expect, vi, beforeEach } from 'vitest'
import { microsoftSearch } from '../searcher'
import * as client from '../graph-client'

vi.mock('../graph-client', () => ({
  graphFetch: vi.fn(),
}))

describe('microsoft searcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should search emails and calendar', async () => {
    vi.mocked(client.graphFetch).mockImplementation(async (_connectionId, _orgId, endpoint) => {
      if (endpoint.includes('/messages')) {
        return {
          value: [{
            subject: 'Email Match',
            bodyPreview: 'Body content',
            webLink: 'https://outlook.com/1'
          }]
        }
      }
      if (endpoint.includes('/events')) {
        return {
          value: [{
            subject: 'Event Match',
            start: { dateTime: '2024-01-01' },
            end: { dateTime: '2024-01-01' },
            webLink: 'https://outlook.com/2'
          }]
        }
      }
      return { value: [] }
    })

    const results = await microsoftSearch('conn-1', 'org-1', 'test')

    expect(results).toHaveLength(2)
    expect(results[0].title).toContain('Email: Email Match')
    expect(results[1].title).toContain('Event: Event Match')
  })
})
