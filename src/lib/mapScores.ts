// Relative consensus scoring + diverging color ramp for the map choropleth.
// Low scores → deep purple; mid → orange/sand; high → green; top → light blue.
// Colors map to RELATIVE rank within the current view's score set so small
// differences are visually amplified.

/** Piecewise RGB stops on a 0–100 relative scale. */
export const COLOR_STOPS: [number, [number, number, number]][] = [
  [0, [58, 12, 92]], // deep purple (worst)
  [12, [92, 28, 110]],
  [28, [168, 48, 88]], // magenta-red
  [40, [210, 88, 52]], // orange
  [50, [200, 168, 88]], // sand midpoint
  [62, [118, 188, 98]], // light green
  [78, [52, 168, 108]], // green
  [90, [72, 198, 168]], // teal
  [100, [130, 210, 248]], // light blue (best)
]

export const LEGEND_TICKS = [0, 15, 35, 50, 65, 80, 100] as const

export function scoreColor(score: number): [number, number, number] {
  const s = Math.max(0, Math.min(100, score))
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const [s0, c0] = COLOR_STOPS[i]!
    const [s1, c1] = COLOR_STOPS[i + 1]!
    if (s <= s1) {
      const t = s1 === s0 ? 0 : (s - s0) / (s1 - s0)
      return [
        Math.round(c0[0] + (c1[0] - c0[0]) * t),
        Math.round(c0[1] + (c1[1] - c0[1]) * t),
        Math.round(c0[2] + (c1[2] - c0[2]) * t),
      ]
    }
  }
  return COLOR_STOPS[COLOR_STOPS.length - 1]![1]
}

export function scoreColorCss(score: number, alpha = 1): string {
  const [r, g, b] = scoreColor(score)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function legendGradientCss(): string {
  return `linear-gradient(90deg, ${LEGEND_TICKS.map((s) => scoreColorCss(s)).join(', ')})`
}

/** Min/max of a score array (ignores nullish). */
export function scoreExtent(scores: number[]): { min: number; max: number } {
  if (!scores.length) return { min: 0, max: 100 }
  return { min: Math.min(...scores), max: Math.max(...scores) }
}

/**
 * Map an absolute consensus score to a 0–100 relative position within a set,
 * with mid-range expansion so small differences read clearly on the ramp.
 */
export function toRelativeScore(
  score: number,
  scores: number[],
): number {
  const { min, max } = scoreExtent(scores)
  if (max === min) return 50
  const t = (score - min) / (max - min)
  // S-curve: expand differences near the middle of the distribution.
  const curved = 0.5 + Math.tanh((t - 0.5) * 2.4) * 0.48
  return Math.max(0, Math.min(100, curved * 100))
}

/** Color for an absolute score given the current view's score population. */
export function colorForScore(score: number, population: number[]): [number, number, number] {
  return scoreColor(toRelativeScore(score, population))
}

export function colorForScoreCss(score: number, population: number[], alpha = 1): string {
  const [r, g, b] = colorForScore(score, population)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Map an absolute 0–100 construction-consensus score to a letter grade, so the
 * national map reads each state as a grade instead of a raw number.
 */
export function scoreToGrade(score: number): string {
  const s = Math.max(0, Math.min(100, Math.round(score)))
  if (s >= 90) return 'A+'
  if (s >= 85) return 'A'
  if (s >= 80) return 'A-'
  if (s >= 75) return 'B+'
  if (s >= 70) return 'B'
  if (s >= 65) return 'B-'
  if (s >= 60) return 'C+'
  if (s >= 55) return 'C'
  if (s >= 50) return 'C-'
  if (s >= 45) return 'D+'
  if (s >= 40) return 'D'
  return 'F'
}
