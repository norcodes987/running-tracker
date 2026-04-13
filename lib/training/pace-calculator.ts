export type TrainingPaces = {
  race_pace: number
  tempo:     number
  long_run:  number
  easy:      number
  interval:  number
  recovery:  number
}

export function calculateTrainingPaces(racePaceSecPerKm: number): TrainingPaces {
  return {
    race_pace: Math.round(racePaceSecPerKm),
    tempo:     Math.round(racePaceSecPerKm * 1.12),
    long_run:  Math.round(racePaceSecPerKm * 1.25),
    easy:      Math.round(racePaceSecPerKm * 1.30),
    interval:  Math.round(racePaceSecPerKm * 0.93),
    recovery:  Math.round(racePaceSecPerKm * 1.45),
  }
}

/** Format seconds-per-km as "m:ss" */
export function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = secPerKm % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Parse "m:ss" or "h:mm:ss" pace string → seconds. Returns null if invalid. */
export function parsePaceInput(input: string): number | null {
  const parts = input.trim().split(':').map(Number)
  if (parts.some(isNaN)) return null
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  return null
}

/** Parse "h:mm:ss" goal time string → total minutes */
export function goalTimeToMinutes(input: string): number {
  const [h, m, s] = input.trim().split(':').map(Number)
  return h * 60 + m + (s ?? 0) / 60
}
