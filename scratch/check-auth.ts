
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function checkAuth() {
  console.log('--- Testing Service Role on auth.users ---')
  const { data, error } = await supabase.from('users').select('*').limit(1)
  console.log('auth.users check:', { data, error })
  
  // Try it via the correct schema if needed
  const { data: authData, error: authError } = await supabase.schema('auth').from('users').select('*').limit(1)
  console.log('auth schema check:', { authData, authError })
}
checkAuth()
