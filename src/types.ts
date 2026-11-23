export type Mode = 'auto' | 'chat' | 'code' | 'design' | 'answer'

export type Dialect = 'openai' | 'anthropic' | 'google'

export type AttachmentKind = 'text' | 'binary'
export type AttachmentStatus = 'reading' | 'ready' | 'error'

export interface AttachmentMeta {
  id: string
  name: string
  size: number
  mime: string
  kind: AttachmentKind
  truncated: boolean
  status: AttachmentStatus
  error?: string
}

export interface Attachment extends AttachmentMeta {
  excerpt: string
}

export interface Msg {
  id: string
  role: 'user' | 'assistant'
  content: string
  mode?: Mode
  streaming?: boolean
  error?: boolean
  provider?: string
  model?: string
  attachments?: AttachmentMeta[]
}

export interface ProviderSettings {
  apiKey?: string
  model?: string
  baseUrl?: string
}

export interface Settings {
  active: string
  providers: Record<string, ProviderSettings>
}

export interface ProviderInfo {
  id: string
  name: string
  dialect: Dialect
  baseUrl: string
  model: string
  serverKey: boolean
  requiresKey: boolean
  free?: boolean
}

export interface MeshConfig {
  providers: ProviderInfo[]
  modes: Mode[]
  serverLinked: number
}

export interface ChatTarget {
  provider: string
  model: string
  baseUrl: string
  apiKey: string
}

export interface LogEntry {
  id: number
  time: string
  text: string
  tone?: 'ok' | 'warn' | 'err'
}

export const MODE_INFO: Record<Mode, { label: string; glyph: string; hint: string }> = {
  auto: { label: 'AUTO', glyph: '◇', hint: 'infer the form' },
  code: { label: 'CODE', glyph: '⌘', hint: 'build it whole' },
  design: { label: 'DESIGN', glyph: '▤', hint: 'render an interface' },
  answer: { label: 'ANSWER', glyph: '◈', hint: 'direct and precise' },
  chat: { label: 'CHAT', glyph: '✦', hint: 'just talk' },
}

export const MODE_ORDER: Mode[] = ['auto', 'code', 'design', 'answer', 'chat']
