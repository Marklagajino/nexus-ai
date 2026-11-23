import { useCallback, useEffect, useRef, useState } from 'react'
import type { Attachment, AttachmentMeta, ChatTarget, Mode, Msg } from '../types'
import { formatAttachments } from './attachments'

const STORAGE_KEY = 'nexus.thread.v1'
let counter = 0
const uid = () => `m${Date.now().toString(36)}-${(counter++).toString(36)}`

function loadThread(): Msg[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (message): message is Msg =>
        Boolean(message) &&
        typeof message === 'object' &&
        ((message as Msg).role === 'user' || (message as Msg).role === 'assistant') &&
        typeof (message as Msg).content === 'string',
    )
  } catch {
    return []
  }
}

export interface SendResult {
  text: string
  ms: number
  error?: string
  provider?: string
  model?: string
}

export interface SendOptions {
  appendUser?: boolean
  speech?: boolean
  attachments?: Attachment[]
  onText?: (fullText: string) => void
}

function attachmentMeta(files: Attachment[] | undefined): AttachmentMeta[] | undefined {
  if (!files || files.length === 0) return undefined
  return files.map(({ id, name, size, mime, kind, truncated, status, error }) => ({
    id,
    name,
    size,
    mime,
    kind,
    truncated,
    status,
    error,
  }))
}

export function useChat() {
  const [messages, setMessages] = useState<Msg[]>(loadThread)
  const [busy, setBusy] = useState(false)
  const [latency, setLatency] = useState<number | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const busyRef = useRef(false)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-80)))
      } catch {
        /* quota exceeded */
      }
    }, 350)
    return () => window.clearTimeout(timer)
  }, [messages])

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setMessages([])
    setLatency(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
  }, [])

  const run = useCallback(
    async (
      text: string,
      mode: Mode,
      target: ChatTarget,
      options: SendOptions = {},
    ): Promise<SendResult> => {
      const trimmed = text.trim()
      const startedAt = performance.now()
      const attached = options.attachments ?? []
      if ((!trimmed && attached.length === 0) || busyRef.current) return { text: '', ms: 0 }

      const body = trimmed + formatAttachments(attached)
      const appendUser = options.appendUser !== false
      const replyId = uid()
      const history = [
        ...messages.filter((message) => !message.error),
        ...(appendUser ? [{ role: 'user' as const, content: body }] : []),
      ]
        .slice(-30)
        .map((message) => ({ role: message.role, content: message.content }))

      const placeholder: Msg = {
        id: replyId,
        role: 'assistant',
        content: '',
        mode,
        streaming: true,
      }

      setMessages((prev) => [
        ...prev,
        ...(appendUser
          ? [
              {
                id: uid(),
                role: 'user' as const,
                content: body,
                mode,
                attachments: attachmentMeta(attached),
              },
              placeholder,
            ]
          : [placeholder]),
      ])
      setBusy(true)
      busyRef.current = true

      const controller = new AbortController()
      abortRef.current = controller

      let accumulated = ''
      let pending = ''
      let frame = 0
      let failure = ''
      let providerName = ''
      let modelName = ''

      const flush = () => {
        if (!pending) return
        accumulated += pending
        pending = ''
        setMessages((prev) =>
          prev.map((message) =>
            message.id === replyId ? { ...message, content: accumulated } : message,
          ),
        )
        options.onText?.(accumulated)
      }

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            mode,
            messages: history,
            provider: target.provider,
            model: target.model,
            baseUrl: target.baseUrl,
            apiKey: target.apiKey,
            speech: options.speech === true,
          }),
        })

        if (!response.ok || !response.body) {
          let message = `Request failed (${response.status}).`
          try {
            const payload = (await response.json()) as { error?: string }
            if (payload?.error) message = payload.error
          } catch {
            /* not json */
          }
          throw new Error(message)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.trim()) continue
            let event: { t?: string; d?: string; message?: string; provider?: string; model?: string }
            try {
              event = JSON.parse(line) as typeof event
            } catch {
              continue
            }
            if (event.t === 'meta') {
              providerName = event.provider ?? ''
              modelName = event.model ?? ''
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === replyId
                    ? { ...message, provider: providerName, model: modelName }
                    : message,
                ),
              )
            } else if (event.t === 'd' && typeof event.d === 'string') {
              pending += event.d
              if (!frame) {
                frame = requestAnimationFrame(() => {
                  frame = 0
                  flush()
                })
              }
            } else if (event.t === 'e' && event.message) {
              failure = event.message
            }
          }
        }
        flush()
      } catch (error) {
        const err = error as Error
        if (err?.name !== 'AbortError') failure = failure || err.message || 'Connection lost.'
      } finally {
        if (frame) cancelAnimationFrame(frame)
        flush()
        setBusy(false)
        busyRef.current = false
        abortRef.current = null
        setMessages((prev) =>
          prev.map((message) => {
            if (message.id !== replyId) return message
            if (failure && !accumulated) {
              return { ...message, content: failure, error: true, streaming: false }
            }
            return { ...message, streaming: false, error: Boolean(failure) }
          }),
        )
        setLatency(Math.round(performance.now() - startedAt))
      }

      return {
        text: accumulated,
        ms: Math.round(performance.now() - startedAt),
        error: failure || undefined,
        provider: providerName,
        model: modelName,
      }
    },
    [messages],
  )

  const send = useCallback(
    (text: string, mode: Mode, target: ChatTarget, options: Omit<SendOptions, 'appendUser'> = {}) =>
      run(text, mode, target, { ...options, appendUser: true }),
    [run],
  )

  const retry = useCallback(
    async (
      mode: Mode,
      target: ChatTarget,
      options: Omit<SendOptions, 'appendUser'> = {},
    ): Promise<SendResult> => {
      const lastUser = [...messages].reverse().find((message) => message.role === 'user')
      if (!lastUser) return { text: '', ms: 0 }
      setMessages((prev) => {
        const next = [...prev]
        while (
          next.length > 0 &&
          next[next.length - 1].role === 'assistant' &&
          next[next.length - 1].error
        ) {
          next.pop()
        }
        return next
      })
      return run(lastUser.content, mode, target, { ...options, appendUser: false })
    },
    [messages, run],
  )

  return { messages, busy, latency, send, retry, stop, clear }
}
