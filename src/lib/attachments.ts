import type { Attachment } from '../types'

/** Hard cap per file: accepts 150 MB attachments with headroom. */
export const MAX_FILE_BYTES = 200 * 1024 * 1024
export const MAX_FILES = 6
export const MAX_TOTAL_BYTES = 500 * 1024 * 1024

/** Only the first slice of a file is read, so a 150 MB file is instant. */
const READ_BYTES = 512 * 1024
const FILE_CHAR_CAP = 40_000
const TOTAL_CHAR_CAP = 60_000

export const ATTACHMENT_MARKER = '\n\n--- ATTACHED FILES ---\n'

const TEXT_EXTENSIONS = new Set([
  'txt', 'text', 'md', 'markdown', 'mdx', 'csv', 'tsv', 'json', 'jsonl', 'ndjson',
  'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'log', 'xml', 'html', 'htm',
  'css', 'scss', 'less', 'svg', 'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'py', 'rb',
  'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'pl', 'lua',
  'sh', 'bash', 'zsh', 'ps1', 'bat', 'sql', 'graphql', 'gql', 'dockerfile', 'makefile',
  'gitignore', 'srt', 'vtt', 'rtf',
])

const TEXT_MIMES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-javascript',
  'application/x-yaml',
  'application/yaml',
  'application/sql',
  'application/x-sh',
  'application/rtf',
])

export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`
}

function extension(name: string): string {
  const clean = name.toLowerCase()
  const dot = clean.lastIndexOf('.')
  return dot >= 0 ? clean.slice(dot + 1) : clean
}

export function looksTextual(name: string, mime: string): boolean {
  const type = mime.toLowerCase()
  if (type.startsWith('text/')) return true
  if (TEXT_MIMES.has(type)) return true
  return TEXT_EXTENSIONS.has(extension(name))
}

/** Read a bounded, text-only extract. The full file never leaves the browser. */
export async function readAttachment(file: File): Promise<Pick<Attachment, 'kind' | 'excerpt' | 'truncated' | 'status'>> {
  if (!looksTextual(file.name, file.type)) {
    return { kind: 'binary', excerpt: '', truncated: false, status: 'ready' }
  }
  try {
    const buffer = await file.slice(0, READ_BYTES).arrayBuffer()
    const text = new TextDecoder('utf-8').decode(buffer)
    const excerpt = text.slice(0, FILE_CHAR_CAP)
    return {
      kind: 'text',
      excerpt,
      truncated: file.size > READ_BYTES || text.length > excerpt.length,
      status: 'ready',
    }
  } catch {
    return { kind: 'binary', excerpt: '', truncated: false, status: 'error' }
  }
}

function fenceFor(content: string): string {
  const longest = Math.max(0, ...(content.match(/`+/g) ?? []).map((run) => run.length))
  return '`'.repeat(Math.max(3, longest + 1))
}

/**
 * Build the text block the model receives. Text files are capped so a huge
 * file cannot blow the context window; binary files contribute metadata only.
 */
export function formatAttachments(attachments: Attachment[]): string {
  const ready = attachments.filter((file) => file.status === 'ready')
  if (ready.length === 0) return ''

  let budget = TOTAL_CHAR_CAP
  const blocks: string[] = []

  ready.forEach((file, index) => {
    const header = `FILE ${index + 1}: ${file.name} (${formatSize(file.size)}, ${file.mime || 'unknown type'})`
    if (file.kind === 'binary' || !file.excerpt) {
      blocks.push(
        `${header}\n[Binary file — only the name, type and size are available; the contents were not read.]`,
      )
      return
    }

    let excerpt = file.excerpt
    let truncated = file.truncated
    if (excerpt.length > budget) {
      excerpt = excerpt.slice(0, Math.max(0, budget))
      truncated = true
    }
    budget -= excerpt.length
    if (budget <= 0) {
      blocks.push(`${header}\n[Attachment text budget for this message is used up.]`)
      return
    }

    const fence = fenceFor(excerpt)
    const language = extension(file.name)
    const note = truncated ? '\n[Content truncated to fit the context window.]' : ''
    blocks.push(`${header}${note}\n${fence}${language}\n${excerpt}\n${fence}`)
  })

  return `${ATTACHMENT_MARKER}${blocks.join('\n\n')}\n`
}

/** Strip the attachment payload from the operator's bubble. */
export function visibleUserText(content: string): string {
  const marker = content.indexOf(ATTACHMENT_MARKER)
  return (marker >= 0 ? content.slice(0, marker) : content).trim()
}
