import { legendGradientCss, scoreExtent } from '~/lib/mapScores'

interface Props {
  /** Absolute score range in the current view (for tick labels). */
  extent: { min: number; max: number }
  /** "national" shows full US context; "state" shows within-state relative rank. */
  mode: 'national' | 'state'
  className?: string
}

export function ColorScaleLegend({ extent, mode, className = '' }: Props) {
  const { min, max } = scoreExtent([extent.min, extent.max])
  return (
    <div className={`heat-legend heat-legend--dark ${className}`.trim()}>
      <span className="heat-legend__title">
        {mode === 'national' ? 'Relative suitability · US' : 'Relative suitability · state'}
      </span>
      <div
        className="heat-legend__bar"
        style={{ background: legendGradientCss() }}
      />
      <div className="heat-legend__ticks heat-legend__ticks--labeled">
        <span>Poor</span>
        <span>Fair</span>
        <span>Good</span>
        <span>Best</span>
      </div>
      <div className="heat-legend__range">
        Scores {Math.round(min)}–{Math.round(max)}
      </div>
    </div>
  )
}
