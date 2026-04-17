// lib/types/splits.ts
export type IntervalSplits = {
  warmup:    { km: number; paceSec: number } | null
  intervals: { reps: number; repKm: number; avgPaceSec: number }
  cooldown:  { km: number; paceSec: number } | null
}
