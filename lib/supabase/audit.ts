import { createHash } from 'crypto'
import { supabaseAdmin } from './server'

export interface CrossDeptAuditInput {
  threadId: string
  userId: string
  orgId: string
  queriedDeptIds: string[]
  chunkIds: string[]
  prompt: string
  grantId: string | null
}

export async function writeAuditLog(input: CrossDeptAuditInput): Promise<void> {
  const promptHash = createHash('sha256').update(input.prompt).digest('hex')

  const { error } = await supabaseAdmin.from('cross_dept_audit_log').insert({
    org_id: input.orgId,
    user_id: input.userId,
    query: promptHash,
    dept_ids: input.queriedDeptIds,
    reason: JSON.stringify({
      thread_id: input.threadId,
      chunk_ids: input.chunkIds,
      grant_id: input.grantId,
    }),
  })

  if (error) {
    throw new Error(`Failed to write audit log: ${error.message}`)
  }
}
