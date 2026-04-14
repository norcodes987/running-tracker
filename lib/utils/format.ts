// lib/utils/format.ts

/** Convert seconds-per-km to "m:ss" string */
export function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = secPerKm % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Convert total minutes to "h:mm:ss" or "m:ss" */
export function formatDuration(minutes: number): string {
  const totalSec = Math.round(minutes * 60)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Format km to 1 decimal place string */
export function formatKm(km: number): string {
  return km.toFixed(1)
}
