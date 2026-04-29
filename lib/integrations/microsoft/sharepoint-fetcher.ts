import { paginate, graphDownload, graphFetch } from './graph-client'
import mammoth from 'mammoth'
import * as pdf from 'pdf-parse'
import * as xlsx from 'xlsx'

export async function listSharePointDocs(connectionId: string, orgId: string, siteId: string, itemId: string = 'root') {
  const items: any[] = []
  const endpoint = itemId === 'root' 
    ? `/sites/${siteId}/drive/root/children` 
    : `/sites/${siteId}/drive/items/${itemId}/children`
    
  for await (const item of paginate(connectionId, orgId, endpoint)) {
    if (item.file) {
      items.push(item)
    } else if (item.folder) {
      // Recurse to find all files in subfolders
      const children = await listSharePointDocs(connectionId, orgId, siteId, item.id)
      items.push(...children)
    }
  }
  return items
}

export async function fetchDocContent(connectionId: string, orgId: string, driveId: string, itemId: string): Promise<string> {
  // 1. Get item metadata to determine file type
  const item = await graphFetch(connectionId, orgId, `/drives/${driveId}/items/${itemId}`)
  const fileName = item.name.toLowerCase()
  
  // 2. Download content
  const arrayBuffer = await graphDownload(connectionId, orgId, `/drives/${driveId}/items/${itemId}/content`)
  const buffer = Buffer.from(arrayBuffer)
  
  if (fileName.endsWith('.docx')) {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  } else if (fileName.endsWith('.pdf')) {
    const pdfParser = (pdf as any).default || pdf
    const data = await pdfParser(buffer)
    return data.text
  } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    const workbook = xlsx.read(buffer, { type: 'buffer' })
    let text = ''
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName]
      text += `Sheet: ${sheetName}\n`
      text += xlsx.utils.sheet_to_csv(sheet) + '\n\n'
    })
    return text
  } else if (fileName.endsWith('.txt')) {
    return buffer.toString('utf-8')
  } else {
    // Fallback for other text-based files or try as UTF-8
    return buffer.toString('utf-8')
  }
}

/**
 * Fetches the assigned permissions for a specific SharePoint document.
 * This includes who has access (people, groups) and what role they have.
 */
export async function getSharePointItemPermissions(connectionId: string, orgId: string, driveId: string, itemId: string) {
  const data = await graphFetch(connectionId, orgId, `/drives/${driveId}/items/${itemId}/permissions`)
  return data.value // Returns a list of Permission objects
}
