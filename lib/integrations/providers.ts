export type ProviderKey =
  | 'google'
  | 'microsoft'
  | 'slack'
  | 'hubspot'
  | 'notion'
  | 'jira'
  | 'confluence'
  | 'salesforce'
  | 'snowflake'
  | 'github'
  | 'linear'
  | 'zendesk';

/**
 * Maps each canonical ProviderKey to the list of worker-level provider keys
 * that the nango-fetch worker's providerFetcherMap understands.
 *
 * For multi-resource providers (Google, Microsoft) a single Nango OAuth
 * connection fans out into N separate QStash jobs so each resource can
 * be indexed, retried, and throttled independently.
 *
 * For single-resource providers the list contains exactly the same key
 * as the Nango integration ID.
 */
export const PROVIDER_WORKER_KEYS: Record<ProviderKey, string[]> = {
  // Google: one connection → three independent indexing jobs
  google: ['google-drive', 'gmail', 'google-calendar'],
  // Microsoft: one connection → one combined indexing job
  microsoft: ['microsoft-graph'],
  slack: ['slack'],
  hubspot: ['hubspot'],
  notion: ['notion'],
  jira: ['jira'],
  confluence: ['confluence'],
  salesforce: ['salesforce'],
  snowflake: ['snowflake'],
  github: ['github'],
  linear: ['linear'],
  zendesk: ['zendesk'],
};

export interface ProviderCapabilities {
  canFetch: boolean;
  canSearch: boolean;
  requiresScopes: string[];
}

export interface ProviderConfig {
  key: ProviderKey;
  displayName: string;
  description: string;
  icon: string;
  category: string;
  nangoIntegrationId: string;
  resources: string[];
  capabilities: ProviderCapabilities;
}

