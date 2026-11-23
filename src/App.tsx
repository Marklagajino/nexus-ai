import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BootSequence } from './components/BootSequence'
import { Composer } from './components/Composer'
import { Core, type CoreState } from './components/Core'
import { CrossCheckModal } from './components/CrossCheck'
import { MessageList } from './components/MessageList'
import { ModeSelector } from './components/ModeSelector'
import { LogPanel, PreviewOverlay, PreviewPanel, Telemetry } from './components/Rails'
import { SettingsPanel } from './components/SettingsPanel'
import { VoiceLink } from './components/VoiceLink'
import { extractHtml } from './lib/preview'
import {
  loadSettings,
  providerLinked,
  providerModel,
  providerReady,
  saveSettings,
  targetFor,
} from './lib/settings'
import { useChat } from './lib/useChat'
import { useVoice } from './lib/useVoice'
import {
  MODE_INFO,
  MODE_ORDER,
  type Attachment,
  type ChatTarget,
  type LogEntry,
  type MeshConfig,
  type Mode,
  type Msg,
  type ProviderInfo,
  type Settings,
} from './types'

const stamp = () => new Date().toLocaleTimeString('en-GB', { hour12: false })

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return 'unset'
  }
}

const CORE_LABEL: Record<CoreState, string> = {
  idle: 'STANDBY',
  thinking: 'COMPUTING',
  listening: 'LISTENING',
  speaking: 'SPEAKING',
}

const CORE_SUB: Record<CoreState, string> = {
  idle: 'awaiting instruction',
  thinking: 'language cortex engaged',
  listening: 'microphone hot',
  speaking: 'voice channel open',
}

