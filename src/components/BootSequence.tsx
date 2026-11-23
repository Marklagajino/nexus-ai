import { useEffect, useState } from 'react'

const LINES = [
  'NEXUS CORE v4.2 ......... online',
  'neural uplink ........... established',
  'language cortex ......... loaded',
  'speech synthesis ........ ready',
  'diagnostics ............. nominal',
]

export function BootSequence({ onDone }: { onDone: () => void }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (count >= LINES.length) {
      const timer = window.setTimeout(onDone, 620)
      return () => window.clearTimeout(timer)
    }
    const timer = window.setTimeout(() => setCount((current) => current + 1), count === 0 ? 220 : 180)
    return () => window.clearTimeout(timer)
  }, [count, onDone])

  return (
    <div className="boot">
      <div className="boot-inner">
        <div className="boot-mark" aria-hidden="true">
          ◉
        </div>
        <ul className="boot-lines">
          {LINES.slice(0, count).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="boot-bar">
          <i style={{ width: `${(count / LINES.length) * 100}%` }} />
        </div>
        <button type="button" className="boot-skip" onClick={onDone}>
          SKIP ▸
        </button>
      </div>
    </div>
  )
}
