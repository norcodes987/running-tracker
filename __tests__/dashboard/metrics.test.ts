// __tests__/dashboard/metrics.test.ts
import { describe, it, expect } from 'vitest'
import {
  calcWeeklyDistance,
  calcEstimatedFinish,
  calcAvgPaceByType,
  calcCompletionRateByType,
  type DashboardSession,
} from '@/lib/dashboard/metrics'
import type { TrainingPaces } from '@/lib/training/pace-calculator'

const TARGET_PACES: TrainingPaces = {
  race_pace: 300, tempo: 336, long_run: 375, easy: 390, interval: 279, recovery: 435,
}

// Build a session at a fixed date relative to today
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

  it('sums target km for non-rest planned sessions this week', () => {
    const today = new Date().toISOString().slice(0, 10)
    const sessions = [
      makeSession({ date: today, type: 'easy', distanceKm: 8, status: 'planned' }),
      makeSession({ date: today, type: 'rest', distanceKm: 0, status: 'planned' }),
    ]
    const { targetKm } = calcWeeklyDistance(sessions)
    expect(targetKm).toBe(8)
  })

  it('sums actual km for completed/partial sessions this week', () => {
    const today = new Date().toISOString().slice(0, 10)
    const sessions = [
      makeSession({ date: today, status: 'completed', actualDistanceKm: 7.8 }),
      makeSession({ date: today, status: 'partial', actualDistanceKm: 4.0 }),
      makeSession({ date: today, status: 'planned', actualDistanceKm: null }),
    ]
    const { actualKm } = calcWeeklyDistance(sessions)
    expect(actualKm).toBeCloseTo(11.8)
  })
})

describe('calcEstimatedFinish', () => {
  it('returns goal time as estimate when no actuals', () => {
    const { confidence } = calcEstimatedFinish([], 21.1, 100, TARGET_PACES)
    expect(confidence).toBeNull()
  })

  it('confidence is HIGH when all 3 types have actuals in last 28 days', () => {
    const today = new Date().toISOString().slice(0, 10)
    const sessions = [
      makeSession({ date: today, type: 'long_run',  status: 'completed', actualPaceSecPerKm: 375 }),
      makeSession({ date: today, type: 'race_pace', status: 'completed', actualPaceSecPerKm: 300 }),
      makeSession({ date: today, type: 'tempo',     status: 'completed', actualPaceSecPerKm: 336 }),
    ]
    const { confidence } = calcEstimatedFinish(sessions, 21.1, 100, TARGET_PACES)
    expect(confidence).toBe('HIGH')
  })

  it('computes estimate using blend formula', () => {
    const today = new Date().toISOString().slice(0, 10)
    // blend = (375×0.40) + (300×0.35) + (336×0.25) = 150+105+84 = 339
    // estMinutes = (339 × 21.1 / 60) × 0.97 ≈ 115.7
    const sessions = [
      makeSession({ date: today, type: 'long_run',  status: 'completed', actualPaceSecPerKm: 375 }),
      makeSession({ date: today, type: 'race_pace', status: 'completed', actualPaceSecPerKm: 300 }),
      makeSession({ date: today, type: 'tempo',     status: 'completed', actualPaceSecPerKm: 336 }),
    ]
    const { estMinutes } = calcEstimatedFinish(sessions, 21.1, 100, TARGET_PACES)
    expect(estMinutes).toBeCloseTo(115.7, 0)
  })
})

describe('calcAvgPaceByType', () => {
  it('returns null actualSecPerKm when no completed sessions', () => {
    const rows = calcAvgPaceByType([], TARGET_PACES)
    expect(rows.every(r => r.actualSecPerKm === null)).toBe(true)
  })

  it('returns target paces from TARGET_PACES', () => {
    const rows = calcAvgPaceByType([], TARGET_PACES)
    const easyRow = rows.find(r => r.type === 'easy')!
    expect(easyRow.targetSecPerKm).toBe(390)
  })
})

describe('calcCompletionRateByType', () => {
  it('returns null rate when no sessions', () => {
    const rows = calcCompletionRateByType([])
    expect(rows.every(r => r.rate === null)).toBe(true)
  })

  it('calculates rate as percentage of past sessions completed', () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
    const sessions = [
      makeSession({ date: yesterday, type: 'easy', status: 'completed' }),
      makeSession({ date: yesterday, type: 'easy', status: 'completed' }),
      makeSession({ date: yesterday, type: 'easy', status: 'failed' }),
      makeSession({ date: yesterday, type: 'easy', status: 'failed' }),
    ]
    const rows = calcCompletionRateByType(sessions)
    const easyRow = rows.find(r => r.type === 'easy')!
    expect(easyRow.rate).toBe(50)
  })
})

describe('calcCompletionRateByType — streak', () => {
  it('counts consecutive weeks below 70%', () => {
    // Two weeks ago (Mon-Sun): 0/2 = 0%
    // Last week: 0/2 = 0%
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10)
    const lastWeek    = new Date(Date.now() - 7  * 86400000).toISOString().slice(0, 10)
    const sessions = [
      makeSession({ date: twoWeeksAgo, type: 'easy', status: 'failed' }),
      makeSession({ date: twoWeeksAgo, type: 'easy', status: 'failed' }),
      makeSession({ date: lastWeek,    type: 'easy', status: 'failed' }),
      makeSession({ date: lastWeek,    type: 'easy', status: 'failed' }),
    ]
    const rows = calcCompletionRateByType(sessions)
    const easyRow = rows.find(r => r.type === 'easy')!
    expect(easyRow.consecutiveWeeksBelow70).toBeGreaterThanOrEqual(2)
  })
})

describe('calcAvgPaceByType — trend', () => {
  it('returns ↑ trend when recent pace is more than 5s/km faster', () => {
    const recent  = new Date(Date.now() - 3  * 86400000).toISOString().slice(0, 10) // 3 days ago
    const older   = new Date(Date.now() - 21 * 86400000).toISOString().slice(0, 10) // 21 days ago
    const sessions = [
      makeSession({ date: recent, type: 'easy', status: 'completed', actualPaceSecPerKm: 350 }),
      makeSession({ date: older,  type: 'easy', status: 'completed', actualPaceSecPerKm: 370 }),
    ]
    const rows = calcAvgPaceByType(sessions, TARGET_PACES)
    const easyRow = rows.find(r => r.type === 'easy')!
    expect(easyRow.trend).toBe('↑')
  })
})
