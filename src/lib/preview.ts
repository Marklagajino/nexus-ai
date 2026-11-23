const FENCE = /```(?:html|htm|svg)[^\n]*\n([\s\S]*?)```/gi

export function extractHtml(markdown: string): string | null {
  let match: RegExpExecArray | null
  let last: string | null = null
  FENCE.lastIndex = 0
  while ((match = FENCE.exec(markdown)) !== null) {
    const body = match[1].trim()
    if (body) last = body
  }
  if (last) return last

  const trimmed = markdown.trim()
  if (/^<!doctype html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) return trimmed
  return null
}
