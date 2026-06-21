import type { ReactNode } from 'react'

interface HudFrameProps {
  children: ReactNode
  className?: string
  label?: string
  badge?: string
  grain?: boolean
  minimal?: boolean
}

export function HudFrame({
  children,
  className = '',
  label,
  badge,
  grain = true,
  minimal = false,
}: HudFrameProps) {
  return (
    <div className={`hud-frame ${minimal ? 'hud-frame--minimal' : ''} ${className}`.trim()}>
      {!minimal && (
        <>
          <span className="hud-frame__corner hud-frame__corner--tl" aria-hidden />
          <span className="hud-frame__corner hud-frame__corner--tr" aria-hidden />
          <span className="hud-frame__corner hud-frame__corner--bl" aria-hidden />
          <span className="hud-frame__corner hud-frame__corner--br" aria-hidden />
        </>
      )}
      {!minimal && (label || badge) && (
        <div className="hud-frame__meta">
          {label && <span className="hud-frame__label">{label}</span>}
          {badge && <span className="hud-frame__badge">{badge}</span>}
        </div>
      )}
      {grain && <div className="hud-frame__grain" aria-hidden />}
      <div className="hud-frame__body">{children}</div>
    </div>
  )
}