export default function App() {
  const [mode, setMode] = useState<Mode>('auto')
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [mesh, setMesh] = useState<MeshConfig | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [autoSpeak, setAutoSpeak] = useState(() => {
    try {
      return localStorage.getItem('nexus.speak') === '1'
    } catch {
      return false
    }
  })
  const [booted, setBooted] = useState(false)
  const [clock, setClock] = useState(() => new Date())
  const [pinnedHtml, setPinnedHtml] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [crossCheck, setCrossCheck] = useState<{ question: string; answer: string } | null>(null)
  const [voiceLink, setVoiceLink] = useState(false)
  const logSeq = useRef(1)
  const [log, setLog] = useState<LogEntry[]>([
    { id: 1, time: stamp(), text: 'core online', tone: 'ok' },
  ])

  const chat = useChat()
  const voice = useVoice()

  const providers = mesh?.providers ?? []
  const activeProvider = providers.find((provider) => provider.id === settings.active)
  const linkedProviders = useMemo(
    () => providers.filter((provider) => providerLinked(settings, provider)),
    [providers, settings],
  )
  const linkedCount = linkedProviders.length
  const hasKey = linkedCount > 0
  const activeModel = activeProvider ? providerModel(settings, activeProvider) : ''
  const activeLabel = activeProvider ? `${activeProvider.name} · ${activeModel}` : 'no model'
  const target: ChatTarget = activeProvider
    ? targetFor(settings, activeProvider)
    : { provider: settings.active, model: '', baseUrl: '', apiKey: '' }
  const checkCandidates = linkedProviders.filter((provider) => provider.id !== settings.active)

  const voiceLinkRef = useRef(voiceLink)
  const voiceRef = useRef(voice)
  const sendRef = useRef<(text: string, viaVoice?: boolean) => Promise<void>>(async () => {})

  useEffect(() => {
    voiceLinkRef.current = voiceLink
  }, [voiceLink])

  useEffect(() => {
    voiceRef.current = voice
  })

  const pushLog = useCallback((text: string, tone?: LogEntry['tone']) => {
    logSeq.current += 1
    setLog((prev) => [...prev.slice(-49), { id: logSeq.current, time: stamp(), text, tone }])
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('nexus.speak', autoSpeak ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [autoSpeak])

  useEffect(() => {
    let alive = true
    fetch('/api/providers')
      .then((response) => response.json() as Promise<MeshConfig>)
      .then((payload) => {
        if (alive) setMesh(payload)
      })
      .catch(() => {
        /* the mesh endpoint is required for provider names */
      })
    return () => {
      alive = false
    }
  }, [])

  const autoLinkedRef = useRef(false)

  useEffect(() => {
    if (!mesh || mesh.providers.length === 0 || autoLinkedRef.current) return
    autoLinkedRef.current = true

    const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname)
    const active = mesh.providers.find((provider) => provider.id === settings.active)
    // Ollama is legitimate only when this page is running on the same machine.
    const activeUsable = active && (providerReady(settings, active) || (active.id === 'ollama' && localHost))
    if (activeUsable) return

    const usable = mesh.providers.find((provider) => providerReady(settings, provider))
    if (!usable || usable.id === settings.active) return

    const next = { ...settings, active: usable.id }
    setSettings(next)
    saveSettings(next)
    pushLog(`auto-link · ${usable.name} · ${providerModel(next, usable)}`, 'ok')
    if (usable.id === 'pollinations') {
      pushLog('free tier · 1 reply / 45s · link a key to talk freely', 'warn')
    }
    // Only decides once, when the mesh first arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh])

  useEffect(() => {
    if (!mesh) return
    if (linkedCount === 0) {
      pushLog('no model linked · open MODELS', 'warn')
    } else {
      pushLog(`mesh · ${linkedCount} of ${providers.length} models linked`, 'ok')
    }
    // Only announce once, when the mesh arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mesh])

  const latestHtml = useMemo(() => {
    for (let index = chat.messages.length - 1; index >= 0; index -= 1) {
      const message = chat.messages[index]
      if (message.role !== 'assistant') continue
      const html = extractHtml(message.content)
      if (html) return html
    }
    return null
  }, [chat.messages])

  useEffect(() => {
    setPinnedHtml(null)
  }, [latestHtml])

  useEffect(() => {
    const onPreview = (event: Event) => {
      const detail = (event as CustomEvent<{ html?: string }>).detail
      if (detail?.html) {
        setPinnedHtml(detail.html)
        setPreviewOpen(true)
      }
    }
    window.addEventListener('nexus:preview', onPreview)
    return () => window.removeEventListener('nexus:preview', onPreview)
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setShowSettings((value) => !value)
      }
      if (event.key === 'Escape') {
        setShowSettings(false)
        setPreviewOpen(false)
        setCrossCheck(null)
        setVoiceLink(false)
        voiceRef.current.stop()
        voiceRef.current.hush()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const handleSend = useCallback(
    async (raw: string, viaVoice = false, files: Attachment[] = []) => {
      const text = raw.trim()
      if ((!text && files.length === 0) || chat.busy) return
      if (!activeProvider) {
        pushLog('no model selected · open MODELS', 'warn')
        setShowSettings(true)
        return
      }
      if (!providerLinked(settings, activeProvider)) {
        pushLog(`${activeProvider.name} is not linked`, 'warn')
        setShowSettings(true)
        return
      }

      const speakReply = autoSpeak || viaVoice || voiceLinkRef.current
      const speech = speakReply && mode !== 'design' && mode !== 'code'

      const fileNote = files.length
        ? ` · ${files.length} file${files.length === 1 ? '' : 's'}`
        : ''
      pushLog(
        `tx · ${activeProvider.name} · ${text.length} chars${fileNote}${speech ? ' · voice' : ''}`,
      )
      const result = await chat.send(text, mode, target, {
        attachments: files,
        speech,
        onText: speech ? (full: string) => voice.feed(full) : undefined,
      })

      if (result.error) {
        voice.hush()
        pushLog(`rx fault · ${result.error.slice(0, 90)}`, 'err')
        return
      }

      if (speech) voice.finishStream(result.text)
      pushLog(
        `rx · ${result.text.length} chars · ${result.ms} ms · ${result.model || 'model'}`,
        'ok',
      )
    },
    [chat, mode, target, settings, activeProvider, autoSpeak, voice, pushLog],
  )

  useEffect(() => {
    sendRef.current = handleSend
  }, [handleSend])

  const handleRetry = useCallback(async () => {
    if (chat.busy || !activeProvider) return
    const speakReply = autoSpeak || voiceLinkRef.current
    const speech = speakReply && mode !== 'design' && mode !== 'code'
    pushLog('retry · resending last request', 'warn')
    const result = await chat.retry(mode, target, {
      speech,
      onText: speech ? (full: string) => voice.feed(full) : undefined,
    })
    if (result.error) {
      voice.hush()
      pushLog(`rx fault · ${result.error.slice(0, 90)}`, 'err')
      return
    }
    if (speech) voice.finishStream(result.text)
    pushLog(`rx · ${result.text.length} chars · ${result.ms} ms`, 'ok')
  }, [chat, mode, target, activeProvider, autoSpeak, voice, pushLog])

  const handleMic = useCallback(() => {
    if (!voice.recognitionSupported) {
      pushLog('voice · recognition unavailable in this browser', 'warn')
      return
    }
    if (voice.speaking) {
      voice.hush()
      pushLog('voice · interrupted')
      return
    }
    if (voice.listening) {
      voice.stop()
      pushLog('voice · input closed')
      return
    }
    pushLog('voice · microphone hot')
    voice.start((transcript) => {
      const clean = transcript.trim()
      if (!clean) return
      pushLog(`voice · "${clean.slice(0, 46)}"`)
      void sendRef.current(clean, true)
    })
  }, [voice, pushLog])

  const openVoiceLink = useCallback(() => {
    if (!voice.recognitionSupported) {
      pushLog('voice · recognition unavailable in this browser', 'warn')
      return
    }
    setVoiceLink(true)
    pushLog('voice link · connecting', 'ok')
  }, [voice.recognitionSupported, pushLog])

  const closeVoiceLink = useCallback(() => {
    setVoiceLink(false)
    voice.stop()
    voice.hush()
    pushLog('voice link · closed')
  }, [voice, pushLog])

  /* Hands-free loop: whenever Nexus is idle, open the mic again. */
  useEffect(() => {
    if (!voiceLink) return
    if (chat.busy || voice.speaking || voice.listening || voice.error) return

    const timer = window.setTimeout(() => {
      if (!voiceLinkRef.current || chat.busy || voice.speaking || voice.listening) return
      voice.start((transcript) => {
        const clean = transcript.trim()
        if (!clean) return
        pushLog(`voice · "${clean.slice(0, 46)}"`)
        void sendRef.current(clean, true)
      })
    }, 500)

    return () => window.clearTimeout(timer)
  }, [
    voiceLink,
    chat.busy,
    voice.speaking,
    voice.listening,
    voice.error,
    voice.start,
    pushLog,
  ])

  const handleStop = useCallback(() => {
    chat.stop()
    voice.hush()
    pushLog('generation stopped', 'warn')
  }, [chat, voice, pushLog])

  const handlePurge = useCallback(() => {
    chat.clear()
    setPinnedHtml(null)
    setPreviewOpen(false)
    voice.hush()
    logSeq.current += 1
    setLog([{ id: logSeq.current, time: stamp(), text: 'transcript purged', tone: 'warn' }])
  }, [chat, voice])

  const handleSaveSettings = useCallback(
    (next: Settings) => {
      setSettings(next)
      saveSettings(next)
      setShowSettings(false)
      const provider = providers.find((candidate) => candidate.id === next.active)
      if (provider) {
        pushLog(`link · ${provider.name} / ${providerModel(next, provider)}`, 'ok')
      }
    },
    [providers, pushLog],
  )

  const openCrossCheck = useCallback(
    (message: Msg) => {
      if (!message.content || message.error) return
      const index = chat.messages.findIndex((candidate) => candidate.id === message.id)
      const question = [...chat.messages.slice(0, Math.max(0, index))]
        .reverse()
        .find((candidate) => candidate.role === 'user')?.content
      if (!question) {
        pushLog('cross-check · no question to review', 'warn')
        return
      }
      if (checkCandidates.length === 0) {
        pushLog('cross-check · link a second model', 'warn')
      }
      setCrossCheck({ question, answer: message.content })
    },
    [chat.messages, checkCandidates.length, pushLog],
  )

  const cycleMode = useCallback(() => {
    setMode((current) => MODE_ORDER[(MODE_ORDER.indexOf(current) + 1) % MODE_ORDER.length])
  }, [])

  const finishBoot = useCallback(() => setBooted(true), [])

  const coreState: CoreState = chat.busy
    ? 'thinking'
    : voice.speaking
      ? 'speaking'
      : voice.listening
        ? 'listening'
        : 'idle'

  const previewHtml = pinnedHtml ?? latestHtml
  const voiceState = voice.synthesisSupported
    ? voice.speaking
      ? 'speaking'
      : autoSpeak
        ? 'enabled'
        : 'muted'
    : 'n/a'
  const lastUser = [...chat.messages].reverse().find((message) => message.role === 'user')?.content ?? ''
  const lastReply =
    [...chat.messages].reverse().find((message) => message.role === 'assistant')?.content ?? ''

  return (
    <div className="app">
      <div className="fx" aria-hidden="true" />
      {!booted && <BootSequence onDone={finishBoot} />}

      <header className="topbar">
        <div className="brand">
          <span className="brand-glyph" aria-hidden="true">
            ◉
          </span>
          <div className="brand-text">
            <h1>NEXUS</h1>
            <p>personal intelligence mesh</p>
          </div>
        </div>

        <div className="topbar-mid">
          <span className={`status ${chat.busy ? 'status--busy' : 'status--ok'}`}>
            <i aria-hidden="true" />
            {chat.busy ? 'PROCESSING' : 'ONLINE'}
          </span>
          <button
            type="button"
            className="mesh-chip"
            onClick={() => setShowSettings(true)}
            title="Model mesh · ⌘K"
          >
            <span className={`mesh-dot${hasKey ? ' mesh-dot--on' : ''}`} aria-hidden="true" />
            <span className="mesh-name">{activeProvider?.name ?? 'NO MODEL'}</span>
            <span className="mesh-model">{activeModel || 'unlinked'}</span>
            <span className="mesh-count-mini">
              {linkedCount}/{providers.length || 0}
            </span>
          </button>
          <span className="tag tag--mode">
            {MODE_INFO[mode].glyph} {MODE_INFO[mode].label}
          </span>
        </div>

        <div className="topbar-right">
          <div className="clock">
            <span>{clock.toLocaleTimeString('en-GB', { hour12: false })}</span>
            <small>
              {clock
                .toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
                .toUpperCase()}
            </small>
          </div>
          <button type="button" className="ghost-btn" onClick={() => setShowSettings(true)}>
            MODELS
          </button>
        </div>
      </header>

      <main className="stage">
        <aside className="rail rail--left">
          <section className="panel core-panel">
            <Core state={coreState} />
            <p className="core-state">{CORE_LABEL[coreState]}</p>
            <p className="core-sub">{CORE_SUB[coreState]}</p>
          </section>

          <ModeSelector mode={mode} onChange={setMode} />

          <section className="panel toggles">
            <button
              type="button"
              className={`toggle${autoSpeak ? ' toggle--on' : ''}`}
              onClick={() => setAutoSpeak((value) => !value)}
              aria-pressed={autoSpeak}
            >
              <span>VOICE OUTPUT</span>
              <span className="switch" aria-hidden="true">
                <i />
              </span>
            </button>
            <button
              type="button"
              className={`toggle${voiceLink ? ' toggle--on' : ''}`}
              onClick={() => (voiceLink ? closeVoiceLink() : openVoiceLink())}
            >
              <span>VOICE LINK</span>
              <span className="toggle-glyph" aria-hidden="true">
                ◉
              </span>
            </button>
            <button type="button" className="toggle" onClick={handlePurge}>
              <span>PURGE THREAD</span>
              <span className="toggle-glyph" aria-hidden="true">
                ⌫
              </span>
            </button>
            <button type="button" className="toggle" onClick={() => setShowSettings(true)}>
              <span>MODELS</span>
              <span className="toggle-glyph" aria-hidden="true">
                ⚙
              </span>
            </button>
          </section>

          <Telemetry
            model={activeModel}
            provider={activeProvider ? hostOf(target.baseUrl) : '—'}
            latency={chat.latency}
            turns={chat.messages.filter((message) => message.role === 'user').length}
            voice={voiceState}
            mesh={`${linkedCount}/${providers.length || 0}`}
          />
        </aside>

        <section className={`panel chat${chat.busy ? ' chat--busy' : ''}`}>
          <header className="panel-head chat-head">
            <span>TRANSCRIPT</span>
            <div className="chat-head-right">
              {previewHtml && (
                <button
                  type="button"
                  className="panel-actions-button"
                  onClick={() => setPreviewOpen(true)}
                >
                  PREVIEW
                </button>
              )}
              <span className="chat-count">
                {String(chat.messages.length).padStart(2, '0')} ENTRIES
              </span>
            </div>
          </header>

          <MessageList
            messages={chat.messages}
            busy={chat.busy}
            linkedCount={linkedCount}
            activeLabel={activeLabel}
            onSuggestion={handleSend}
            onConfigure={() => setShowSettings(true)}
            onSpeak={voice.speak}
            onVerify={openCrossCheck}
            onRetry={handleRetry}
            canVerify={checkCandidates.length > 0}
          />

          <Composer
            onSend={(text, files) => void handleSend(text, false, files)}
            onStop={handleStop}
            busy={chat.busy}
            listening={voice.listening}
            interim={voice.interim}
            onMic={handleMic}
            micAvailable={voice.recognitionSupported}
            mode={mode}
            onCycleMode={cycleMode}
            hasKey={hasKey}
            onConfigure={() => setShowSettings(true)}
            targetLabel={activeProvider?.name ?? ''}
            onCall={openVoiceLink}
            callActive={voiceLink}
          />
        </section>

        <aside className="rail rail--right">
          <PreviewPanel html={previewHtml} onExpand={() => setPreviewOpen(true)} />
          <LogPanel entries={log} />
        </aside>
      </main>

      {showSettings && mesh && (
        <SettingsPanel
          providers={mesh.providers}
          initial={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showSettings && !mesh && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="modal">
            <header className="panel-head">
              <span>MODEL MESH</span>
              <button type="button" onClick={() => setShowSettings(false)} aria-label="Close">
                ✕
              </button>
            </header>
            <div className="modal-body">
              <p className="modal-lede">Loading provider catalogue…</p>
            </div>
          </div>
        </div>
      )}

      {crossCheck && (
        <CrossCheckModal
          question={crossCheck.question}
          answer={crossCheck.answer}
          candidates={checkCandidates}
          targetFor={(provider: ProviderInfo) => targetFor(settings, provider)}
          onDone={(provider, model) => pushLog(`cross-check · ${provider} · ${model}`, 'ok')}
          onClose={() => setCrossCheck(null)}
        />
      )}

      {voiceLink && (
        <VoiceLink
          state={coreState}
          interim={voice.interim}
          lastUser={lastUser}
          lastReply={lastReply}
          busy={chat.busy}
          listening={voice.listening}
          speaking={voice.speaking}
          error={voice.error}
          voices={voice.voices}
          voiceName={voice.voiceName}
          onVoice={voice.selectVoice}
          onMic={handleMic}
          onClose={closeVoiceLink}
          language={voice.language}
          onLanguage={voice.selectLanguage}
          route={activeProvider ? `via ${activeProvider.name} · ${activeModel}` : 'no model linked'}
          note={
            activeProvider?.id === 'pollinations'
              ? 'Free tier: one reply per 45s. Link a key for a real conversation.'
              : ''
          }
        />
      )}

      {previewOpen && (
        <PreviewOverlay html={previewHtml} onClose={() => setPreviewOpen(false)} />
      )}
    </div>
  )
}
