// __tests__/dashboard/metrics.test.ts
import { describe, it, expect } from 'vitest'
import {
  calcWeeklyDistance,
  calcAvgPaceByType,
  calcCompletionRateByType,
  type DashboardSession,
} from '@/lib/dashboard/metrics'

const PACE_ZONES: Record<string, number> = {
  race_pace: 300, tempo: 336, long_run: 375, easy: 390, interval: 279,
}

function makeSession(overrides: Partial<DashboardSession>): DashboardSession {
  return {
    id: 'x',
    date: new Date().toISOString().slice(0, 10),
    type: 'easy',
    distanceKm: 8,
    targetPaceSecPerKm: 390,
    status: 'planned',
    actualDistanceKm: null,
    actualPaceSecPerKm: null,
    ...overrides,
  }
}

describe('calcWeeklyDistance', () => {
  it('returns zeros when no sessions in current week', () => {
    const { actualKm, targetKm } = calcWeeklyDistance([])
    expect(actualKm).toBe(0)
    expect(targetKm).toBe(0)
  })

  it('sums target km for non-rest, non-bonus planned sessions this week', () => {
    const today = new Date().toISOString().slice(0, 10)
    const sessions = [
      makeSession({ date: today, type: 'easy',  distanceKm: 8, status: 'planned' }),
      makeSession({ date: today, type: 'rest',  distanceKm: 0, status: 'planned' }),
      makeSession({ date: today, type: 'bonus', distanceKm: 5, status: 'completed', actualDistanceKm: 5 }),
    ]
    const { targetKm } = calcWeeklyDistance(sessions)
    expect(targetKm).toBe(8) // bonus and rest excluded
  })

  it('sums actual km for completed/partial sessions this week (bonus included)', () => {
    const today = new Date().toISOString().slice(0, 10)
    const sessions = [
      makeSession({ date: today, status: 'completed', actualDistanceKm: 7.8 }),
      makeSession({ date: today, type: 'bonus', status: 'completed', actualDistanceKm: 5.0 }),
      makeSession({ date: today, status: 'planned', actualDistanceKm: null }),
    ]
    const { actualKm } = calcWeeklyDistance(sessions)
    expect(actualKm).toBeCloseTo(12.8)
  })
})

describe('calcAvgPaceByType', () => {
  it('returns null actual for types with no completed sessions', () => {
    const rows = calcAvgPaceByType([], PACE_ZONES)
    const easyRow = rows.find(r => r.type === 'easy')!
    expect(easyRow.actualSecPerKm).toBeNull()
  })

  it('averages actualPaceSecPerKm for completed sessions of a type', () => {
    const today = new Date().toISOString().slice(0, 10)
    const sessions = [
      makeSession({ date: today, type: 'easy', status: 'completed', actualPaceSecPerKm: 380 }),
      makeSession({ date: today, type: 'easy', status: 'completed', actualPaceSecPerKm: 400 }),
    ]
    const rows = calcAvgPaceByType(sessions, PACE_ZONES)
    const easyRow = rows.find(r => r.type === 'easy')!
    expect(easyRow.actualSecPerKm).toBe(390)
  })

  it('includes a bonus row', () => {
    const rows = calcAvgPaceByType([], PACE_ZONES)
    expect(rows.some(r => r.type === 'bonus')).toBe(true)
  })

  it('uses paceZones for targetSecPerKm', () => {
    const rows = calcAvgPaceByType([], PACE_ZONES)
    const tempoRow = rows.find(r => r.type === 'tempo')!
    expect(tempoRow.targetSecPerKm).toBe(336)
  })

  it('targetSecPerKm is null for types not in paceZones (bonus)', () => {
    const rows = calcAvgPaceByType([], PACE_ZONES)
    const bonusRow = rows.find(r => r.type === 'bonus')!
    expect(bonusRow.targetSecPerKm).toBeNull()
  })
})

describe('calcCompletionRateByType', () => {
  it('returns null rate when no sessions for a type', () => {
    const result = calcCompletionRateByType([])
    expect(result.every(r => r.rate === null)).toBe(true)
  })

  it('calculates completion rate excluding bonus sessions', () => {
    const today = new Date().toISOString().slice(0, 10)
    const sessions = [
      makeSession({ date: today, type: 'easy', status: 'completed' }),
      makeSession({ date: today, type: 'easy', status: 'planned' }),
      makeSession({ date: today, type: 'bonus', status: 'completed' }), // excluded
    ]
    const result = calcCompletionRateByType(sessions)
    const easyRow = result.find(r => r.type === 'easy')!
    expect(easyRow.rate).toBe(50) // 1 completed / 2 total easy
  })
})
