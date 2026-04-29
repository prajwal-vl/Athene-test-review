import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getConnectionToken } from '../client'
import { supabase } from '../../supabase/server'

const mockInstance = {
  getToken: vi.fn(),
  getConnection: vi.fn(),
  listConnections: vi.fn(),
  deleteConnection: vi.fn(),
}

vi.mock('@nangohq/node', () => {
  return {
    Nango: class {
      constructor() {
        return mockInstance
      }
    }
  }
})

vi.mock('../../supabase/server', () => ({
  supabase: {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(),
  } as any
}))

describe('nango client error handling', () => {
  let nangoMock: any

  beforeEach(() => {
    process.env.NANGO_SECRET_KEY = 'test-key'
    vi.clearAllMocks()
    nangoMock = mockInstance
    // Setup default mock implementation for getConnectionToken (it's aliased in the client)
    nangoMock.getConnectionToken = nangoMock.getToken;
  })

  it('should handle 401 Unauthorized as reconnection required', async () => {
    vi.mocked((supabase as any).maybeSingle).mockResolvedValue({ data: { id: 'm1' }, error: null } as any)
    vi.mocked(nangoMock.getToken).mockRejectedValue({
      response: { status: 401 },
      error: { code: 'invalid_credentials', message: 'Token expired' }
    })

    await expect(getConnectionToken('conn-1', 'provider', 'org-1')).rejects.toThrow('Connection expired or revoked')
  })

  it('should handle 403 Forbidden as access denied', async () => {
    vi.mocked((supabase as any).maybeSingle).mockResolvedValue({ data: { id: 'm1' }, error: null } as any)
    vi.mocked(nangoMock.getToken).mockRejectedValue({
      response: { status: 403 }
    })

    await expect(getConnectionToken('conn-1', 'provider', 'org-1')).rejects.toThrow('Access denied')
  })

  it('should handle 404 Not Found as connection missing', async () => {
    vi.mocked((supabase as any).maybeSingle).mockResolvedValue({ data: { id: 'm1' }, error: null } as any)
    vi.mocked(nangoMock.getToken).mockRejectedValue({
      response: { status: 404 }
    })

    await expect(getConnectionToken('conn-1', 'provider', 'org-1')).rejects.toThrow('Connection not found')
  })
})

