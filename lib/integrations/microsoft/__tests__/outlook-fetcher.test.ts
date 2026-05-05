import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchUnreadEmails, fetchEmailBody, sendEmail } from '../outlook-fetcher'
import * as graphClient from '../graph-client'

vi.mock('../graph-client', () => ({
  graphFetch: vi.fn(),
}))

describe('outlook-fetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchUnreadEmails should call correct endpoint', async () => {
    vi.mocked(graphClient.graphFetch).mockResolvedValue({ value: [{ id: 'm1' }] })
    const emails = await fetchUnreadEmails('conn-123', 'org-123')
    expect(graphClient.graphFetch).toHaveBeenCalledWith('conn-123', 'org-123', expect.stringContaining('/me/messages?$filter=isRead eq false'))
    expect(emails).toHaveLength(1)
  })

  it('fetchEmailBody should return content', async () => {
    vi.mocked(graphClient.graphFetch).mockResolvedValue({ body: { content: 'hello world' } })
    const body = await fetchEmailBody('conn-123', 'org-123', 'm1')
    expect(body).toBe('hello world')
  })

  it('sendEmail should call sendMail endpoint with POST', async () => {
    await sendEmail('conn-123', 'org-123', {
      subject: 'hi',
      body: { contentType: 'Text', content: 'test' },
      toRecipients: [{ emailAddress: { address: 'test@example.com' } }]
    })
    expect(graphClient.graphFetch).toHaveBeenCalledWith('conn-123', 'org-123', '/me/sendMail', expect.objectContaining({
      method: 'POST',
      body: expect.stringContaining('hi')
    }))
  })
})
