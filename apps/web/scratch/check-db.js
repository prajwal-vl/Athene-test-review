
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: './apps/web/.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkSchema() {
  console.log('Checking llm_keys table...');
  const { data: tableData, error: tableError } = await supabase
    .from('llm_keys')
    .select('count', { count: 'exact', head: true });
  
  if (tableError) {
    console.error('Error checking llm_keys table:', tableError.message);
  } else {
    console.log('llm_keys table exists.');
  }

  console.log('Checking get_decrypted_llm_key RPC...');
  const { data: rpcData, error: rpcError } = await supabase.rpc('get_decrypted_llm_key', {
    p_org_id: '00000000-0000-0000-0000-000000000000',
    p_kms_key: 'test'
  });

  if (rpcError && rpcError.message.includes('function does not exist')) {
    console.error('RPC get_decrypted_llm_key DOES NOT exist.');
  } else {
    console.log('RPC check complete (or failed for other reasons).', rpcError?.message);
  }
}

checkSchema();
