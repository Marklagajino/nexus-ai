import { useState } from 'react'
import type { ChatTarget, ProviderInfo } from '../types'
import { Markdown } from './MessageList'

export function CrossCheckModal({
  question,
  answer,
  candidates,
  targetFor,
  onDone,
  onClose,
}: {
  question: string
  answer: string
  candidates: ProviderInfo[]
  targetFor: (provider: ProviderInfo) => ChatTarget
  onDone: (provider: string, model: string) => void
  onClose: () => void
}) {
  const [selected, setSelected] = useState(candidates[0]?.id ?? '')
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [used, setUsed] = useState('')

  const provider = candidates.find((candidate) => candidate.id === selected)

  const run = async () => {
    if (!provider) return
    setStatus('loading')
    setError('')
    setText('')
    try {
      const response = await fetch('/api/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...targetFor(provider), question, answer }),
      })
      const payload = (await response.json()) as {
        text?: string
        error?: string
        provider?: string
        model?: string
      }
      if (!response.ok || !payload.text) {
        throw new Error(payload.error ?? `Check failed (${response.status}).`)
      }
      setText(payload.text)
      setUsed(`${payload.provider ?? provider.name} · ${payload.model ?? provider.model}`)
      setStatus('done')
      onDone(payload.provider ?? provider.name, payload.model ?? provider.model)
    } catch (problem) {
      setError((problem as Error).message)
      setStatus('error')
    }
  }

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="check-title">
      <div className="modal modal--check">
        <header className="panel-head">
          <span id="check-title">SECOND OPINION</span>
          <button type="button" onClick={onClose} aria-label="Close cross-check">
            ✕
          </button>
        </header>

        <div className="modal-body">
          {candidates.length === 0 ? (
            <div className="check-empty">
              <p>Only one model is linked.</p>
              <small>
                Add another provider in MODELS, then ask it to review this answer independently.
              </small>
            </div>
          ) : (
            <>
              <p className="modal-lede">
                A different model reviews the answer for errors, gaps and risky assumptions.
              </p>

              <div className="check-models">
                {candidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    type="button"
                    className={`check-model${candidate.id === selected ? ' check-model--on' : ''}`}
                    onClick={() => setSelected(candidate.id)}
                  >
                    {candidate.name}
                    <small>{candidate.model}</small>
                  </button>
                ))}
              </div>

              <div className="check-body">
                {status === 'idle' && (
                  <p className="check-hint">
                    The question and answer are shared with this provider only when you run the
                    check.
                  </p>
                )}
                {status === 'loading' && (
                  <p className="check-loading">
                    <span className="check-spinner" aria-hidden="true" /> consulting {provider?.name}…
                  </p>
                )}
                {status === 'error' && <p className="check-error">{error}</p>}
                {status === 'done' && (
                  <>
                    <p className="check-used">{used}</p>
                    <Markdown content={text} />
                  </>
                )}
              </div>
            </>
          )}
        </div>

        <footer className="modal-foot">
          <button type="button" className="ghost-btn" onClick={onClose}>
            {status === 'done' ? 'CLOSE' : 'CANCEL'}
          </button>
          {candidates.length > 0 && (
            <button
              type="button"
              className="primary-btn"
              onClick={run}
              disabled={status === 'loading'}
            >
              {status === 'loading' ? 'CHECKING…' : status === 'done' ? 'RUN AGAIN' : 'RUN CHECK'}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
