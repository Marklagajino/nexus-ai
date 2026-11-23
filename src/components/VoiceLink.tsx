import { Core, type CoreState } from './Core'
import { langMatches } from '../lib/useVoice'

const STATE_LABEL: Record<CoreState, string> = {
  idle: 'STANDBY',
  thinking: 'THINKING',
  listening: 'LISTENING',
  speaking: 'SPEAKING',
}

const STATE_HINT: Record<CoreState, string> = {
  idle: 'Say something to continue.',
  thinking: 'Working on it…',
  listening: 'Listening — speak naturally.',
  speaking: 'Speaking. Tap interrupt if you want the floor.',
}

export function VoiceLink({
  state,
  interim,
  lastUser,
  lastReply,
  busy,
  listening,
  speaking,
  error,
  voices,
  voiceName,
  onVoice,
  onMic,
  onClose,
  route,
  note,
  language,
  onLanguage,
}: {
  state: CoreState
  interim: string
  lastUser: string
  lastReply: string
  busy: boolean
  listening: boolean
  speaking: boolean
  error: string
  voices: SpeechSynthesisVoice[]
  voiceName: string
  onVoice: (name: string) => void
  onMic: () => void
  onClose: () => void
  route: string
  note?: string
  language: string
  onLanguage: (lang: string) => void
}) {
  const matching = voices.filter((voice) => langMatches(voice.lang, language))
  const list = matching.length > 0 ? matching : voices
  const filipino = language.startsWith('fil') || language.startsWith('tl')

  return (
    <div className="voice" role="dialog" aria-modal="true" aria-label="Voice link">
      <header className="voice-top">
        <span className="voice-brand">
          <span className="voice-brand-dot" aria-hidden="true" /> VOICE LINK
        </span>
        <span className={`voice-status voice-status--${state}`}>{STATE_LABEL[state]}</span>
        <button type="button" className="ghost-btn" onClick={onClose}>
          END ✕
        </button>
      </header>

      <div className="voice-stage">
        <Core state={state} />
        <p className="voice-hint">{error || STATE_HINT[state]}</p>
        <p className="voice-route">{route}</p>
        {note && !error && <p className="voice-note">{note}</p>}
        <p className={`voice-wave${speaking || listening ? ' voice-wave--live' : ''}`} aria-hidden="true">
          <i />
          <i />
          <i />
          <i />
          <i />
          <i />
        </p>
      </div>

      <div className="voice-captions" aria-live="polite">
        {lastUser && (
          <p className="vc vc--user">
            <span>YOU</span>
            {lastUser.length > 320 ? `…${lastUser.slice(-320)}` : lastUser}
          </p>
        )}
        <p className="vc vc--nexus">
          <span>NEXUS</span>
          {interim ? (
            <em>{interim}</em>
          ) : lastReply ? (
            lastReply.length > 700 ? `…${lastReply.slice(-700)}` : lastReply
          ) : (
            'Awaiting your voice…'
          )}
          {busy && <i className="vc-caret" aria-hidden="true" />}
        </p>
      </div>

      <footer className="voice-controls">
        <label className="voice-pick">
          <span>LANGUAGE</span>
          <select value={language} onChange={(event) => onLanguage(event.target.value)}>
            <option value="en-US">English</option>
            <option value="fil-PH">Filipino / Tagalog</option>
          </select>
        </label>

        <label className="voice-pick">
          <span>VOICE</span>
          <select value={voiceName} onChange={(event) => onVoice(event.target.value)}>
            <option value="">{filipino ? 'Auto · Filipino preference' : 'Auto · British preference'}</option>
            {list.map((voice) => (
              <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                {voice.name} · {voice.lang}
              </option>
            ))}
          </select>
          {filipino && matching.length === 0 && (
            <span className="voice-pick-missing">no Filipino voice installed</span>
          )}
        </label>

        <button
          type="button"
          className={`voice-mic${listening ? ' voice-mic--on' : ''}`}
          onClick={onMic}
        >
          {speaking ? 'INTERRUPT' : listening ? 'STOP LISTENING' : 'SPEAK'}
        </button>
      </footer>
    </div>
  )
}
