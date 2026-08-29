/**
 * 分镜 description 可读性：每个【镜头N】独占一行开头
 */

/** 在非行首的【镜头N】前插入空行，便于人读与后续映射 */
export function formatStoryboardDescription(text: string | null | undefined): string {
  if (text == null) return ''
  const raw = String(text).replace(/\r\n/g, '\n').trim()
  if (!raw) return ''
  return raw
    .replace(/([^\n])[ \t]*(【镜头\d+】)/g, '$1\n\n$2')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
