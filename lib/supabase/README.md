# Supabase client utilities

## Clients

- `server.ts` exports `supabaseAdmin` (service-role client, bypasses RLS).
- `rls-client.ts` exports `withRLS(orgId, userId, fn)` to set Postgres app context before running user-scoped queries.

## Vector helpers

- `similaritySearch(orgId, userId, queryEmbedding, topK, deptFilter?)`
- `crossDeptSearch(orgId, userId, queryEmbedding, topK, deptIds)`

Both run through `withRLS`, so table policies based on `current_setting('app.org_id')` and `current_setting('app.user_id')` apply.

## Audit log

- `writeAuditLog()` writes into `cross_dept_audit_log` using service role and stores SHA-256 hash of prompt (never raw prompt).

## Testing

- `lib/supabase/__tests__/rls.test.ts` validates hashed prompt behavior and serves as scaffold test for RBAC/RLS related utilities.
