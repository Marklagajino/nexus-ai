import { useEffect, useRef, useState } from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MODE_INFO, type Msg } from '../types'
import { formatSize, visibleUserText } from '../lib/attachments'
import { CodeBlock } from './CodeBlock'

const components: Components = {
  pre: ({ children }) => {
    const child = children as
      | { props?: { className?: string; children?: unknown } }
      | undefined
    const props = child?.props ?? {}
    const className = typeof props.className === 'string' ? props.className : ''
    const language = /language-([\w+-]+)/.exec(className)?.[1] ?? 'text'
    const raw = props.children
    const code = (typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.join('') : '').replace(
      /\n$/,
      '',
    )
    return <CodeBlock language={language} code={code} />
  },
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="md-table">
      <table>{children}</table>
    </div>
  ),
}

export function Markdown({ content }: { content: string }) {
  return (
    <div className="md">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

function Message({
  message,
  onSpeak,
  onVerify,
  onRetry,
  canVerify,
}: {
  message: Msg
  onSpeak?: (text: string) => void
  onVerify?: (message: Msg) => void
  onRetry?: () => void
  canVerify?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'
  const spoken = message.model ? `${message.provider} · ${message.model}` : message.provider
  const shown = isUser ? visibleUserText(message.content) : message.content

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shown)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <article
      className={`msg ${isUser ? 'msg--user' : 'msg--nexus'}${message.error ? ' msg--error' : ''}`}
    >
      <header className="msg-meta">
        <span>{isUser ? 'OPERATOR' : 'NEXUS'}</span>
        {message.mode && <span className="msg-mode">{MODE_INFO[message.mode].label}</span>}
        {!isUser && spoken && (
          <span className="msg-model" title={spoken}>
            {spoken}
          </span>
        )}
        {message.streaming && <span className="msg-live">● LIVE</span>}
      </header>

      <div className="msg-body">
        {isUser ? (
          shown ? <p>{shown}</p> : null
        ) : (
          <Markdown content={message.content} />
        )}
        {isUser && message.attachments && message.attachments.length > 0 && (
          <div className="msg-files">
            {message.attachments.map((file) => (
              <span
                key={file.id}
                className={`msg-file${file.status === 'error' ? ' msg-file--err' : ''}`}
                title={file.status === 'error' ? file.error : file.name}
              >
                <span aria-hidden="true">▤</span> {file.name}{' '}
                <em>{formatSize(file.size)}</em>
              </span>
            ))}
          </div>
        )}
        {message.streaming && <span className="cursor" aria-hidden="true" />}
      </div>

      {!message.streaming && message.content && (
        <div className="msg-actions">
          <button type="button" onClick={copy}>
            {copied ? 'COPIED' : 'COPY'}
          </button>
          {!isUser && onSpeak && <button type="button" onClick={() => onSpeak(message.content)}>SPEAK</button>}
          {!isUser && onVerify && (
            <button
              type="button"
              onClick={() => onVerify(message)}
              disabled={!canVerify}
              title={
                canVerify
                  ? 'Ask a different linked model to review this'
                  : 'Link a second model in MODELS first'
              }
            >
              SECOND OPINION
            </button>
          )}
          {message.error && onRetry && (
            <button type="button" className="msg-action--danger" onClick={onRetry}>
              RETRY
            </button>
          )}
        </div>
      )}
    </article>
  )
}

const SUGGESTIONS = [
  'Design a mission-control dashboard for a space startup',
  'Write a Python script that renames photos by capture date',
  'Explain how large language models actually work',
  'Plan a three-day trip to Kyoto on a budget',
]

function EmptyState({
  linkedCount,
  activeLabel,
  onSuggestion,
  onConfigure,
}: {
  linkedCount: number
  activeLabel: string
  onSuggestion: (text: string) => void
  onConfigure: () => void
}) {
  const hour = new Date().getHours()
  const greeting =
    hour < 5 ? 'Still awake' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  return (
    <div className="empty">
      <p className="empty-kicker">NEXUS // READY</p>
      <h2>{greeting}, sir.</h2>
      <p>
        I write code, design interfaces, answer questions, and talk. Type below, or press the mic
        and speak.
      </p>

      {linkedCount === 0 ? (
        <div className="key-banner">
          <div>
            <strong>No model linked</strong>
            <span>Add an API key from any supported provider to bring Nexus online.</span>
          </div>
          <button type="button" onClick={onConfigure}>
            CONNECT
          </button>
        </div>
      ) : (
        <p className="empty-mesh">
          <span className="mesh-dot mesh-dot--on" aria-hidden="true" />
          {linkedCount} model{linkedCount === 1 ? '' : 's'} linked · {activeLabel} active
        </p>
      )}

      <div className="suggestions">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            className="suggestion"
            onClick={() => onSuggestion(suggestion)}
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  )
}

export function MessageList({
  messages,
  busy,
  linkedCount,
  activeLabel,
  onSuggestion,
  onConfigure,
  onSpeak,
  onVerify,
  onRetry,
  canVerify,
}: {
  messages: Msg[]
  busy: boolean
  linkedCount: number
  activeLabel: string
  onSuggestion: (text: string) => void
  onConfigure: () => void
  onSpeak: (text: string) => void
  onVerify: (message: Msg) => void
  onRetry: () => void
  canVerify: boolean
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const [showJump, setShowJump] = useState(false)

  const track = () => {
    const el = boxRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    nearBottom.current = distance < 140
    setShowJump(distance > 260)
  }

  useEffect(() => {
    const el = boxRef.current
    if (!el || !nearBottom.current) return
    el.scrollTop = el.scrollHeight
  }, [messages, busy])

  const jump = () => {
    const el = boxRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
    nearBottom.current = true
    setShowJump(false)
  }

  return (
    <div className="messages-wrap">
      <div className="messages" ref={boxRef} onScroll={track}>
        {messages.length === 0 ? (
          <EmptyState
            linkedCount={linkedCount}
            activeLabel={activeLabel}
            onSuggestion={onSuggestion}
            onConfigure={onConfigure}
          />
        ) : (
          messages.map((message) => (
            <Message
              key={message.id}
              message={message}
              onSpeak={onSpeak}
              onVerify={onVerify}
              onRetry={onRetry}
              canVerify={canVerify}
            />
          ))
        )}
      </div>

      {showJump && (
        <button type="button" className="jump" onClick={jump}>
          ↓ LATEST
        </button>
      )}
    </div>
  )
}
