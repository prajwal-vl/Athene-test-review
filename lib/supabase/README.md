# Supabase Dashboard Layer

Secure, multi-tenant Supabase database layer for Athene AI. 

## Clients

### 1. `supabaseServer` (Admin Client)
Located in `lib/supabase/server.ts`.
- **Purpose**: Background tasks, indexing, and administrative writes.
- **Bypasses RLS**: Yes.
- **Usage**:
  ```typescript
  import { supabaseServer } from '@/lib/supabase/server'
  await supabaseServer.from('organizations').insert(...)
  ```

### 2. `withRLS` (Scoped Client)
Located in `lib/supabase/rls-client.ts`.
- **Purpose**: User-facing queries requiring data isolation.
- **Enforces RLS**: Yes, by bridging Clerk session context to Postgres variables.
- **Usage**:
  ```typescript
  import { withRLS } from '@/lib/supabase/rls-client'
  
  const docs = await withRLS(context, async (supabase) => {
    return await supabase.from('documents').select('*')
  })
  ```

## RLS Security Model

Isolation is enforced via Postgres `current_setting` variables:
- `app.org_id`: Tenant ID.
- `app.user_id`: Member ID.
- `app.department_id`: User's assigned department.
- `app.user_role`: User privilege level (`member`, `super_user`, `admin`).

### Visibility Levels
- `org_wide`: Visible to everyone in the organization.
- `department`: Visible to department members + admins.
- `bi_accessible`: Visible to department members + super_users with a grant + admins.
- `confidential`: Visible only to department members + admins. **Grants cannot unlock this.**
- `restricted`: Visible only to the owner.

## Vector Search
Generic vector search is provided via `lib/supabase/vector.ts`:
```typescript
import { similaritySearch } from '@/lib/supabase/vector'
const results = await similaritySearch(context, embedding)
```
This is automatically filtered by the user's RLS permissions in the database.
