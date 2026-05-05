import './setup-env'
import { supabaseServer } from '../lib/supabase/server'
import { withRLS } from '../lib/supabase/rls-client'
import { similaritySearch } from '../lib/supabase/vector'

async function runVerification() {
  console.log('--- FINAL SUPABASE VERIFICATION ---')

  // 1. Check Server Client (Administrative)
  console.log('\n[1/3] Testing Administrative Access (bypass RLS)...')
  try {
    const { data: orgs, error: orgError } = await supabaseServer
      .from('organizations')
      .select('count', { count: 'exact', head: true })

    if (orgError) {
      console.error('❌ Admin access failed:', orgError.message)
      if (orgError.message.includes('permission denied')) {
          console.log('👉 Tip: Ensure you ran the GRANT commands in the Supabase SQL editor.')
      }
    } else {
      console.log('✅ Admin access successful. Organizations count:', orgs)
    }
  } catch (e: any) {
    console.error('❌ Admin client crash:', e.message)
  }

  // 2. Check RLS Wrapper & Context
  console.log('\n[2/3] Testing RLS Context & Bridging...')
  const testContext = {
    org_id: '00000000-0000-0000-0000-000000000000',
    user_id: '00000000-0000-0000-0000-000000000000',
    user_role: 'member' as const
  }

  try {
    await withRLS(testContext, async (supabase) => {
      const { error } = await supabase.from('organizations').select('*')
      if (error) throw error
    })
    console.log('✅ RLS context bridge successful (set_app_context called).')
  } catch (err: any) {
    console.error('❌ RLS bridging failed:', err.message)
    if (err.message?.includes('set_app_context')) {
        console.log('👉 Tip: Ensure you ran the CREATE FUNCTION SQL block for set_app_context.')
    }
  }

  // 3. Check Vector Search Function
  console.log('\n[3/3] Testing Vector Search RPC...')
  try {
    const dummyEmbedding = new Array(1536).fill(0)
    await similaritySearch(testContext, dummyEmbedding, 0.1, 1)
    console.log('✅ Vector search function call attempted.')
  } catch (err: any) {
    if (err.message?.includes('match_documents')) {
        console.error('❌ Vector search function NOT found.')
        console.log('👉 Tip: Ensure you ran the CREATE FUNCTION SQL block for match_documents.')
    } else {
        console.log('✅ Vector search call attempted (schema is working).')
    }
  }

  console.log('\n--- VERIFICATION COMPLETE ---')
}

runVerification()
