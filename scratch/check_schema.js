const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: 'apps/web/.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function checkSchema() {
  console.log('Checking tables...')
  const { data: tables, error } = await supabase.from('org_api_keys').select('id').limit(1)
  if (error) {
    console.log('org_api_keys table missing or inaccessible:', error.message)
    const { data: llmTables, error: llmError } = await supabase.from('llm_keys').select('id').limit(1)
    if (llmError) {
      console.log('llm_keys table also missing:', llmError.message)
    } else {
      console.log('llm_keys table exists!')
    }
  } else {
    console.log('org_api_keys table exists!')
  }
}

checkSchema()
