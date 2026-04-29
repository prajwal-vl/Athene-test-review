import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchEvents, createEvent, findFreeSlots } from '../calendar-fetcher'
import * as graphClient from '../graph-client'

vi.mock('../graph-client', () => ({
  graphFetch: vi.fn(),
}))

describe('calendar-fetcher', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fetchEvents should call correct endpoint with ISO strings', async () => {
    const start = new Date('2024-01-01T00:00:00Z')
    const end = new Date('2024-01-02T00:00:00Z')
    await fetchEvents('conn-123', 'org-123', start, end)
    expect(graphClient.graphFetch).toHaveBeenCalledWith(
      'conn-123',
      'org-123',
      expect.stringContaining('/me/calendarView?startDateTime=2024-01-01T00:00:00.000Z&endDateTime=2024-01-02T00:00:00.000Z')
    )
  })

  it('createEvent should call events endpoint with POST', async () => {
    const event = {
      subject: 'Meeting',
      start: { dateTime: '2024-01-01T10:00:00', timeZone: 'UTC' },
      end: { dateTime: '2024-01-01T11:00:00', timeZone: 'UTC' }
    }
    await createEvent('conn-123', 'org-123', event)
    expect(graphClient.graphFetch).toHaveBeenCalledWith('conn-123', 'org-123', '/me/events', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify(event)
    }))
  })

  it('findFreeSlots should format duration as ISO 8601 PTnM', async () => {
    await findFreeSlots('conn-123', 'org-123', ['test@example.com'], 45)
    expect(graphClient.graphFetch).toHaveBeenCalledWith('conn-123', 'org-123', '/me/findMeetingTimes', expect.objectContaining({
      body: expect.stringContaining('PT45M')
    }))
  })
})
