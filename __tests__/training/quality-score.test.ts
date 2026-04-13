import { describe, it, expect } from 'vitest'
import { calculateQualityScore } from '@/lib/training/quality-score'
import type { SessionType } from '@/lib/training/quality-score'

describe('calculateQualityScore — distance score', () => {
  it('returns 100 when actual >= planned', () => {
    const { distanceScore } = calculateQualityScore({
      type: 'easy', plannedKm: 10, actualKm: 10,
      targetPaceSecPerKm: 369, actualPaceSecPerKm: 369,
    })
    expect(distanceScore).toBe(100)
  })

  it('returns proportional score for 85-99% completion', () => {
    const { distanceScore } = calculateQualityScore({
      type: 'easy', plannedKm: 10, actualKm: 9.2,
      targetPaceSecPerKm: 369, actualPaceSecPerKm: 369,
    })
    expect(distanceScore).toBe(92)
  })

  it('returns 0 for less than 50% completion', () => {
    const { distanceScore } = calculateQualityScore({
      type: 'easy', plannedKm: 10, actualKm: 4,
      targetPaceSecPerKm: 369, actualPaceSecPerKm: 369,
    })
    expect(distanceScore).toBe(0)
  })
})

describe('calculateQualityScore — pace score', () => {
  it('returns 100 when pace exactly on target', () => {
    const { paceScore } = calculateQualityScore({
      type: 'tempo', plannedKm: 10, actualKm: 10,
      targetPaceSecPerKm: 318, actualPaceSecPerKm: 318,
    })
    expect(paceScore).toBe(100)
  })

  it('penalises tempo pace outside tolerance (±20s)', () => {
    const { paceScore } = calculateQualityScore({
      type: 'tempo', plannedKm: 10, actualKm: 10,
      targetPaceSecPerKm: 318, actualPaceSecPerKm: 348, // 30s slower
    })
    expect(paceScore).toBe(0) // (30/20)*100 = 150 → clamped to 0
  })

  it('easy run: penalises too fast (negative deviation)', () => {
    const { paceScore } = calculateQualityScore({
      type: 'easy', plannedKm: 8, actualKm: 8,
      targetPaceSecPerKm: 369, actualPaceSecPerKm: 300, // 69s faster
    })
    // deviation = 300 - 369 = -69, tolerance 45, score = clamp(100 - ((-69)/45)*100, 0, 100)
    // = clamp(100 + 153, 0, 100) — wait, inverted for easy: penalise if actual < target
    // For easy: pace_score penalises negative deviation (too fast)
    expect(paceScore).toBe(0) // too fast = fail
  })
})

describe('calculateQualityScore — final score', () => {
  it('averages distance and pace scores (0.5/0.5)', () => {
    const { qualityScore } = calculateQualityScore({
      type: 'long_run', plannedKm: 18, actualKm: 18,
      targetPaceSecPerKm: 355, actualPaceSecPerKm: 355,
    })
    expect(qualityScore).toBe(100) // 100 * 0.5 + 100 * 0.5
  })

  it('returns correct status for quality score', () => {
    const complete = calculateQualityScore({
      type: 'tempo', plannedKm: 10, actualKm: 10,
      targetPaceSecPerKm: 318, actualPaceSecPerKm: 318,
    })
    expect(complete.status).toBe('completed')

    const partial = calculateQualityScore({
      type: 'tempo', plannedKm: 10, actualKm: 7.5,
      targetPaceSecPerKm: 318, actualPaceSecPerKm: 318,
    })
    expect(partial.status).toBe('partial')

    const failed = calculateQualityScore({
      type: 'tempo', plannedKm: 10, actualKm: 4,
      targetPaceSecPerKm: 318, actualPaceSecPerKm: 380,
    })
    expect(failed.status).toBe('failed')
  })
})
