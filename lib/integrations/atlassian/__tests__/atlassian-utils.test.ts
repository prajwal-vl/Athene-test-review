import { describe, it, expect } from 'vitest'
import { adfToText } from '../adf-to-text'
import { confluenceHtmlToText } from '../confluence-html'

describe('Atlassian Utils', () => {
  describe('adfToText', () => {
    it('converts simple ADF to text', () => {
      const adf = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Hello ',
              },
              {
                type: 'text',
                text: 'World',
                marks: [{ type: 'strong' }],
              },
            ],
          },
        ],
      }
      expect(adfToText(adf)).toBe('Hello World\n')
    })

    it('handles headings and spacing', () => {
      const adf = {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 1 },
            content: [{ type: 'text', text: 'Title' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Subtitle' }],
          },
        ],
      }
      expect(adfToText(adf)).toBe('Title\nSubtitle\n')
    })

    it('handles lists with bullet points', () => {
      const adf = {
        type: 'doc',
        content: [
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 1' }] }],
              },
              {
                type: 'listItem',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item 2' }] }],
              },
            ],
          },
        ],
      }
      expect(adfToText(adf)).toContain('• Item 1')
      expect(adfToText(adf)).toContain('• Item 2')
    })

    it('handles hard breaks', () => {
      const adf = {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Line 1' },
          { type: 'hardBreak' },
          { type: 'text', text: 'Line 2' },
        ],
      }
      expect(adfToText(adf)).toBe('Line 1\nLine 2\n')
    })
  })

  describe('confluenceHtmlToText', () => {
    it('strips basic HTML tags', () => {
      const html = '<p>Hello <b>World</b></p>'
      expect(confluenceHtmlToText(html)).toBe('Hello World')
    })

    it('converts block elements to newlines', () => {
      const html = '<h1>Title</h1><p>Paragraph</p><ul><li>Item 1</li><li>Item 2</li></ul>'
      const text = confluenceHtmlToText(html)
      expect(text).toContain('Title')
      expect(text).toContain('Paragraph')
      expect(text).toContain('• Item 1')
      expect(text).toContain('• Item 2')
    })

    it('decodes HTML entities', () => {
      const html = '<p>It&apos;s &quot;quoted&quot; &amp; &lt;tagged&gt;</p>'
      expect(confluenceHtmlToText(html)).toBe('It\'s "quoted" & <tagged>')
    })

    it('handles empty or null input', () => {
      expect(confluenceHtmlToText('')).toBe('')
      expect(confluenceHtmlToText(null)).toBe('')
      expect(confluenceHtmlToText(undefined)).toBe('')
    })
  })
})
