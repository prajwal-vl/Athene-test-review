// app/api/worker/morning-briefing/route.ts
//
// QStash worker: synthesises a morning briefing from pre-collected provider
// summaries and persists the result to the conversations table.
//
// Security: QStash signature is verified before any work is performed.
// Called by the scheduler or a manual trigger via POST with:
//   { org_id, user_id, inputs: { ... provider summaries ... } }

import { NextResponse } from 'next/server'
import { verifyQStashSignature } from '@/lib/qstash/verify'
import { supabaseAdmin } from '@/lib/supabase/server'
import { logger } from '@/lib/logger'

export const runtime = 'nodejs'

export async function POST(req: Request): Promise<Response> {
  // 1. Read body as text so we can pass it to the signature verifier
  const raw = await req.text()

  // 2. Verify QStash signature — construct a fresh Request from the raw body
  //    because verifyQStashSignature calls req.clone().text() internally.
  const cloned = new Request(req.url, {
    method: req.method,
    headers: req.headers,
    body: raw,
  })
  const isValid = await verifyQStashSignature(cloned)
  if (!isValid) {
    return NextResponse.json({ error: 'Invalid QStash signature' }, { status: 401 })
  }

  let body: { org_id?: string; user_id?: string; inputs?: Record<string, unknown> }
  try {
    body = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const orgId  = String(body.org_id  ?? '')
  const userId = String(body.user_id ?? '')
  if (!orgId || !userId) {
    return NextResponse.json({ error: 'org_id and user_id are required' }, { status: 400 })
  }

  try {
    // 3. Resolve BYOK key via get_decrypted_llm_key RPC (matches llm-factory.ts pattern).
    //    Falls back to platform env key if no BYOK key is configured.
    let apiKey: string | undefined
    let aiProvider = 'openai'

    const encryptionSecret = process.env.ENCRYPTION_SECRET || process.env.KMS_SECRET
    if (encryptionSecret) {
      const { data: byokRows } = await supabaseAdmin.rpc('get_decrypted_llm_key', {
        p_org_id: orgId,
        p_kms_key: encryptionSecret,
      })
      const byok = (byokRows as any[])?.[0]
      if (byok?.plaintext) {
        apiKey = byok.plaintext as string
        aiProvider = (byok.provider as string) || 'openai'
      }
    }

    // Fall back to platform keys in the same priority order as llm-factory.ts
    if (!apiKey) {
      if (process.env.ANTHROPIC_API_KEY) {
        apiKey = process.env.ANTHROPIC_API_KEY
        aiProvider = 'anthropic'
      } else if (process.env.OPENAI_API_KEY) {
        apiKey = process.env.OPENAI_API_KEY
        aiProvider = 'openai'
      } else if (process.env.GOOGLE_API_KEY) {
        apiKey = process.env.GOOGLE_API_KEY
        aiProvider = 'google'
      }
    }

    if (!apiKey) {
      throw new Error('No LLM API key available for this organisation')
    }

    // 4. Call OpenAI-compatible chat completions endpoint.
    //    For simplicity this worker always uses the OpenAI API format regardless
    //    of provider — Anthropic / Google can be added in ATH-22 if needed.
    const modelName = aiProvider === 'anthropic' ? 'claude-haiku-4-5' : 'gpt-4o-mini'
    const apiUrl    = aiProvider === 'anthropic'
      ? 'https://api.anthropic.com/v1/messages'
      : 'https://api.openai.com/v1/chat/completions'

    const aiRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(aiProvider === 'anthropic'
          ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
          : { Authorization: `Bearer ${apiKey}` }),
      },
      body: JSON.stringify(
        aiProvider === 'anthropic'
          ? {
              model: modelName,
              max_tokens: 600,
              system:
                'Create a concise morning briefing only from the provider summaries supplied. ' +
                'Do not invent or assume missing items. Use bullet points. Keep it under 300 words.',
              messages: [{ role: 'user', content: JSON.stringify(body.inputs ?? {}) }],
            }
          : {
              model: modelName,
              temperature: 0.3,
              max_tokens: 600,
              messages: [
                {
                  role: 'system',
                  content:
                    'Create a concise morning briefing only from the provider summaries supplied. ' +
                    'Do not invent or assume missing items. Use bullet points. Keep it under 300 words.',
                },
                { role: 'user', content: JSON.stringify(body.inputs ?? {}) },
              ],
            }
      ),
    })

    if (!aiRes.ok) {
      const text = await aiRes.text().catch(() => 'unknown error')
      throw new Error(`LLM API error ${aiRes.status}: ${text}`)
    }

    const aiJson = await aiRes.json()
    const briefingText: string =
      aiProvider === 'anthropic'
        ? (aiJson.content?.[0]?.text ?? '')
        : (aiJson.choices?.[0]?.message?.content ?? '')

    // 5. Persist the briefing to conversations.
    //    Column list matches apps/web/supabase/migrations/001_schema.sql exactly.
    const threadId = crypto.randomUUID()
    const { error: dbError } = await supabaseAdmin.from('conversations').insert({
      thread_id:    threadId,
      org_id:       orgId,
      user_id:      userId,
      prompt:       'morning briefing',
      final_answer: briefingText,
      run_status:   'complete',
      completed_at: new Date().toISOString(),
    })

    if (dbError) throw dbError

    logger.info({ orgId, userId, threadId }, '[morning-briefing] Briefing generated')
    return NextResponse.json({ ok: true, thread_id: threadId })

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    logger.error({ orgId, userId, err: message }, '[morning-briefing] Worker error')
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

