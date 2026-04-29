import { baseFetch, getProviderToken, baseFetchRaw } from '../base'

export async function graphFetch(connectionId: string, orgId: string, endpoint: string, options: any = {}): Promise<any> {
  const token = await getProviderToken(connectionId, 'microsoft', orgId)
  
  return baseFetch(`https://graph.microsoft.com/v1.0${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      ...options.headers,
      Authorization: `Bearer ${token}`
    },
    body: options.body ? JSON.parse(options.body) : undefined
  })
}

export async function graphDownload(connectionId: string, orgId: string, endpoint: string, options: any = {}): Promise<ArrayBuffer> {
    const token = await getProviderToken(connectionId, 'microsoft', orgId)
    const res = await baseFetchRaw(`https://graph.microsoft.com/v1.0${endpoint}`, {
        method: 'GET',
        headers: {
            ...options.headers,
            Authorization: `Bearer ${token}`,
        },
    })

    return res.arrayBuffer()
}

// Helper for pagination (Graph uses @odata.nextLink)
export async function* paginate(connectionId: string, orgId: string, endpoint: string) {
  let url = endpoint
  while (url) {
    const data = await graphFetch(connectionId, orgId, url)
    if (data.value && Array.isArray(data.value)) {
      yield* data.value
    }
    
    if (data['@odata.nextLink']) {
      const nextUrl = new URL(data['@odata.nextLink'])
      url = nextUrl.pathname.replace('/v1.0', '') + nextUrl.search
    } else {
      url = ''
    }
  }
}
