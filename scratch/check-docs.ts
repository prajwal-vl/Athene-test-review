
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function checkDocs() {
  const { data, error, count } = await supabase.from('documents').select('*', { count: 'exact', head: true })
  console.log('documents check:', { data, error, count })
  
  const { data: org, error: orgErr } = await supabase.from('organizations').select('*').limit(1)
  console.log('organizations check:', { org, orgErr })
}
checkDocs()
