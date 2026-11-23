import { useMemo, useState } from 'react'
import type { ProviderInfo, ProviderSettings, Settings } from '../types'

export function SettingsPanel({
  providers,
  initial,
  onSave,
  onClose,
}: {
  providers: ProviderInfo[]
  initial: Settings
  onSave: (settings: Settings) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<Settings>(() => ({
    active: initial.active,
    providers: JSON.parse(JSON.stringify(initial.providers)) as Settings['providers'],
  }))
  const [probe, setProbe] = useState<Record<string, 'testing' | 'ok' | 'error'>>({})
  const [probeNote, setProbeNote] = useState<Record<string, string>>({})

  const testLink = async (provider: ProviderInfo) => {
    const value = draft.providers[provider.id] ?? {}
    setProbe((prev) => ({ ...prev, [provider.id]: 'testing' }))
    setProbeNote((prev) => ({ ...prev, [provider.id]: 'Contacting…' }))
    try {
      const response = await fetch('/api/probe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: provider.id,
          apiKey: value.apiKey ?? '',
          model: value.model || provider.model,
          baseUrl: value.baseUrl || provider.baseUrl,
        }),
      })
      const payload = (await response.json()) as {
        ok?: boolean
        error?: string
        model?: string
        reply?: string
      }
      if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'Test failed.')
      setProbe((prev) => ({ ...prev, [provider.id]: 'ok' }))
      setProbeNote((prev) => ({
        ...prev,
        [provider.id]: `Connected · ${payload.model ?? provider.model}`,
      }))
    } catch (problem) {
      setProbe((prev) => ({ ...prev, [provider.id]: 'error' }))
      setProbeNote((prev) => ({ ...prev, [provider.id]: (problem as Error).message }))
    }
  }

  const linkedCount = useMemo(
    () =>
      providers.filter(
        (provider) =>
          provider.serverKey || Boolean(draft.providers[provider.id]?.apiKey) || !provider.requiresKey,
      ).length,
    [providers, draft.providers],
  )

  const patch = (id: string, value: Partial<ProviderSettings>) =>
    setDraft((prev) => ({
      ...prev,
      providers: { ...prev.providers, [id]: { ...prev.providers[id], ...value } },
    }))

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="mesh-title">
      <div className="modal modal--mesh">
        <header className="panel-head">
          <span id="mesh-title">MODEL MESH</span>
          <span className="mesh-count">
            {linkedCount} LINKED · {providers.length} AVAILABLE
          </span>
          <button type="button" onClick={onClose} aria-label="Close model panel">
            ✕
          </button>
        </header>

        <div className="modal-body">
          <p className="modal-lede">
            Link the models you trust. Every request goes to the active model; the second-opinion
            check uses a different one.
          </p>

          <div className="prov-list">
            {providers.map((provider) => {
              const value = draft.providers[provider.id] ?? {}
              const linked =
                Boolean(provider.serverKey || value.apiKey) || !provider.requiresKey
              const isActive = provider.id === draft.active

              return (
                <section key={provider.id} className={`prov${isActive ? ' prov--on' : ''}`}>
                  <button
                    type="button"
                    className="prov-head"
                    onClick={() => setDraft((prev) => ({ ...prev, active: provider.id }))}
                    aria-pressed={isActive}
                  >
                    <span className={`prov-dot${linked ? ' prov-dot--on' : ''}`} aria-hidden="true" />
                    <span className="prov-title">
                      <strong>{provider.name}</strong>
                      <small>
                        {provider.dialect}
                        {provider.requiresKey
                          ? linked
                            ? ' · linked'
                            : ' · key required'
                          : ' · no key'}
                      </small>
                    </span>
                    <span className="prov-badge">
                      {isActive ? 'ACTIVE' : linked ? 'LINKED' : 'LINK'}
                    </span>
                  </button>

                  {isActive && (
                    <div className="prov-fields">
                      {provider.id === 'custom' && (
                        <label className="field">
                          <span>BASE URL</span>
                          <input
                            type="url"
                            value={value.baseUrl ?? ''}
                            spellCheck={false}
                            placeholder="https://api.example.com/v1"
                            onChange={(event) => patch(provider.id, { baseUrl: event.target.value })}
                          />
                        </label>
                      )}

                      <label className="field">
                        <span>MODEL</span>
                        <input
                          type="text"
                          value={value.model ?? ''}
                          spellCheck={false}
                          placeholder={provider.model || 'model name'}
                          onChange={(event) => patch(provider.id, { model: event.target.value })}
                        />
                      </label>

                      <label className="field">
                        <span>API KEY</span>
                        <input
                          type="password"
                          value={value.apiKey ?? ''}
                          autoComplete="off"
                          spellCheck={false}
                          placeholder={
                            provider.serverKey
                              ? 'server key in use — leave blank'
                              : provider.requiresKey
                                ? 'paste key'
                                : 'not required'
                          }
                          onChange={(event) => patch(provider.id, { apiKey: event.target.value })}
                        />
                      </label>

                      {provider.serverKey && (
                        <p className="prov-note">
                          A server-side key for {provider.name} is already configured.
                        </p>
                      )}

                      {!provider.requiresKey && (
                        <p className="prov-note">
                          No key needed.{' '}
                          {provider.id === 'pollinations'
                            ? 'Anonymous free tier — one reply per 45s, and no private material.'
                            : 'Runs locally on this machine.'}
                        </p>
                      )}

                      <div className="prov-test">
                        <button
                          type="button"
                          className="ghost-btn ghost-btn--sm"
                          onClick={() => testLink(provider)}
                          disabled={probe[provider.id] === 'testing'}
                        >
                          {probe[provider.id] === 'testing' ? 'TESTING…' : 'TEST LINK'}
                        </button>
                        {probeNote[provider.id] && (
                          <span className={`prov-test-note prov-test-note--${probe[provider.id] ?? 'idle'}`}>
                            {probeNote[provider.id]}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              )
            })}
          </div>

          <p className="modal-note">
            Keys live in this tab’s session storage and are sent only to this app’s proxy. Model
            choices persist. Press ⌘K / Ctrl+K to reopen this panel.
          </p>
        </div>

        <footer className="modal-foot">
          <button type="button" className="ghost-btn" onClick={onClose}>
            CANCEL
          </button>
          <button type="button" className="primary-btn" onClick={() => onSave(draft)}>
            ENGAGE
          </button>
        </footer>
      </div>
    </div>
  )
}
