/**
 * Utility to convert Confluence HTML (Storage Format) to plain text.
 */

/**
 * Strips HTML tags and converts basic block elements to text structure.
 * 
 * NOTE: For complex Confluence pages, we might eventually want to use 
 * a proper HTML parser like 'cheerio', but for now, regex-based stripping 
 * is sufficient for text indexing.
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html) return ''

  let text = html

  // 1. Replace block elements with newlines
  text = text.replace(/<(p|div|br|h1|h2|h3|h4|h5|h6|li|tr)[^>]*>/gi, '\n')
  
  // 2. Handle list items specifically
  text = text.replace(/<li[^>]*>/gi, '\n• ')

  // 3. Strip all other tags
  text = text.replace(/<[^>]*>/g, '')

  // 4. Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")

  // 5. Clean up multiple newlines and whitespace
  text = text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')

  return text.trim()
}
