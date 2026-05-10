import { auth } from '@clerk/nextjs/server'
import { NextRequest, NextResponse } from 'next/server'
import { mapRole } from '@/lib/auth/clerk'
import { supabaseAdmin } from '@/lib/supabase/server'
import { invalidateByokCache } from '@/lib/langgraph/llm-factory'

export async function GET() {
  const { userId, orgId, orgRole } = await auth()
  if (!userId || !orgId) return new NextResponse('Unauthorized', { status: 401 })

  const role = mapRole(orgRole ?? undefined)
  if (role !== 'admin') return new NextResponse('Forbidden', { status: 403 })

  // Return key metadata only — never the plaintext key
  const { data, error } = await supabaseAdmin
    .from('llm_keys')
    .select('id, provider, created_at, updated_at')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[keys] Failed to fetch:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ keys: data ?? [] })
}

export async function DELETE(req: NextRequest) {
  const { userId, orgId, orgRole } = await auth()
  if (!userId || !orgId) return new NextResponse('Unauthorized', { status: 401 })

  const role = mapRole(orgRole ?? undefined)
  if (role !== 'admin') return new NextResponse('Forbidden', { status: 403 })

  let body: { id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!body.id) return NextResponse.json({ error: 'Missing key id' }, { status: 400 })

  const { error } = await supabaseAdmin
    .from('llm_keys')
    .delete()
    .eq('id', body.id)
    .eq('org_id', orgId)

  if (error) {
    console.error('[keys] Failed to delete:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  invalidateByokCache(orgId)
  return NextResponse.json({ deleted: true })
}
