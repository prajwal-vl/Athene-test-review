import { paginate, graphDownload, graphFetch } from './graph-client'
import mammoth from 'mammoth'
import * as pdf from 'pdf-parse'
import * as xlsx from 'xlsx'

export async function listOneDriveDocs(connectionId: string, orgId: string, itemId: string = 'root') {
  const items: any[] = []
  const endpoint = itemId === 'root' 
    ? `/me/drive/root/children` 
    : `/me/drive/items/${itemId}/children`
    
  for await (const item of paginate(connectionId, orgId, endpoint)) {
    if (item.file) {
      items.push(item)
    } else if (item.folder) {
      const children = await listOneDriveDocs(connectionId, orgId, item.id)
      items.push(...children)
    }
  }
  return items
}

export async function fetchOneDriveDocContent(connectionId: string, orgId: string, itemId: string): Promise<string> {
  // 1. Get metadata
  const item = await graphFetch(connectionId, orgId, `/me/drive/items/${itemId}`)
  const fileName = item.name.toLowerCase()
  
  // 2. Download content
  const arrayBuffer = await graphDownload(connectionId, orgId, `/me/drive/items/${itemId}/content`)
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
    return buffer.toString('utf-8')
  }
}

/**
 * Fetches the assigned permissions for a specific OneDrive item.
 */
export async function getOneDriveItemPermissions(connectionId: string, orgId: string, itemId: string) {
  const data = await graphFetch(connectionId, orgId, `/me/drive/items/${itemId}/permissions`)
  return data.value
}
