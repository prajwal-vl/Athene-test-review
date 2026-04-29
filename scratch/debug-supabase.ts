
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const supabase = createClient(supabaseUrl!, supabaseServiceKey!)

async function debug() {
  console.log('--- Debugging Supabase Tables ---')
  
  // Try to get ANY table from public schema via postgres internal tables
  const { data, error } = await supabase.rpc('get_tables_status') // If we have a helper rpc
  
  if (error) {
     console.log('RPC check failed, trying raw query via select on organizations...')
     const { data: orgData, error: orgError } = await supabase.from('organizations').select('count', { count: 'exact' })
     if (orgError) {
       console.log('Error querying organizations:', orgError)
     } else {
       console.log('Organizations table exists. Count:', orgData)
     }

     const { data: deptData, error: deptError } = await supabase.from('departments').select('count', { count: 'exact' })
     if (deptError) {
       console.log('Error querying departments:', deptError)
     } else {
       console.log('Departments table exists.')
     }
  } else {
    console.log('Tables status:', data)
  }

  // Check if the schema is actually applied
  const { data: schemaCheck, error: schemaError } = await supabase.from('_prisma_migrations').select('*')
  if (schemaError) {
      console.log('No prisma migrations found (expected if using supabase migrations). Checking supabase migrations table if exists...')
  }

  // Let's check for extensions
  const { data: ext, error: extError } = await supabase.from('pg_extension').select('extname')
  if (extError) {
      console.log('Could not check extensions.')
  } else {
      console.log('Extensions:', ext.map(e => e.extname))
  }
}

debug()
