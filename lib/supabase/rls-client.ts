import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export function createRlsClient() {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function withRLS<T>(
  orgId: string,
  userId: string,
  fn: (client: SupabaseClient) => Promise<T>,
): Promise<T> {
  const client = createRlsClient()

  const { error } = await client.rpc('set_app_context', {
    p_org_id: orgId,
    p_user_id: userId,
  })

  if (error) {
    throw new Error(`Failed to set RLS context: ${error.message}`)
  }

  return fn(client)
}
