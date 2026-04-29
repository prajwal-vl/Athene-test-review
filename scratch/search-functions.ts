
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function findFunctions() {
  const { data, error } = await supabase.from('pg_proc').select('proname').ilike('proname', '%context%')
  console.log('Functions with "context":', data)
  
  const { data: allFuncs, error: allErr } = await supabase.from('pg_proc').select('proname').limit(100)
   console.log('Some functions:', allFuncs?.map(f => f.proname))
}
findFunctions()
