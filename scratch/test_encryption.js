const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: 'apps/web/.env.local' })

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function testEncryption() {
  console.log('Testing encryption RPC...')
  const { data, error } = await supabase.rpc('encrypt_key', { 
    p_key: 'test-key-123', 
    p_secret: process.env.ENCRYPTION_SECRET 
  })
  
  if (error) {
    console.error('Encryption failed:', error)
  } else {
    console.log('Encryption successful! Result:', data)
  }
}

testEncryption()
