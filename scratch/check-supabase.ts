
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import path from 'path'

// Load env vars
dotenv.config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkSupabase() {
  console.log('--- Supabase Connection & Schema Check ---\n')

  // 1. Check Tables
  console.log('Checking Tables...')
  const { data: tables, error: tableError } = await supabase
    .from('pg_tables')
    .select('tablename')
    .eq('schemaname', 'public')

  if (tableError) {
    // If pg_tables is restricted, try direct head requests
    console.log('Restricted access to pg_tables. Checking via direct queries...')
    const tableList = [
      'organizations', 'departments', 'org_members', 'access_grants', 
      'connections', 'documents', 'document_embeddings', 'kg_nodes', 
      'kg_edges', 'threads', 'thread_checkpoints', 'hitl_decisions', 
      'grant_access_audit', 'admin_actions'
    ]
    for (const table of tableList) {
      const { error } = await supabase.from(table).select('*', { count: 'exact', head: true })
      if (error) {
        console.log(`❌ Table ${table} NOT found or error:`, error.message)
      } else {
        console.log(`✅ Table ${table} exists.`)
      }
    }
  } else {
    const existingTables = tables.map(t => t.tablename)
    const expectedTables = [
      'organizations', 'departments', 'org_members', 'access_grants', 
      'connections', 'documents', 'document_embeddings', 'kg_nodes', 
      'kg_edges', 'threads', 'thread_checkpoints', 'hitl_decisions', 
      'grant_access_audit', 'admin_actions'
    ]
    expectedTables.forEach(table => {
      if (existingTables.includes(table)) {
        console.log(`✅ Table ${table} exists.`)
      } else {
        console.log(`❌ Table ${table} is MISSING.`)
      }
    })
  }

  // 2. Check Custom Types (via RPC or direct query)
  console.log('\nChecking Custom Types...')
  const { data: types, error: typeError } = await supabase.rpc('get_custom_types') // Note: if this RPC doesn't exist, we can't easily check via JS client without direct SQL
  
  if (typeError) {
    console.log('Unable to check custom types via RPC. Manually checking specific values...')
    // We can try to insert a dummy value with a type cast to see if it works, or just query pg_type if we have permissions
    const { data: pgTypes, error: pgTypeError } = await supabase.from('pg_type').select('typname').in('typname', ['user_role', 'visibility_level', 'grant_scope'])
    if (pgTypeError) {
       console.log('Could not query pg_type. Standard for non-admin keys.')
    } else if (pgTypes) {
       pgTypes.forEach(t => console.log(`✅ Type ${t.typname} exists.`))
    }
  }

  // 3. Check Helper Functions
  console.log('\nChecking Helper Functions...')
  const { error: funcError } = await supabase.rpc('app_setting', { key: 'org_id' })
  if (funcError && funcError.message.includes('function app_setting(text) does not exist')) {
    console.log('❌ Function app_setting(text) NOT found.')
  } else {
    console.log('✅ Function app_setting(text) exists.')
  }

  const { error: grantsError } = await supabase.rpc('has_session_grants')
  if (grantsError && grantsError.message.includes('function has_session_grants() does not exist')) {
    console.log('❌ Function has_session_grants() NOT found.')
  } else {
    console.log('✅ Function has_session_grants() exists.')
  }

  console.log('\n--- Check Complete ---')
}

checkSupabase()
