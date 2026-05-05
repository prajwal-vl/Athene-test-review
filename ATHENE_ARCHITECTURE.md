AtheneAI/
│
├── app/
│   ├── api/
│   │   ├── agent/
│   │   │   ├── route.ts                  # POST: start run, SSE stream
│   │   │   ├── resume/route.ts           # POST: QStash resume webhook
│   │   │   ├── approve/route.ts          # POST: HITL approve/reject
│   │   │   └── status/route.ts           # GET: poll run_status
│   │   ├── worker/
│   │   │   ├── nango-fetch/route.ts      # POST: background index job
│   │   │   ├── morning-briefing/route.ts # POST: cron briefing job
│   │   │   └── index-delta/route.ts      # POST: incremental delta sync
│   │   └── admin/
│   │       ├── bi-grants/route.ts        # POST/DELETE: BI access grants
│   │       ├── keys/route.ts             # POST/DELETE: BYOK keys
│   │       ├── integrations/route.ts     # POST/DELETE/GET: data sources
│   │       ├── automations/route.ts      # POST/DELETE: scheduled automations
│   │       └── audit-log/route.ts        # GET: cross-dept audit log
│   │
│   └── (dashboard)/
│       ├── chat/page.tsx
│       ├── insights/page.tsx             # BI analyst cross-dept view
│       ├── briefing/page.tsx
│       └── admin/
│           ├── users/page.tsx
│           ├── integrations/page.tsx
│           ├── keys/page.tsx
│           ├── grants/page.tsx
│           └── audit/page.tsx
│
├── lib/
│   ├── auth/
│   │   ├── clerk.ts                      # verifyClerkJWT, extractOrgClaims
│   │   └── rbac.ts                       # resolveUserAccess (+ Redis cache)
│   │
│   ├── langgraph/
│   │   ├── state.ts                      # AtheneState type
│   │   ├── graph.ts                      # StateGraph assembly
│   │   ├── checkpointer.ts               # SupabaseCheckpointer
│   │   ├── llm-factory.ts                # resolveModelClient (BYOK + tiers)
│   │   ├── agents/
│   │   │   └── registry.ts               # AgentDefinition catalog
│   │   ├── nodes/
│   │   │   ├── supervisor.ts
│   │   │   ├── retrieval-agent.ts
│   │   │   ├── cross-dept-retrieval.ts
│   │   │   ├── email-agent.ts
│   │   │   ├── calendar-agent.ts
│   │   │   ├── report-agent.ts
│   │   │   ├── synthesis-agent.ts
│   │   │   └── async-tool-node.ts
│   │   └── tools/
│   │       ├── registry.ts
│   │       ├── vector-search.ts          # sync, RLS-aware
│   │       ├── live-doc-fetch.ts         # ephemeral content fetcher
│   │       ├── live-search.ts            # Mode B pure live search
│   │       ├── email-read.ts
│   │       ├── email-draft.ts
│   │       ├── email-send.ts             # requiresApproval: true
│   │       ├── calendar-read.ts
│   │       ├── calendar-create.ts        # requiresApproval: true
│   │       ├── find-free-slot.ts
│   │       ├── nango-sharepoint.ts       # async
│   │       ├── nango-gdrive.ts           # async
│   │       ├── nango-jira.ts             # async
│   │       ├── nango-confluence.ts       # async
│   │       └── schema-normalizer.ts      # adapted from OpenClaw pi-tools.schema.ts
│   │
│   ├── supabase/
│   │   ├── server.ts                     # service role client (writes only)
│   │   ├── rls-client.ts                 # RLS client + BEGIN/SET LOCAL/COMMIT wrapper
│   │   ├── vector.ts                     # similaritySearch, crossDeptSearch
│   │   └── audit.ts                      # writeAuditLog
│   │
│   ├── nango/
│   │   └── client.ts                     # getConnectionToken, listConnections
│   │
│   ├── qstash/
│   │   ├── client.ts                     # dispatch + per-org throttle
│   │   └── verify.ts                     # verifyQStashSignature
│   │
│   ├── redis/
│   │   └── client.ts                     # Upstash Redis: cache + concurrency counters
│   │
│   └── integrations/
│       ├── microsoft/
│       │   ├── graph-client.ts
│       │   ├── sharepoint-fetcher.ts
│       │   ├── outlook-fetcher.ts
│       │   └── calendar-fetcher.ts
│       └── google/
│           ├── drive-fetcher.ts
│           ├── gmail-fetcher.ts
│           └── calendar-fetcher.ts
│
├── proxy.ts                              # Clerk auth on /api/* and /(dashboard)/*
│
└── supabase/
    └── migrations/
        ├── 001_schema.sql
        ├── 002_rls_policies.sql
        ├── 003_indexes.sql
        ├── 004_vector_indexes.sql        # hnsw on document_embeddings.embedding
        ├── 005_org_api_keys.sql          # BYOK + pgcrypto
        ├── 006_org_integrations.sql
        └── 007_user_automations.sql
```

