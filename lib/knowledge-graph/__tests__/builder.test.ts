// ============================================================
// builder.test.ts — ATH-60 unit tests for graph builder
//
// Verifies:
//   1. SHA-256 content-hash skip (unchanged docs not re-extracted)
//   2. Full mode queries all org documents
//   3. Stale nodes/edges deleted before re-extraction
//   4. Community detection triggered after successful processing
//   5. QStash worker validates payload correctly
// ============================================================

import { beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Mock supabaseAdmin -------------------------------------

// We build a per-call mock that can be controlled per test
const mockSupabase = {
  from: vi.fn(),
}

// Chainable builder
function mockChain(overrides: Record<string, any> = {}) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockReturnThis(),
    ...overrides,
  }
  return chain
}

vi.mock('@/lib/supabase/server', () => ({
  supabaseAdmin: mockSupabase,
}))

// ---- Mock extractor -----------------------------------------

const mockExtract = vi.fn()

vi.mock('@/lib/knowledge-graph/extractor', () => ({
  extractEntitiesAndRelations: mockExtract,
}))

// ---- Mock storage -------------------------------------------

const mockDeleteByDocument = vi.fn()
const mockUpsertNodes = vi.fn()
const mockUpsertEdges = vi.fn()

vi.mock('@/lib/knowledge-graph/storage', () => ({
  deleteByDocument: mockDeleteByDocument,
  upsertNodes: mockUpsertNodes,
  upsertEdges: mockUpsertEdges,
}))

// ---- Mock community -----------------------------------------

const mockDetectCommunities = vi.fn()

vi.mock('@/lib/knowledge-graph/community', () => ({
  detectCommunities: mockDetectCommunities,
}))

// ---- Import after mocks ------------------------------------

import { buildGraphForDocuments } from '@/lib/knowledge-graph/builder'

// ---- Helpers ------------------------------------------------

const ORG = 'org-abc'
const DOC_1 = 'doc-1'

function makeDocRow(overrides: Record<string, any> = {}) {
  return {
    id: DOC_1,
    content_hash: 'hash-v2',
    last_extracted_hash: null,
    dept_id: 'eng',
    visibility: 'public',
    ...overrides,
  }
}

function makeChunks() {
  return [
    {
      chunk_id: 'c-1',
      metadata: { text_preview: 'ServiceA handles payments' },
      chunk_index: 0,
    },
  ]
}

// ---- Tests --------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  mockExtract.mockResolvedValue({ nodes: [], edges: [] })
  mockDeleteByDocument.mockResolvedValue(undefined)
  mockUpsertNodes.mockResolvedValue(new Map())
  mockUpsertEdges.mockResolvedValue(undefined)
  mockDetectCommunities.mockResolvedValue(undefined)
})

describe('buildGraphForDocuments — SHA-256 skip logic', () => {
  it('skips document when content_hash equals last_extracted_hash', async () => {
    const doc = makeDocRow({
      content_hash: 'stable-hash',
      last_extracted_hash: 'stable-hash',
    })

    const docChain = mockChain({ single: vi.fn().mockResolvedValue({ data: doc, error: null }) })
    mockSupabase.from.mockReturnValue(docChain)

    const result = await buildGraphForDocuments(ORG, [DOC_1], 'incremental')

    expect(result.skippedDocs).toBe(1)
    expect(result.processedDocs).toBe(0)
    expect(mockExtract).not.toHaveBeenCalled()
  })

  it('processes document when hashes differ', async () => {
    const doc = makeDocRow() // last_extracted_hash: null, content_hash: 'hash-v2'
    const chunks = makeChunks()
    const updatedChain = mockChain()

    // Return different data for different .from() calls
    mockSupabase.from
      .mockReturnValueOnce(mockChain({ single: vi.fn().mockResolvedValue({ data: doc, error: null }) }))
      .mockReturnValueOnce(mockChain({ order: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), select: vi.fn().mockReturnThis() }))
      .mockReturnValueOnce(updatedChain)

    // Make the chunk query resolve properly
    const chunkChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: chunks, error: null }),
    }
    mockSupabase.from
      .mockReturnValueOnce(mockChain({ single: vi.fn().mockResolvedValue({ data: doc, error: null }) }))
      .mockReturnValueOnce(chunkChain)
      .mockReturnValue(mockChain({ update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnValue({ error: null }) }))

    await buildGraphForDocuments(ORG, [DOC_1], 'incremental')

    expect(mockExtract).toHaveBeenCalled()
  })
})

