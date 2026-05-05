 # AtheneAI Setup Guide 

Follow these straightforward steps to get the AtheneAI construction site running on your local machine. 
   
### 1. Pull the code
```bash  
git clone https://github.com/Athene-AI-Dev/at hene-app.git 
cd athene-app    
```  
     
### 2. Install and Initialize  
Install the foundation and prepare env ironment variables:  
```bash 
npm install
cp .env.example .env
```

### 3. Core Dependencies 
These packages provide the backbone for Auth, Database, and AI orchestration:
```bash 
# Core
npm install @clerk/nextjs @supabase/supabase-js @langchain/langgraph @langchain/core
# Integrations
npm install @nangohq/node @upstash/qstash @upstash/redis
# LLM providers
npm install @anthropic-ai/sdk openai @google/generative-ai
# Utils
npm install zod openai-tokenizer
# Dev
npm install -D @types/node prettier eslint-config-prettier
```

### 4. Install shadcn/ui
The design system is powered by shadcn/ui. The following components are already pre-installed:
```bash
npx shadcn@latest init
npx shadcn@latest add button card dialog dropdown-menu input label select textarea sonner sheet sidebar table tabs
```

### 5. Configured Tooling
The project is strictly configured for consistency:
- **tsconfig.json**: Strict mode enabled with `@/*` path aliases.
- **.prettierrc**: 2-space indent, single quotes, and trailing commas.
- **.eslintrc.json**: Extends `next/core-web-vitals` + `prettier`.

### 6. Environment Variables (.env.example)
Ensure your `.env` file includes the following keys:
```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ENCRYPTION_SECRET=

# Nango 
NANGO_SECRET_KEY=

# QStash
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=

# Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# LLM (platform fallback)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
```

### 7. Run locally
```bash
npm run dev
```
👉 Build verification: `npm run build`


## Supabase migrations (ATH-20)
Run in order on a fresh database:
1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_rls_policies.sql`
3. `supabase/migrations/003_indexes.sql`
4. `supabase/migrations/004_vector_indexes.sql`
5. `supabase/migrations/005_org_api_keys.sql`
6. `supabase/migrations/006_org_integrations.sql`
7. `supabase/migrations/007_user_automations.sql`

Then run policy checks with `supabase/tests/rls-policies.test.sql`.


## ATH-22 scaffold notes
- `middleware.ts` re-exports existing `proxy.ts` to support Next.js middleware entrypoint naming.
- `.env.example` contains full local bootstrap variables for Clerk, Supabase, Nango, QStash, Redis, and LLM providers.
- `openai-tokenizer` could not be installed from the registry in this environment; continue using `gpt-tokenizer` unless package availability changes.