export const PROVIDER_REGISTRY: Record<ProviderKey, ProviderConfig> = {
  google: {
    key: 'google',
    displayName: 'Google Workspace',
    description: 'Gmail, Drive, Calendar',
    icon: '/integrations/gdrive.svg',
    category: 'productivity',
    // The single Nango integration that covers all Google scopes.
    // Worker jobs fan out to 'google-drive' | 'gmail' | 'google-calendar'
    // via PROVIDER_WORKER_KEYS above.
    nangoIntegrationId: 'google',
    resources: ['gmail', 'drive', 'calendar'],
    capabilities: {
      canFetch: true,
      canSearch: true,
      requiresScopes: ['gmail.readonly', 'drive.readonly', 'calendar.readonly'],
    },
  },
  microsoft: {
    key: 'microsoft',
    displayName: 'Microsoft 365',
    description: 'Outlook, OneDrive, SharePoint, Calendar',
    icon: '/integrations/outlook.svg',
    category: 'productivity',
    // The single Nango integration that covers all Microsoft Graph scopes.
    // Worker job uses the 'microsoft-graph' key via PROVIDER_WORKER_KEYS above.
    nangoIntegrationId: 'microsoft',
    resources: ['emails', 'files', 'documents', 'events'],
    capabilities: {
      canFetch: true,
      canSearch: true,
      requiresScopes: ['Mail.Read', 'Files.Read.All', 'Sites.Read.All', 'Calendars.Read'],
    },
  },
  slack: {
    key: 'slack',
    displayName: 'Slack',
    description: 'Channels and threads',
    icon: '/integrations/slack.svg',
    category: 'communication',
    nangoIntegrationId: 'slack',
    resources: ['channels', 'threads'],
    capabilities: {
      canFetch: true,
      canSearch: true,
      requiresScopes: ['channels:history', 'channels:read'],
    },
  },
  hubspot: {
    key: 'hubspot',
    displayName: 'HubSpot',
    description: 'Contacts, Companies, Deals, Notes',
    icon: '/integrations/hubspot.svg',
    category: 'crm',
    nangoIntegrationId: 'hubspot',
    resources: ['contacts', 'companies', 'deals', 'notes'],
    capabilities: {
      canFetch: true,
      canSearch: true,
      requiresScopes: ['crm.objects.contacts.read'],
    },
  },
  notion: {
    key: 'notion',
    displayName: 'Notion',
    description: 'Pages and databases',
    icon: '/integrations/notion.svg',
    category: 'productivity',
    nangoIntegrationId: 'notion',
    resources: ['pages', 'databases'],
    capabilities: {
      canFetch: true,
      canSearch: true,
      requiresScopes: [],
    },
  },
  jira: {
    key: 'jira',
    displayName: 'Jira',
    description: 'Issues and comments',
    icon: '/integrations/jira.svg',
    category: 'dev',
    nangoIntegrationId: 'jira',
    resources: ['issues', 'comments'],
    capabilities: {
      canFetch: true,
      canSearch: true,
      requiresScopes: ['read:jira-work'],
    },
  },
  confluence: {
    key: 'confluence',
    displayName: 'Confluence',
    description: 'Pages and spaces',
    icon: '/integrations/confluence.svg',
    category: 'productivity',
    nangoIntegrationId: 'confluence',
    resources: ['pages', 'spaces'],
    capabilities: {
      canFetch: true,
      canSearch: true,
      requiresScopes: ['read:confluence-content.summary'],
    },
  },
  salesforce: {
    key: 'salesforce',
    displayName: 'Salesforce',
    description: 'Accounts, Opportunities, Cases',
    icon: '/integrations/salesforce.svg',
    category: 'crm',
    nangoIntegrationId: 'salesforce',
    resources: ['accounts', 'opportunities', 'cases'],
    capabilities: {
      canFetch: true,
      canSearch: true,
      requiresScopes: ['api', 'refresh_token', 'offline_access'],
    },
  },
  snowflake: {
    key: 'snowflake',
    displayName: 'Snowflake',
    description: 'Tables and views',
    icon: '/integrations/snowflake.svg',
    category: 'data',
    nangoIntegrationId: 'snowflake',
    resources: ['tables', 'views'],
    capabilities: {
      canFetch: true,
      canSearch: true,
      requiresScopes: [],
    },
  },
  github: {
    key: 'github',
    displayName: 'GitHub',
    description: 'Issues, PRs, Wiki',
    icon: '/integrations/github.svg',
    category: 'dev',
    nangoIntegrationId: 'github',
    resources: ['issues', 'prs', 'wiki'],
    capabilities: {
      canFetch: true,
      canSearch: true,
      requiresScopes: ['repo', 'read:user'],
    },
  },
  linear: {
    key: 'linear',
    displayName: 'Linear',
    description: 'Issues, projects, cycles',
    icon: '/integrations/linear.svg',
    category: 'dev',
    nangoIntegrationId: 'linear',
    resources: ['issues', 'projects', 'cycles'],
    capabilities: {
      canFetch: true,
      canSearch: true,
      requiresScopes: ['read'],
    },
  },
  zendesk: {
    key: 'zendesk',
    displayName: 'Zendesk',
    description: 'Tickets and articles',
    icon: '/integrations/zendesk.svg',
    category: 'crm',
    nangoIntegrationId: 'zendesk',
    resources: ['tickets', 'articles'],
    capabilities: {
      canFetch: true,
      canSearch: true,
      requiresScopes: ['tickets:read', 'help_center:read'],
    },
  },
};

export function getProviderConfig(key: ProviderKey): ProviderConfig {
  return PROVIDER_REGISTRY[key];
}

export function getProvidersByCategory(category: string): ProviderConfig[] {
  return Object.values(PROVIDER_REGISTRY).filter((p) => p.category === category);
}

export function getAllProviders(): ProviderConfig[] {
  return Object.values(PROVIDER_REGISTRY);
}

/**
 * Returns the list of worker-level provider keys to dispatch for a given
 * canonical ProviderKey. Use this in the sync route to fan out jobs.
 */
export function getWorkerKeys(key: ProviderKey): string[] {
  return PROVIDER_WORKER_KEYS[key] ?? [key];
}
