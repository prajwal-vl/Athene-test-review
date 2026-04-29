
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function test() {
  const { data, error } = await supabase.rpc('app_setting', { key: 'test' })
  console.log('app_setting call:', { data, error })

  const { data: raw, error: rawError } = await supabase.from('organizations').select('*')
  console.log('raw select on organizations:', { data: raw, error: rawError })
}
test()