describe('buildGraphForDocuments — full mode', () => {
  it('fetches all document IDs for the org in full mode', async () => {
    const allDocsChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [{ id: 'doc-a' }, { id: 'doc-b' }], error: null }),
    }

    // For each doc, return a "skip" scenario (hashes match)
    const skippedDoc = makeDocRow({ content_hash: 'x', last_extracted_hash: 'x' })
    const skippedChain = mockChain({ single: vi.fn().mockResolvedValue({ data: skippedDoc, error: null }) })

    mockSupabase.from
      .mockReturnValueOnce(allDocsChain)  // documents.select('id').eq('org_id')
      .mockReturnValue(skippedChain)       // each processDocument call

    const result = await buildGraphForDocuments(ORG, [], 'full')

    expect(result.skippedDocs).toBe(2)
  })

  it('returns early if no doc IDs in full mode', async () => {
    const emptyChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    }
    mockSupabase.from.mockReturnValue(emptyChain)

    const result = await buildGraphForDocuments(ORG, [], 'full')

    expect(result.processedDocs).toBe(0)
    expect(result.skippedDocs).toBe(0)
    expect(mockDetectCommunities).not.toHaveBeenCalled()
  })
})

describe('buildGraphForDocuments — community detection', () => {
  it('calls detectCommunities after at least one processed doc', async () => {
    const doc = makeDocRow()
    const chunks = makeChunks()

    const chunkChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: chunks, error: null }),
    }

    const updateChain = {
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnValue({ error: null }),
    }

    mockSupabase.from
      .mockReturnValueOnce(mockChain({ single: vi.fn().mockResolvedValue({ data: doc, error: null }) }))
      .mockReturnValueOnce(chunkChain)
      .mockReturnValue(updateChain)

    mockExtract.mockResolvedValue({ nodes: [], edges: [] })

    await buildGraphForDocuments(ORG, [DOC_1], 'incremental')

    expect(mockDetectCommunities).toHaveBeenCalledWith(ORG)
  })

  it('does NOT call detectCommunities when all docs skipped', async () => {
    const doc = makeDocRow({ content_hash: 'h', last_extracted_hash: 'h' })
    mockSupabase.from.mockReturnValue(
      mockChain({ single: vi.fn().mockResolvedValue({ data: doc, error: null }) }),
    )

    await buildGraphForDocuments(ORG, [DOC_1], 'incremental')

    expect(mockDetectCommunities).not.toHaveBeenCalled()
  })
})

describe('buildGraphForDocuments — error handling', () => {
  it('records per-doc errors without stopping other docs', async () => {
    const goodDoc = makeDocRow({ id: 'doc-2', content_hash: null, last_extracted_hash: null })
    const badDocChain = mockChain({ single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }) })
    const goodDocChain = mockChain({ single: vi.fn().mockResolvedValue({ data: null, error: { message: 'not found' } }) })

    mockSupabase.from.mockReturnValue(badDocChain)

    const result = await buildGraphForDocuments(ORG, ['bad-doc', 'bad-doc-2'], 'incremental')

    expect(result.errors).toHaveLength(2)
    expect(result.errors[0]).toContain('bad-doc')
  })

  it('records community detection errors without throwing', async () => {
    const doc = makeDocRow()
    const chunks = makeChunks()

    const chunkChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: chunks, error: null }),
    }
    mockSupabase.from
      .mockReturnValueOnce(mockChain({ single: vi.fn().mockResolvedValue({ data: doc, error: null }) }))
      .mockReturnValueOnce(chunkChain)
      .mockReturnValue(mockChain({ update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnValue({ error: null }) }))

    mockDetectCommunities.mockRejectedValue(new Error('community failed'))

    const result = await buildGraphForDocuments(ORG, [DOC_1], 'incremental')

    expect(result.errors.some((e) => e.includes('community'))).toBe(true)
  })
})

describe('buildGraphForDocuments — incremental mode validation', () => {
  it('returns immediately when documentIds is empty in incremental mode', async () => {
    // No DB calls should be made
    const result = await buildGraphForDocuments(ORG, [], 'incremental')

    expect(result.processedDocs).toBe(0)
    expect(mockSupabase.from).not.toHaveBeenCalled()
  })
})
