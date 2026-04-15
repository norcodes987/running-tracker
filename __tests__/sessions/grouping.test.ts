// __tests__/sessions/grouping.test.ts
import { describe, it, expect } from 'vitest'
import { groupSessionsByWeek, type RawSession } from '@/lib/sessions/queries'

function makeSession(overrides: Partial<RawSession>): RawSession {
  return {
    id: 'x',
    date: '2026-04-14',
    type: 'easy',
    distanceKm: 8,
    targetPaceSecPerKm: 390,
    targetHrZone: null,
    status: 'planned',
    actualDistanceKm: null,
    actualPaceSecPerKm: null,
    actualAvgHr: null,
    distanceScore: null,
    paceScore: null,
    qualityScore: null,
    notes: null,
    rescheduledFrom: null,
    planChanges: [],
    ...overrides,
  }
}

describe('groupSessionsByWeek', () => {
  it('assigns week 1 to session on training start date', () => {
    const sessions = [makeSession({ date: '2026-04-14' })]
    const groups = groupSessionsByWeek(sessions, '2026-04-14')
    expect(groups[0].weekNumber).toBe(1)
  })

  it('assigns week 2 to session 7 days after start', () => {
    const sessions = [makeSession({ date: '2026-04-21' })]
    const groups = groupSessionsByWeek(sessions, '2026-04-14')
    expect(groups[0].weekNumber).toBe(2)
  })

  it('groups multiple sessions in same week together', () => {
    const sessions = [
      makeSession({ date: '2026-04-14' }),
      makeSession({ date: '2026-04-16' }),
      makeSession({ date: '2026-04-21' }),
    ]
    const groups = groupSessionsByWeek(sessions, '2026-04-14')
    expect(groups).toHaveLength(2)
    expect(groups[0].sessions).toHaveLength(2)
    expect(groups[1].sessions).toHaveLength(1)
  })

  it('marks the current week with isCurrentWeek=true', () => {
    const today = new Date().toISOString().slice(0, 10)
    const oneYearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)
    const sessions = [makeSession({ date: today })]
    const groups = groupSessionsByWeek(sessions, oneYearAgo)
    const currentGroup = groups.find(g => g.isCurrentWeek)
    expect(currentGroup).toBeDefined()
  })

  it('sums planned km for week header', () => {
    const sessions = [
      makeSession({ date: '2026-04-14', distanceKm: 10 }),
      makeSession({ date: '2026-04-16', distanceKm: 5 }),
    ]
    const groups = groupSessionsByWeek(sessions, '2026-04-14')
    expect(groups[0].plannedKm).toBeCloseTo(15)
  })

  it('formats week label correctly', () => {
    const sessions = [makeSession({ date: '2026-04-14' })]
    const groups = groupSessionsByWeek(sessions, '2026-04-14')
    // "Week 1 · Apr 14–19" — trainingStartDate Mon Apr 14
    expect(groups[0].weekLabel).toMatch(/Week 1/)
    expect(groups[0].weekLabel).toMatch(/Apr/)
  })
})
