export type CoreState = 'idle' | 'thinking' | 'listening' | 'speaking'

const TICKS = Array.from({ length: 48 }, (_, index) => index)

export function Core({ state }: { state: CoreState }) {
  return (
    <div className={`core core--${state}`} role="img" aria-label={`Nexus core: ${state}`}>
      <svg viewBox="0 0 200 200" aria-hidden="true">
        <defs>
          <radialGradient id="coreLens" cx="50%" cy="45%" r="55%">
            <stop offset="0%" stopColor="#f4feff" />
            <stop offset="38%" stopColor="#7df3ff" />
            <stop offset="100%" stopColor="#0a6b80" />
          </radialGradient>
          <radialGradient id="coreAura" cx="50%" cy="50%" r="50%">
            <stop offset="58%" stopColor="rgba(53,230,255,0)" />
            <stop offset="100%" stopColor="rgba(53,230,255,0.18)" />
          </radialGradient>
        </defs>

        <circle cx="100" cy="100" r="96" fill="url(#coreAura)" />
        <circle className="core-halo" cx="100" cy="100" r="80" />

        <g className="core-spin core-spin--outer">
          <circle cx="100" cy="100" r="72" className="core-arc" strokeDasharray="1 9" />
          <circle
            cx="100"
            cy="100"
            r="72"
            className="core-arc core-arc--bright"
            strokeDasharray="34 420"
          />
        </g>

        <g className="core-spin core-spin--mid">
          <circle cx="100" cy="100" r="58" className="core-arc" strokeDasharray="46 16 6 16" />
          <circle
            cx="100"
            cy="100"
            r="58"
            className="core-arc core-arc--bright"
            strokeDasharray="14 340"
          />
        </g>

        <g className="core-spin core-spin--inner">
          <circle cx="100" cy="100" r="44" className="core-arc" strokeDasharray="2 7" />
        </g>

        <g className="core-reticle">
          {TICKS.map((tick) => (
            <line
              key={tick}
              x1="100"
              y1={tick % 4 === 0 ? 8 : 12}
              x2="100"
              y2={tick % 4 === 0 ? 18 : 15}
              transform={`rotate(${tick * 7.5} 100 100)`}
            />
          ))}
        </g>

        <circle cx="100" cy="100" r="28" className="core-lens" fill="url(#coreLens)" />
        <circle cx="100" cy="100" r="34" className="core-lens-ring" />
        <circle cx="100" cy="100" r="9" className="core-dot" />
      </svg>
    </div>
  )
}
