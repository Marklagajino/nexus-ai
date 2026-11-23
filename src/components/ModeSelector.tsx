import { MODE_INFO, MODE_ORDER, type Mode } from '../types'

export function ModeSelector({
  mode,
  onChange,
}: {
  mode: Mode
  onChange: (mode: Mode) => void
}) {
  return (
    <nav className="panel modes" aria-label="Nexus mode">
      {MODE_ORDER.map((candidate) => {
        const info = MODE_INFO[candidate]
        const active = candidate === mode
        return (
          <button
            key={candidate}
            type="button"
            className={`mode${active ? ' mode--on' : ''}`}
            onClick={() => onChange(candidate)}
            aria-pressed={active}
          >
            <span className="mode-glyph" aria-hidden="true">
              {info.glyph}
            </span>
            <span className="mode-text">
              {info.label}
              <small>{info.hint}</small>
            </span>
          </button>
        )
      })}
    </nav>
  )
}
