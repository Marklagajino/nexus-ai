import { useEffect, useRef, useState } from 'react'
import { MODE_INFO, type Attachment, type Mode } from '../types'
import {
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  formatSize,
  looksTextual,
  readAttachment,
} from '../lib/attachments'

interface ComposerProps {
  onSend: (text: string, attachments: Attachment[]) => void
  onStop: () => void
  busy: boolean
  listening: boolean
  interim: string
  onMic: () => void
  micAvailable: boolean
  mode: Mode
  onCycleMode: () => void
  hasKey: boolean
  onConfigure: () => void
  targetLabel: string
  onCall: () => void
  callActive: boolean
}

let fileCounter = 0

export function Composer({
  onSend,
  onStop,
  busy,
  listening,
  interim,
  onMic,
  micAvailable,
  mode,
  onCycleMode,
  hasKey,
  onConfigure,
  targetLabel,
  onCall,
  callActive,
}: ComposerProps) {
  const [value, setValue] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [fileError, setFileError] = useState('')
  const [dragging, setDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const attachmentsRef = useRef<Attachment[]>([])

  const commit = (next: Attachment[] | ((prev: Attachment[]) => Attachment[])) => {
    setAttachments((prev) => {
      const value = typeof next === 'function' ? next(prev) : next
      attachmentsRef.current = value
      return value
    })
  }

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const grow = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 158)}px`
  }

  const remove = (id: string) => {
    commit((prev) => prev.filter((file) => file.id !== id))
  }

  const addFiles = (incoming: FileList | File[] | null) => {
    if (!incoming) return
    const list = Array.from(incoming)
    if (list.length === 0) return

    const current = attachmentsRef.current
    let total = current.reduce((sum, file) => sum + file.size, 0)
    const accepted: File[] = []
    let message = ''

    for (const file of list) {
      if (current.length + accepted.length >= MAX_FILES) {
        message = `Up to ${MAX_FILES} files per message.`
        break
      }
      if (file.size > MAX_FILE_BYTES) {
        message = `${file.name} is ${formatSize(file.size)} — the limit is ${formatSize(MAX_FILE_BYTES)} per file.`
        continue
      }
      if (total + file.size > MAX_TOTAL_BYTES) {
        message = `Attachments for one message are limited to ${formatSize(MAX_TOTAL_BYTES)}.`
        continue
      }
      total += file.size
      accepted.push(file)
    }

    setFileError(message)

    for (const file of accepted) {
      fileCounter += 1
      const id = `f${Date.now().toString(36)}-${fileCounter}`
      const pending: Attachment = {
        id,
        name: file.name,
        size: file.size,
        mime: file.type,
        kind: looksTextual(file.name, file.type) ? 'text' : 'binary',
        excerpt: '',
        truncated: false,
        status: 'reading',
      }
      commit((prev) => [...prev, pending])
      void readAttachment(file)
        .then((result) => {
          commit((prev) => prev.map((item) => (item.id === id ? { ...item, ...result } : item)))
        })
        .catch(() => {
          commit((prev) =>
            prev.map((item) =>
              item.id === id ? { ...item, status: 'error', error: 'Could not read this file.' } : item,
            ),
          )
        })
    }
  }

  const reading = attachments.some((file) => file.status === 'reading')
  const ready = attachments.filter((file) => file.status === 'ready')

  const submit = () => {
    const text = value.trim()
    if (busy || reading) return
    if (!text && ready.length === 0) return
    setValue('')
    commit([])
    setFileError('')
    window.requestAnimationFrame(() => {
      grow()
      textareaRef.current?.focus()
    })
    onSend(text, ready)
  }

  const info = MODE_INFO[mode]

  return (
    <div className="composer">
      {interim && (
        <div className="interim" aria-live="polite">
          <span>◌</span> {interim}
        </div>
      )}
      <div
        className={`composer-box${dragging ? ' composer-box--drop' : ''}`}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          addFiles(event.dataTransfer.files)
        }}
      >
        {attachments.length > 0 && (
          <div className="attachments">
            {attachments.map((file) => (
              <span
                key={file.id}
                className={`attach${file.status === 'error' ? ' attach--err' : ''}`}
                title={
                  file.status === 'error'
                    ? file.error
                    : file.truncated
                      ? 'Only the first part of this file is sent to the model.'
                      : file.name
                }
              >
                <span className="attach-name">{file.name}</span>
                <span className="attach-size">
                  {file.status === 'reading'
                    ? 'reading…'
                    : file.status === 'error'
                      ? 'unreadable'
                      : file.kind === 'binary'
                        ? `${formatSize(file.size)} · metadata only`
                        : `${formatSize(file.size)}${file.truncated ? ' · partial' : ''}`}
                </span>
                <button
                  type="button"
                  className="attach-x"
                  onClick={() => remove(file.id)}
                  aria-label={`Remove ${file.name}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        {fileError && <p className="attach-error">{fileError}</p>}

        <textarea
          ref={textareaRef}
          value={value}
          rows={1}
          spellCheck
          placeholder={listening ? 'Listening…' : `Message ${targetLabel || 'Nexus'}…`}
          aria-label="Message Nexus"
          onChange={(event) => {
            setValue(event.target.value)
            grow()
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
        />
        <div className="composer-bar">
          <button
            type="button"
            className="chip chip--mode"
            onClick={onCycleMode}
            title="Cycle mode"
          >
            <span aria-hidden="true">{info.glyph}</span>
            {info.label}
          </button>
          <button
            type="button"
            className="chip chip--attach"
            onClick={() => inputRef.current?.click()}
            title={`Attach files — up to ${formatSize(MAX_FILE_BYTES)} each`}
          >
            <span aria-hidden="true">＋</span>
            FILE
          </button>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="file-input"
            onChange={(event) => {
              addFiles(event.target.files)
              event.target.value = ''
            }}
          />
          {!hasKey && (
            <button type="button" className="chip chip--warn" onClick={onConfigure}>
              CONNECT MODEL
            </button>
          )}
          <div className="spacer" />
          {micAvailable && (
            <button
              type="button"
              className={`chip chip--call${callActive ? ' chip--live' : ''}`}
              onClick={onCall}
              title="Hands-free voice conversation"
            >
              <span aria-hidden="true">◉</span>
              {callActive ? 'LINK OPEN' : 'CALL'}
            </button>
          )}
          {micAvailable && (
            <button
              type="button"
              className={`mic${listening ? ' mic--on' : ''}`}
              onClick={onMic}
              aria-pressed={listening}
              title={listening ? 'Stop listening' : 'Speak to Nexus'}
            >
              <span className="mic-icon" aria-hidden="true">
                ◉
              </span>
              <span className="mic-label">{listening ? 'LISTENING' : 'VOICE'}</span>
            </button>
          )}
          {busy ? (
            <button type="button" className="send send--stop" onClick={onStop} title="Stop">
              ■
            </button>
          ) : (
            <button
              type="button"
              className="send"
              onClick={submit}
              disabled={(!value.trim() && ready.length === 0) || reading}
              title={reading ? 'Reading attachment…' : 'Send'}
            >
              ➤
            </button>
          )}
        </div>
      </div>
      <p className="composer-hint">
        ENTER to send · SHIFT+ENTER new line · drop files up to {formatSize(MAX_FILE_BYTES)} · ⌘K models
      </p>
    </div>
  )
}
