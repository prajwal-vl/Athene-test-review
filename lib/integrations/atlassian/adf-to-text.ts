/**
 * Utility to convert Atlassian Document Format (ADF) JSON to plain text.
 * Used by both Jira (issue descriptions/comments) and Confluence (pages).
 */

interface ADFNode {
  type: string
  text?: string
  content?: ADFNode[]
  attrs?: Record<string, any>
  marks?: Array<{ type: string; attrs?: Record<string, any> }>
}

/**
 * Recursively converts an ADF node and its children to plain text.
 */
export function extractTextFromADF(node: ADFNode | ADFNode[] | null | undefined): string {
  if (!node) return ''

  if (Array.isArray(node)) {
    return node.map(n => extractTextFromADF(n)).join('')
  }

  // Handle text nodes directly
  if (node.type === 'text' && node.text) {
    return node.text
  }

  // Handle hard breaks
  if (node.type === 'hardBreak') {
    return '\n'
  }

  // Handle blocks that should be followed by a newline
  const blockTypes = ['paragraph', 'heading', 'listItem', 'blockquote', 'codeBlock']
  const isBlock = blockTypes.includes(node.type)

  let text = ''
  if (node.content) {
    text = extractTextFromADF(node.content)
  }

  // Add spacing for list items
  if (node.type === 'listItem') {
    text = `• ${text}`
  }

  // Add spacing for block types
  if (isBlock) {
    text = text.trim() + '\n'
  }

  return text
}

/**
 * Specialized version for Jira descriptions/comments which are often ADF.
 */
export function jiraAdfToText(adf: any): string {
  try {
    if (typeof adf === 'string') return adf // Sometimes it's already text
    return extractTextFromADF(adf as ADFNode).trim()
  } catch (error) {
    console.error('Error converting Jira ADF to text:', error)
    return String(adf)
  }
}
