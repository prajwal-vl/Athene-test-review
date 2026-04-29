import { describe, expect, it, vi } from 'vitest'

const insertMock = vi.fn(async () => ({ error: null }))
vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: {
    from: () => ({ insert: insertMock }),
  },
}))

describe('supabase auth scaffold', () => {
  it('writes hashed prompt in audit log payload', async () => {
    const { writeAuditLog } = await import('@/lib/supabase/audit')

    await writeAuditLog({
      threadId: 'thread-1',
      userId: 'user-1',
      orgId: 'org-1',
      queriedDeptIds: ['dept-a'],
      chunkIds: ['chunk-1'],
      prompt: 'show me sales pipeline',
      grantId: 'grant-1',
    })

    expect(insertMock).toHaveBeenCalledTimes(1)
    const payload = insertMock.mock.calls[0][0]
    expect(payload.query).not.toBe('show me sales pipeline')
    expect(payload.query).toHaveLength(64)
  })
})
