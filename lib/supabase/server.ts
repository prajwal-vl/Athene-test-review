import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { checkEnv } from '@/lib/config/env-check'

// Validate required environment variables once at module load time.
// This runs on the first import of this module (server-side only).
if (typeof window === 'undefined') {
  try {
    checkEnv()
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err))
    // Re-throw in production so a misconfigured deployment fails fast.
    if (process.env.NODE_ENV === 'production') throw err
  }
}

let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (_client) return _client

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  _client = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return _client
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getClient() as unknown as Record<string | symbol, unknown>)[prop]
  },
})

/** @deprecated Use supabaseAdmin instead. */
export const supabase = supabaseAdmin
