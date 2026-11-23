import { useCallback, useEffect, useRef, useState } from 'react'

/* SpeechRecognition is still missing from lib.dom in TypeScript. */
type Recognition = {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((event: SpeechResultEvent) => void) | null
  onerror: ((event: { error?: string }) => void) | null
  onend: (() => void) | null
}

interface SpeechResultEvent {
  resultIndex: number
  results: {
    length: number
    [index: number]: {
      isFinal: boolean
      [index: number]: { transcript: string }
    }
  }
}

const VOICE_KEY = 'nexus.voice'
const LANGUAGE_KEY = 'nexus.voiceLang'

/** Filipino voices ship as fil-PH or, on older engines, tl-PH. */
export function langMatches(voiceLang: string, selected: string): boolean {
  const voice = voiceLang.toLowerCase()
  const target = selected.toLowerCase()
  if (target.startsWith('fil') || target.startsWith('tl')) {
    return voice.startsWith('fil') || voice.startsWith('tl')
  }
  return voice.startsWith(target.split('-')[0])
}

const PREFERRED_VOICES = [
  'Daniel',
  'Google UK English Male',
  'Arthur',
  'Oliver',
  'Microsoft Ryan',
  'Google UK English Female',
]

function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' — code block — ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[#>\-*+]\s*/gm, '')
    .replace(/[*_~#|]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function splitSentences(text: string): string[] {
  const parts = text.match(/[^.!?…]+[.!?…]+["')\]]*|[^.!?…]+$/g)
  return (parts ?? [text]).map((part) => part.trim()).filter(Boolean)
}

function splitLong(sentence: string): string[] {
  if (sentence.length <= 380) return [sentence]
  const chunks: string[] = []
  let rest = sentence
  while (rest.length > 380) {
    const space = rest.lastIndexOf(' ', 380)
    const cut = space > 120 ? space : 380
    chunks.push(rest.slice(0, cut).trim())
    rest = rest.slice(cut).trim()
  }
  if (rest) chunks.push(rest)
  return chunks
}

export function useVoice() {
  const [recognitionSupported, setRecognitionSupported] = useState(false)
  const [synthesisSupported, setSynthesisSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [interim, setInterim] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [error, setError] = useState('')
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [voiceName, setVoiceName] = useState<string>(() => {
    try {
      return localStorage.getItem(VOICE_KEY) ?? ''
    } catch {
      return ''
    }
  })
  const [language, setLanguage] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(LANGUAGE_KEY)
      if (stored) return stored
    } catch {
      /* storage unavailable */
    }
    const browser = typeof navigator !== 'undefined' ? navigator.language.toLowerCase() : ''
    return browser.startsWith('fil') || browser.startsWith('tl') ? 'fil-PH' : 'en-US'
  })

  const recognitionRef = useRef<Recognition | null>(null)
  const finalRef = useRef('')
  const onFinalRef = useRef<((text: string) => void) | null>(null)
  const queueRef = useRef<string[]>([])
  const activeRef = useRef(false)
  const generationRef = useRef(0)
  const pumpRef = useRef<() => void>(() => {})
  const streamConsumedRef = useRef(0)
  const voiceNameRef = useRef(voiceName)
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])
  const languageRef = useRef(language)

  useEffect(() => {
    languageRef.current = language
  }, [language])

  useEffect(() => {
    voiceNameRef.current = voiceName
  }, [voiceName])

  useEffect(() => {
    voicesRef.current = voices
  }, [voices])

  /* ---------- speech synthesis ---------- */

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
    setSynthesisSupported(true)
    const load = () => setVoices(window.speechSynthesis.getVoices())
    load()
    window.speechSynthesis.addEventListener?.('voiceschanged', load)
    return () => window.speechSynthesis.removeEventListener?.('voiceschanged', load)
  }, [])

  const pump = useCallback(() => {
    if (activeRef.current) return
    const next = queueRef.current.shift()
    if (!next) {
      setSpeaking(false)
      return
    }
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

    const generation = generationRef.current
    const utterance = new SpeechSynthesisUtterance(next)
    const list = voicesRef.current
    const selected = languageRef.current
    const matching = list.filter((voice) => langMatches(voice.lang, selected))
    const stored = list.find((voice) => voice.name === voiceNameRef.current)
    const chosen =
      stored ??
      matching[0] ??
      PREFERRED_VOICES.map((name) => list.find((voice) => voice.name.includes(name))).find(
        Boolean,
      ) ??
      list.find((voice) => /^en-GB/i.test(voice.lang)) ??
      list.find((voice) => /^en/i.test(voice.lang))

    utterance.lang = chosen?.lang ?? selected
    if (chosen) utterance.voice = chosen
    utterance.rate = 1.04
    utterance.pitch = 0.95
    utterance.volume = 1

    activeRef.current = true
    setSpeaking(true)

    const finish = () => {
      if (generation !== generationRef.current) return
      activeRef.current = false
      pumpRef.current()
    }

    utterance.onend = finish
    utterance.onerror = finish

    try {
      window.speechSynthesis.speak(utterance)
    } catch {
      activeRef.current = false
      setSpeaking(false)
    }
  }, [])

  useEffect(() => {
    pumpRef.current = pump
  }, [pump])

  const enqueue = useCallback((text: string) => {
    const clean = cleanForSpeech(text)
    if (!clean) return
    const pieces = splitSentences(clean).flatMap(splitLong)
    if (pieces.length === 0) return
    queueRef.current.push(...pieces)
    pumpRef.current()
  }, [])

  /** Speak a complete text immediately, replacing anything queued. */
  const speak = useCallback(
    (text: string) => {
      generationRef.current += 1
      queueRef.current = []
      activeRef.current = false
      streamConsumedRef.current = 0
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
      setSpeaking(false)
      enqueue(text)
    },
    [enqueue],
  )

  const hush = useCallback(() => {
    generationRef.current += 1
    queueRef.current = []
    activeRef.current = false
    streamConsumedRef.current = 0
    if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
    setSpeaking(false)
  }, [])

  /**
   * Feed progressively growing answer text. Complete sentences are spoken as
   * soon as they exist, so the voice starts before generation finishes.
   */
  const feed = useCallback(
    (full: string) => {
      if (streamConsumedRef.current > full.length) streamConsumedRef.current = 0
      const pending = full.slice(streamConsumedRef.current)
      const complete = pending.match(/[\s\S]*[.!?…](?=\s|$)/)
      if (!complete) return
      const chunk = complete[0]
      if (!chunk.trim()) return
      streamConsumedRef.current += chunk.length
      enqueue(chunk)
    },
    [enqueue],
  )

  /** Flush whatever is left after streaming ends. */
  const finishStream = useCallback(
    (full: string) => {
      const rest = full.slice(streamConsumedRef.current)
      streamConsumedRef.current = 0
      if (rest.trim()) enqueue(rest)
    },
    [enqueue],
  )

  const selectVoice = useCallback((name: string) => {
    setVoiceName(name)
    voiceNameRef.current = name
    try {
      localStorage.setItem(VOICE_KEY, name)
    } catch {
      /* ignore */
    }
  }, [])

  /** Switch the language used for both listening and speaking. */
  const selectLanguage = useCallback(
    (next: string) => {
      setLanguage(next)
      languageRef.current = next
      try {
        localStorage.setItem(LANGUAGE_KEY, next)
      } catch {
        /* ignore */
      }
      if (recognitionRef.current) recognitionRef.current.lang = next

      const current = voicesRef.current.find((voice) => voice.name === voiceNameRef.current)
      if (current && !langMatches(current.lang, next)) selectVoice('')
      if (typeof window !== 'undefined') window.speechSynthesis?.cancel()
      setSpeaking(false)
    },
    [selectVoice],
  )

  /* ---------- speech recognition ---------- */

  useEffect(() => {
    const globalWindow = window as unknown as {
      SpeechRecognition?: new () => Recognition
      webkitSpeechRecognition?: new () => Recognition
    }
    const Ctor = globalWindow.SpeechRecognition ?? globalWindow.webkitSpeechRecognition
    if (!Ctor) return

    setRecognitionSupported(true)
    const recognition = new Ctor()
    recognition.lang = languageRef.current
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1

    recognition.onresult = (event) => {
      let finalText = ''
      let draft = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) finalText += result[0].transcript
        else draft += result[0].transcript
      }
      if (finalText) finalRef.current += finalText
      setInterim(draft)
    }

    recognition.onerror = (event) => {
      setListening(false)
      setInterim('')
      const code = event?.error ?? ''
      if (code !== 'no-speech' && code !== 'aborted') {
        setError(
          code === 'not-allowed' || code === 'service-not-allowed'
            ? 'Microphone access is blocked. Allow it in the browser, then try again.'
            : code === 'language-not-supported'
              ? 'This browser cannot listen in Filipino yet. Try Chrome or Edge.'
              : 'Voice input failed. Check the microphone and try again.',
        )
      }
    }

    recognition.onend = () => {
      setListening(false)
      setInterim('')
      const text = finalRef.current.trim()
      finalRef.current = ''
      if (text) onFinalRef.current?.(text)
    }

    recognitionRef.current = recognition

    return () => {
      recognition.onresult = null
      recognition.onerror = null
      recognition.onend = null
      try {
        recognition.abort()
      } catch {
        /* not running */
      }
      window.speechSynthesis?.cancel()
      recognitionRef.current = null
    }
  }, [])

  useEffect(() => {
    if (recognitionRef.current) recognitionRef.current.lang = language
  }, [language])

  const start = useCallback(
    (onFinal: (text: string) => void) => {
      const recognition = recognitionRef.current
      if (!recognition) return
      setError('')
      generationRef.current += 1
      queueRef.current = []
      activeRef.current = false
      window.speechSynthesis?.cancel()
      setSpeaking(false)
      onFinalRef.current = onFinal
      finalRef.current = ''
      setInterim('')
      try {
        recognition.start()
        setListening(true)
      } catch {
        /* already started */
      }
    },
    [],
  )

  const stop = useCallback(() => {
    try {
      recognitionRef.current?.stop()
    } catch {
      /* not running */
    }
    setListening(false)
  }, [])

  return {
    recognitionSupported,
    synthesisSupported,
    listening,
    interim,
    speaking,
    error,
    voices,
    voiceName,
    language,
    selectLanguage,
    start,
    stop,
    speak,
    feed,
    finishStream,
    hush,
    selectVoice,
  }
}
