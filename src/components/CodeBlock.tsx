import { useState } from 'react'

export function CodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false)
  const isHtml = /^(html|htm|svg)$/i.test(language)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked */
    }
  }

  const preview = () => {
    window.dispatchEvent(new CustomEvent('nexus:preview', { detail: { html: code } }))
  }

  return (
    <div className="code">
      <div className="code-head">
        <span className="code-lang">{language || 'text'}</span>
        <div className="code-actions">
          {isHtml && (
            <button type="button" onClick={preview}>
              PREVIEW
            </button>
          )}
          <button type="button" onClick={copy}>
            {copied ? 'COPIED' : 'COPY'}
          </button>
        </div>
      </div>
      <pre>
        <code>{code}</code>
      </pre>
    </div>
  )
}
