# Nango Integration Guide

This document covers how to configure Nango for Athene, create the required
integrations in the Nango dashboard, and wire them into the application.

---

## 1. Prerequisites

| Variable | Where to set |
|---|---|
| `NANGO_SECRET_KEY` | `.env.local` — server-side only, never expose to browser |
| `NANGO_PUBLIC_KEY` | `.env.local` — used by the frontend `@nangohq/frontend` SDK |
| `NEXT_PUBLIC_NANGO_PUBLIC_KEY` | Same value exposed to the client via `NEXT_PUBLIC_` prefix |

Both keys are found in **Nango Dashboard → Project Settings → API Keys**.

---

## 2. `nango.yaml` — Integration definitions

Nango uses a `nango.yaml` file (placed in the project root or `nango/` folder)
to declare which integrations exist, the OAuth scopes they need, and any syncs
or actions to run.

### Minimal example for Athene

```yaml
integrations:
  # ── Google (covers Gmail, Drive, Calendar via a single OAuth flow) ──────────
  google:
    provider: google
    scopes:
      - https://www.googleapis.com/auth/gmail.readonly
      - https://www.googleapis.com/auth/drive.readonly
      - https://www.googleapis.com/auth/calendar.readonly

  # ── Microsoft 365 (Outlook, OneDrive, SharePoint, Calendar) ─────────────────
  microsoft:
    provider: microsoft
    scopes:
      - Mail.Read
      - Files.Read.All
      - Sites.Read.All
      - Calendars.Read

  # ── Slack ───────────────────────────────────────────────────────────────────
  slack:
    provider: slack
    scopes:
      - channels:history
      - channels:read

  # ── HubSpot ─────────────────────────────────────────────────────────────────
  hubspot:
    provider: hubspot
    scopes:
      - crm.objects.contacts.read

  # ── Notion ──────────────────────────────────────────────────────────────────
  notion:
    provider: notion
    scopes: []          # Notion uses page-level permissions, not OAuth scopes

  # ── Jira ────────────────────────────────────────────────────────────────────
  jira:
    provider: atlassian
    scopes:
      - read:jira-work

  # ── Confluence ──────────────────────────────────────────────────────────────
  confluence:
    provider: atlassian
    scopes:
      - read:confluence-content.summary

  # ── Salesforce ──────────────────────────────────────────────────────────────
  salesforce:
    provider: salesforce
    scopes:
      - api
      - refresh_token
      - offline_access

  # ── Snowflake ───────────────────────────────────────────────────────────────
  snowflake:
    provider: snowflake
    scopes: []

  # ── GitHub ──────────────────────────────────────────────────────────────────
  github:
    provider: github
    scopes:
      - repo
      - read:user

  # ── Linear ──────────────────────────────────────────────────────────────────
  linear:
    provider: linear
    scopes:
      - read

  # ── Zendesk ─────────────────────────────────────────────────────────────────
  zendesk:
    provider: zendesk
    scopes:
      - tickets:read
      - help_center:read
```

> **Note on Google fan-out:** A single `google` OAuth connection covers Gmail,
> Drive, and Calendar. When a user connects Google, the sync route dispatches
> three independent QStash jobs: `google-drive`, `gmail`, and `google-calendar`.
> These map to the fetchers in `app/api/worker/nango-fetch/route.ts`. The
> `nangoIntegrationId` in `providers.ts` stays `'google'` because that is the
> single Nango integration key used to obtain the token.

---

## 3. Nango Dashboard Setup

### 3.1 Create an account

1. Go to [https://app.nango.dev](https://app.nango.dev) and sign in.
2. Create a new **Project** (e.g. `athene-production`).

### 3.2 Configure OAuth apps

For each provider you plan to enable, create an OAuth app in that provider's
developer console and enter the credentials in Nango:

| Provider | Where to create credentials |
|---|---|
| Google | [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials) |
| Microsoft | [Azure Portal → App registrations](https://portal.azure.com/#view/Microsoft_AAD_IAM/ActiveDirectoryMenuBlade/~/RegisteredApps) |
| Slack | [api.slack.com/apps](https://api.slack.com/apps) |
| HubSpot | [HubSpot Developer Portal](https://developers.hubspot.com/) |
| GitHub | GitHub → Settings → Developer settings → OAuth Apps |
| Salesforce | Salesforce Setup → App Manager → New Connected App |

In each Nango integration card, set:
- **Client ID** and **Client Secret** from the provider's console.
- **Scopes** — must match what is listed in `nango.yaml`.
- **Redirect URL** — Nango supplies this; copy it into the provider's OAuth app.

### 3.3 Obtain API keys

In **Project Settings → API Keys**:
- Copy **Secret Key** → `NANGO_SECRET_KEY` in `.env.local`
- Copy **Public Key** → `NANGO_PUBLIC_KEY` / `NEXT_PUBLIC_NANGO_PUBLIC_KEY` in `.env.local`

---

## 4. Connection ID convention

Athene uses the pattern `{orgId}_{providerKey}` as the `connectionId` when
initiating the OAuth flow from the frontend. This makes it easy to look up
which org owns a connection without querying Nango metadata.

```ts
// Example: frontend initiating a Google connection
const connectionId = `${orgId}_google`
nango.auth('google', connectionId)
```

After a successful auth, the callback saves the mapping to Supabase:

```sql
INSERT INTO nango_connections (org_id, connection_id, provider_config_key)
VALUES ($orgId, $connectionId, 'google')
ON CONFLICT DO UPDATE SET ...;
```

---

## 5. Syncing integrations

After a connection is created, the integrations page calls:

```
POST /api/connections/sync
{ "connectionId": "org123_google", "provider": "google" }
```

The sync route fans out to multiple QStash jobs per provider (see `PROVIDER_WORKER_KEYS`
in `lib/integrations/providers.ts`). Each worker job calls the nango-fetch worker
which fetches, embeds, and indexes the content.

---

## 6. Verifying everything works locally

1. Start the dev server: `pnpm dev` (from `apps/web`).
2. Connect a provider via the Integrations page.
3. Check the Nango dashboard to confirm the connection appears.
4. Check Supabase `nango_connections` table for the mapping row.
5. In logs, look for `[nango-fetch] Worker` messages confirming jobs ran.
