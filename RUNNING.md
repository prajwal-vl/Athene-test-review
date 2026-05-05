# Running Athene AI Locally

This repository now contains the Athene AI SaaS build under `apps/web`.

## Prerequisites

- Node.js 18.17 or newer
- pnpm 10 or newer
- Supabase project with the migrations in `apps/web/supabase/migrations`
- Clerk application with organizations enabled
- Upstash Redis
- Nango, QStash, and OpenAI keys for the full agent/indexing flow

## 1. Install Dependencies

```bash
cd apps/web
pnpm install
```

## 2. Configure Environment Variables

Create `apps/web/.env.local`:

```bash
cp .env.example .env.local
```

Fill these required values:

```env
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/chat
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/chat

NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DATABASE_URL=

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

NANGO_SECRET_KEY=
NEXT_PUBLIC_NANGO_PUBLIC_KEY=

QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=

OPENAI_API_KEY=
ENCRYPTION_SECRET=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

`ENCRYPTION_SECRET` must be a 32-character secret. `OPENAI_API_KEY` is used for embeddings with `text-embedding-3-small`.

## 3. Apply Supabase Migrations

From `apps/web`, apply the SQL files in order:

```bash
supabase db push
```

If you are not using the Supabase CLI, run the SQL files from `apps/web/supabase/migrations` in the Supabase SQL editor in filename order.

## 4. Run The App

```bash
cd apps/web
pnpm dev
```

Open:

```text
http://localhost:3000
```

## 5. Build Check

```bash
cd apps/web
pnpm build
```

## Notes

- `.env.local` is intentionally ignored by Git.
- The app will render with Clerk, Supabase, and Redis values present.
- Agent responses, document indexing, background jobs, and approval resume flows require the remaining Nango, QStash, OpenAI, and encryption values.
- Document content is not stored in Supabase. Indexing stores embeddings, metadata, source URL, visibility, and SHA-256 content hashes only.
