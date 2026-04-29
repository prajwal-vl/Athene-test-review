
import './setup-env'
import { supabaseServer } from '../lib/supabase/server'
import { withRLS } from '../lib/supabase/rls-client'
import { v4 as uuidv4 } from 'uuid'

async function runRLSTests() {
    console.log('--- RUNNING 7 RLS TEST SCENARIOS ---\n')

    // Parameters for this run
    const suffix = uuidv4().slice(0, 8)
    const orgIdA = uuidv4()
    const orgIdB = uuidv4()
    const deptIdA = uuidv4()
    const deptIdB = uuidv4()
    const userIdA = uuidv4()
    const userIdB = uuidv4()
    const superUserId = uuidv4()

    console.log(`Seeding test data (suffix: ${suffix})...`)
    
    // Create Orgs
    const seed1 = await supabaseServer.from('organizations').insert([
        { id: orgIdA, clerk_org_id: `org_A_${suffix}`, name: 'Org A', slug: `org-a-${suffix}` },
        { id: orgIdB, clerk_org_id: `org_B_${suffix}`, name: 'Org B', slug: `org-b-${suffix}` }
    ])
    if (seed1.error) throw new Error('Seed Orgs Error: ' + seed1.error.message)

    // Create Depts
    const seed2 = await supabaseServer.from('departments').insert([
        { id: deptIdA, org_id: orgIdA, name: 'Dept A', slug: 'dept-a' },
        { id: deptIdB, org_id: orgIdA, name: 'Dept B', slug: 'dept-b' }
    ])
    if (seed2.error) throw new Error('Seed Depts Error: ' + seed2.error.message)

    // Create Users
    const seed3 = await supabaseServer.from('org_members').insert([
        { id: userIdA, org_id: orgIdA, clerk_user_id: `user_A_${suffix}`, email: `a_${suffix}@example.com`, department_id: deptIdA, role: 'member' },
        { id: userIdB, org_id: orgIdA, clerk_user_id: `user_B_${suffix}`, email: `b_${suffix}@example.com`, department_id: deptIdB, role: 'member' },
        { id: superUserId, org_id: orgIdA, clerk_user_id: `user_S_${suffix}`, email: `s_${suffix}@example.com`, role: 'super_user' }
    ])
    if (seed3.error) throw new Error('Seed Members Error: ' + seed3.error.message)

    // Dummy connection for docs
    const connId = uuidv4()
    const seed4 = await supabaseServer.from('connections').insert([{
        id: connId, org_id: orgIdA, nango_connection_id: `fake_${suffix}`, provider: 'google', source_type: 'gdrive', scope: 'org'
    }])
    if (seed4.error) throw new Error('Seed Conn Error: ' + seed4.error.message)

    // Create Docs
    const seed5 = await supabaseServer.from('documents').insert([
        { org_id: orgIdA, connection_id: connId, external_id: `docA_dept_${suffix}`, title: 'Dept Secret', department_id: deptIdA, visibility: 'department', source_type: 'gdrive' },
        { org_id: orgIdA, connection_id: connId, external_id: `docA_conf_${suffix}`, title: 'Dept Confid', department_id: deptIdA, visibility: 'confidential', source_type: 'gdrive' },
        { org_id: orgIdA, connection_id: connId, external_id: `docA_rest_${suffix}`, title: 'User A Restr', owner_user_id: userIdA, visibility: 'restricted', source_type: 'gdrive' },
        { org_id: orgIdB, connection_id: connId, external_id: `docB_org_${suffix}`, title: 'Org B Doc', visibility: 'org_wide', source_type: 'gdrive' }
    ])
    if (seed5.error) throw new Error('Seed Docs Error: ' + seed5.error.message)

    const runScenario = async (name: string, context: any, expectedCount: number) => {
        try {
            await supabaseServer.rpc('debug_context', {}) // create the function
            const count = await withRLS(context, async (supabase) => {
                const { data: dbCtx, error: ctxErr } = await supabase.rpc('debug_context')
                if (!ctxErr) console.log(`[${name}] DB Context Check:`, dbCtx)

                const res = await supabase.from('documents').select('*', { count: 'exact', head: true }).eq('org_id', context.org_id)
                if (res.error) console.error(`[${name}] DB Query Error:`, res.error.message)
                return res.count || 0
            })
            if (count === expectedCount) {
                console.log(`✅ ${name}: PASSED (Found ${count})`)
            } else {
                console.error(`❌ ${name}: FAILED (Expected ${expectedCount}, Found ${count})`)
            }
        } catch (e: any) {
            console.error(`❌ ${name}: ERROR - ${e.message}`)
        }
    }

    // 1. Admin sees everything in Org
    await runScenario('Scenario 1: Admin sees all in Org', { org_id: orgIdA, user_id: userIdA, user_role: 'admin' }, 3)

    // 2. Org Isolation
    await runScenario('Scenario 2: Org Isolation (User B in Org B sees 0 from Org A)', { org_id: orgIdB, user_id: uuidv4(), user_role: 'member' }, 1) // Should see org_wide docB_org

    // 3. Member sees own dept (+ their own restricted doc)
    await runScenario('Scenario 3: Member sees own dept', { org_id: orgIdA, user_id: userIdA, department_id: deptIdA, user_role: 'member' }, 3) 

    // 4. Member cannot see other dept
    await runScenario('Scenario 4: Member cannot see other dept', { org_id: orgIdA, user_id: userIdB, department_id: deptIdB, user_role: 'member' }, 0)

    // 5. Super User with Grant sees cross-dept
    // Add grant
    await supabaseServer.from('access_grants').insert([{
        org_id: orgIdA, user_id: superUserId, scope_type: 'department', scope_id: deptIdA, granted_by: superUserId
    }])
    
    await runScenario('Scenario 5: Super User with Grant (sees docA_dept but NOT docA_conf)', { org_id: orgIdA, user_id: superUserId, user_role: 'super_user' }, 1) 

    // 7. Restricted doc isolated (userIdB acting as deptA member sees dept docs but NOT restricted)
    await runScenario('Scenario 7: Restricted isolated', { org_id: orgIdA, user_id: userIdB, department_id: deptIdA, user_role: 'member' }, 2) 

    console.log('\n--- TESTS COMPLETED ---')
}

runRLSTests()
