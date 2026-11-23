import { useEffect, useRef, useState } from 'react'
import type { LogEntry } from '../types'

export function PreviewPanel({ html, onExpand }: { html: string | null; onExpand: () => void }) {
  const [nonce, setNonce] = useState(0)
  const [viewport, setViewport] = useState<'desktop' | 'mobile'>('desktop')

  return (
    <section className="panel preview">
      <header className="panel-head">
        <span>LIVE PREVIEW</span>
        <div className="panel-actions">
          <button
            type="button"
            className={viewport === 'desktop' ? 'is-on' : ''}
            onClick={() => setViewport('desktop')}
            disabled={!html}
            aria-pressed={viewport === 'desktop'}
            title="Desktop width"
          >
            DESKTOP
          </button>
          <button
            type="button"
            className={viewport === 'mobile' ? 'is-on' : ''}
            onClick={() => setViewport('mobile')}
            disabled={!html}
            aria-pressed={viewport === 'mobile'}
            title="Phone width"
          >
            MOBILE
          </button>
          <button type="button" onClick={() => setNonce((n) => n + 1)} disabled={!html}>
            ↻
          </button>
          <button type="button" onClick={onExpand} disabled={!html}>
            EXPAND
          </button>
        </div>
      </header>

      {html ? (
        <div className={`preview-stage${viewport === 'mobile' ? ' preview-stage--mobile' : ''}`}>
          <iframe
            key={nonce}
            className="preview-frame"
            title="Design preview"
            srcDoc={html}
            sandbox="allow-scripts allow-forms allow-popups"
          />
        </div>
      ) : (
        <div className="preview-empty">
          <span className="preview-glyph" aria-hidden="true">
            ▤
          </span>
          <p>AWAITING VISUAL OUTPUT</p>
          <small>Ask for an interface in DESIGN mode. The render appears here.</small>
        </div>
      )}
    </section>
  )
}

export function LogPanel({ entries }: { entries: LogEntry[] }) {
  const listRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [entries])

  return (
    <section className="panel log">
      <header className="panel-head">
        <span>SYSTEM LOG</span>
        <span className="live-tag">● LIVE</span>
      </header>
      <ol className="log-list" ref={listRef}>
        {entries.map((entry) => (
          <li key={entry.id} className={`log-line log-line--${entry.tone ?? 'info'}`}>
            <time>{entry.time}</time>
            <span>{entry.text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

export function Telemetry({
  model,
  provider,
  latency,
  turns,
  voice,
  mesh,
}: {
  model: string
  provider: string
  latency: number | null
  turns: number
  voice: string
  mesh: string
}) {
  return (
    <section className="panel telemetry">
      <header className="panel-head">
        <span>TELEMETRY</span>
      </header>
      <dl>
        <div>
          <dt>MODEL</dt>
          <dd title={model}>{model || '—'}</dd>
        </div>
        <div>
          <dt>PROVIDER</dt>
          <dd title={provider}>{provider || '—'}</dd>
        </div>
        <div>
          <dt>MESH</dt>
          <dd>{mesh}</dd>
        </div>
        <div>
          <dt>LATENCY</dt>
          <dd>{latency === null ? '—' : `${latency} ms`}</dd>
        </div>
        <div>
          <dt>TURNS</dt>
          <dd>{String(turns).padStart(2, '0')}</dd>
        </div>
        <div>
          <dt>VOICE</dt>
          <dd>{voice}</dd>
        </div>
      </dl>
    </section>
  )
}

export function PreviewOverlay({ html, onClose }: { html: string | null; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  if (!html) return null

  return (
    <div
      className="overlay overlay--preview"
      role="dialog"
      aria-modal="true"
      aria-label="Design preview"
    >
      <div className="preview-shell">
        <header className="panel-head">
          <span>RENDER · SANDBOXED</span>
          <button type="button" onClick={onClose}>
            CLOSE ✕
          </button>
        </header>
        <iframe
          className="preview-frame"
          title="Design preview"
          srcDoc={html}
          sandbox="allow-scripts allow-forms allow-popups"
        />
      </div>
    </div>
  )
}
