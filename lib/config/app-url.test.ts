import { describe, expect, it } from 'vitest'
import { getAppBaseUrl } from '@/lib/config/app-url'

describe('getAppBaseUrl', () => {
  it('returns the normalized origin', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://example.com/path'
    expect(getAppBaseUrl()).toBe('https://example.com')
  })

  it('throws when missing', () => {
    delete process.env.NEXT_PUBLIC_APP_URL
    expect(() => getAppBaseUrl()).toThrow('NEXT_PUBLIC_APP_URL is required')
  })
})
