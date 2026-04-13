export type SessionType = 'long_run' | 'race_pace' | 'interval' | 'tempo' | 'easy' | 'rest'

export type QualityScoreResult = {
  distanceScore: number
  paceScore:     number
  qualityScore:  number
  status:        'completed' | 'partial' | 'failed'
}

type QualityScoreInput = {
  type:               SessionType
  plannedKm:          number
  actualKm:           number
  targetPaceSecPerKm: number
  actualPaceSecPerKm: number
  /** For interval sessions: % of time in z5 (0–100). Replaces paceScore. */
  z5TimePct?:         number
}

const PACE_TOLERANCE: Partial<Record<SessionType, number>> = {
  easy:      45,
  long_run:  30,
  tempo:     20,
  race_pace: 15,
}

function calcDistanceScore(plannedKm: number, actualKm: number): number {
  const pct = (actualKm / plannedKm) * 100
  if (pct >= 100) return 100
  if (pct >= 50)  return Math.round(pct)
  return 0
}

function calcPaceScore(
  type: SessionType,
  targetPace: number,
  actualPace: number,
  z5TimePct?: number
): number {
  if (type === 'interval') {
    if (z5TimePct === undefined) return 100 // no HR data — skip
    if (z5TimePct >= 60) return 100
    if (z5TimePct >= 40) return Math.round((z5TimePct - 40) / 20 * 100)
    return 0
  }

  const tolerance = PACE_TOLERANCE[type]
  if (!tolerance) return 100 // rest — no pace score

  const deviation = actualPace - targetPace

  if (type === 'easy') {
    // Penalise too fast (negative deviation). Too slow is fine.
    if (deviation >= 0) return 100
    return Math.max(0, Math.round(100 - (Math.abs(deviation) / tolerance) * 100))
  }

  return Math.max(0, Math.round(100 - (Math.abs(deviation) / tolerance) * 100))
}

export function calculateQualityScore(input: QualityScoreInput): QualityScoreResult {
  const distanceScore = calcDistanceScore(input.plannedKm, input.actualKm)
  const paceScore = calcPaceScore(
    input.type,
    input.targetPaceSecPerKm,
    input.actualPaceSecPerKm,
    input.z5TimePct
  )
  const qualityScore = Math.round(distanceScore * 0.5 + paceScore * 0.5)

  const status =
    distanceScore >= 85 && qualityScore >= 85 ? 'completed' :
    qualityScore >= 60 ? 'partial'   : 'failed'

  return { distanceScore, paceScore, qualityScore, status }
}
