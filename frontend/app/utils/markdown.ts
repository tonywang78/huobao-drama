import { marked } from 'marked'

marked.setOptions({
  gfm: true,
  breaks: true,
})

/** 助手常见输出：• 列表 → 标准 Markdown */
function normalizeAssistantMarkdown(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.replace(/^(\s*)[•·▪◦‣⁃]\s+/, '$1- '))
    .join('\n')
}

export function renderMarkdown(text: string): string {
  const src = String(text || '').trim()
  if (!src) return ''
  return marked.parse(normalizeAssistantMarkdown(src), { async: false }) as string
}
