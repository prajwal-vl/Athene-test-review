import { vi, describe, it, expect, beforeEach } from 'vitest'
import { baseFetch, assertSafeMetadata } from '@/lib/integrations/base'

// ─── Mock global fetch ──────────────────────────────────────────────────────

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

// Suppress console.warn from retry logging during tests
vi.spyOn(console, 'warn').mockImplementation(() => {})

describe('baseFetch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns parsed JSON on a successful 200 response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ data: 'hello' }),
    })

    const result = await baseFetch('https://api.example.com/data')
    expect(result).toEqual({ data: 'hello' })
    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('retries on 429 and succeeds on next attempt', async () => {
    // First call: 429 rate limited (0s wait for fast test)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '0' }),
    })

    // Second call: success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ retried: true }),
    })

    const result = await baseFetch('https://api.example.com/data')
    expect(result).toEqual({ retried: true })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('retries on 500 with exponential backoff and succeeds', async () => {
    // First call: 500
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers(),
    })

    // Second call: success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ recovered: true }),
    })

    // maxRetries=1 so the backoff is just 500ms
    const result = await baseFetch('https://api.example.com/data', { maxRetries: 1 })
    expect(result).toEqual({ recovered: true })
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws after maxRetries on persistent 500', async () => {
    // Use maxRetries=1 so we only get 1 initial + 1 retry = 2 calls, ~500ms backoff
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers(),
    })
    // On the final attempt (attempt == maxRetries), 500 is not retried — it throws
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers(),
      text: () => Promise.resolve('Internal Server Error'),
    })

    await expect(
      baseFetch('https://api.example.com/fail', { maxRetries: 1 })
    ).rejects.toThrow('[baseFetch]')

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('throws immediately on 4xx errors (no retry)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      headers: new Headers(),
      text: () => Promise.resolve('Forbidden'),
    })

    await expect(
      baseFetch('https://api.example.com/forbidden')
    ).rejects.toThrow('403')

    expect(mockFetch).toHaveBeenCalledOnce()
  })

  it('handles 204 No Content gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      headers: new Headers(),
      text: () => Promise.resolve(''),
    })

    const result = await baseFetch('https://api.example.com/delete')
    expect(result).toBe('')
  })

  it('sends correct method, headers, and body', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: () => Promise.resolve({ created: true }),
    })

    await baseFetch('https://api.example.com/create', {
      method: 'POST',
      headers: { Authorization: 'Bearer token-123' },
      body: { name: 'test' },
    })

    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('https://api.example.com/create')
    expect(opts.method).toBe('POST')
    expect(opts.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer token-123',
    })
    expect(opts.body).toBe(JSON.stringify({ name: 'test' }))
  })

  it('throws after maxRetries on persistent 429', async () => {
    // maxRetries=1 → 2 total calls with 0s Retry-After
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '0' }),
    })
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      headers: new Headers({ 'Retry-After': '0' }),
    })

    await expect(
      baseFetch('https://api.example.com/limited', { maxRetries: 1 })
    ).rejects.toThrow('Max retries')

    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})

// ─── assertSafeMetadata Tests ────────────────────────────────────────────────

describe('assertSafeMetadata', () => {
  it('passes on safe metadata', () => {
    expect(() =>
      assertSafeMetadata({
        provider: 'google',
        resource_type: 'document',
        last_modified: '2026-04-21',
        author: 'Alice',
      })
    ).not.toThrow()
  })

  it('throws on forbidden key "content"', () => {
    expect(() =>
      assertSafeMetadata({
        provider: 'google',
        content: 'This should not be here!',
      })
    ).toThrow('Forbidden metadata key "content"')
  })

  it('throws on forbidden key "body"', () => {
    expect(() =>
      assertSafeMetadata({
        provider: 'google',
        body: '<html>...</html>',
      })
    ).toThrow('Forbidden metadata key "body"')
  })

  it('throws on forbidden key "html" (case-insensitive)', () => {
    expect(() =>
      assertSafeMetadata({
        provider: 'google',
        HTML: 'should fail too',
      })
    ).toThrow('Forbidden metadata key')
  })

  it('throws on forbidden key "raw"', () => {
    expect(() =>
      assertSafeMetadata({
        provider: 'slack',
        raw: 'raw body data...',
      })
    ).toThrow('Forbidden metadata key "raw"')
  })

  it('throws on forbidden key "plaintext"', () => {
    expect(() =>
      assertSafeMetadata({
        provider: 'microsoft',
        plaintext: 'extracted text',
      })
    ).toThrow('Forbidden metadata key "plaintext"')
  })
})
