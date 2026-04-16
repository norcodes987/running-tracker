// __tests__/strava/sync-activity.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({ db: { query: {}, update: vi.fn(), select: vi.fn(), insert: vi.fn() } }))
vi.mock('@/lib/strava/client', () => ({
  fetchStravaActivity: vi.fn(),
  refreshStravaToken:  vi.fn(),
}))

import { db } from '@/lib/db'
import { fetchStravaActivity, refreshStravaToken } from '@/lib/strava/client'
import { syncStravaActivity } from '@/lib/strava/sync-activity'

const PROFILE = {
  id: 'prof-1', userId: 'user-1',
  stravaAccessToken: 'tok-abc', stravaRefreshToken: 'ref-xyz',
  stravaTokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
  stravaAthleteId: null, stravaAthleteName: null, stravaWebhookSubscriptionId: null,
  stravaLastSyncAt: null, maxHr: 185, age: 30, thresholdPaceSecPerKm: null,
  paceZones: null, hrZones: null, acwrBaseline: null, updatedAt: new Date(),
}

const ACTIVITY = {
  id: 123, type: 'Run',
  distance: 10200, moving_time: 3600,
  average_heartrate: 155, average_speed: 2.833,
  start_date: '2026-04-15T07:00:00Z',
}

const SESSION = {
  id: 'sess-1', userId: 'user-1', raceId: 'race-1',
  date: '2026-04-15', type: 'easy', distanceKm: 10,
  targetPaceSecPerKm: 390, targetHrZone: 'Z2', status: 'planned',
  actualDistanceKm: null, actualPaceSecPerKm: null, actualAvgHr: null,
  distanceScore: null, paceScore: null, qualityScore: null,
  stravaActivityId: null, notes: null, rescheduledFrom: null, createdAt: new Date(),
}

const RACE = {
  id: 'race-1', userId: 'user-1', status: 'active', name: 'Test Race',
  raceDate: '2026-10-01', distanceKm: 21.0975, goalTimeMinutes: 100,
  trainingStartDate: '2026-04-01', fitnessLevel: 'building',
  actualTimeMinutes: null, notes: null, completedAt: null, location: null, createdAt: new Date(),
}

function mockDb({
  profile = PROFILE,
  sessionForDedup = null as typeof SESSION | null,
  race = RACE as typeof RACE | null,
  sessions = [SESSION] as typeof SESSION[],
}: {
  profile?: typeof PROFILE | null
  sessionForDedup?: typeof SESSION | null
  race?: typeof RACE | null
  sessions?: typeof SESSION[]
} = {}) {
  const findFirst = vi.fn()
  findFirst
    .mockResolvedValueOnce(sessionForDedup)
    .mockResolvedValueOnce(profile)
    .mockResolvedValueOnce(race)

  const mockWhere  = vi.fn().mockResolvedValue(sessions)
  const mockFrom   = vi.fn().mockReturnValue({ where: mockWhere })
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom })

  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined)
  const mockSet         = vi.fn().mockReturnValue({ where: mockUpdateWhere })
  const mockUpdate      = vi.fn().mockReturnValue({ set: mockSet })

  const mockInsertValues = vi.fn().mockResolvedValue(undefined)
  const mockInsert       = vi.fn().mockReturnValue({ values: mockInsertValues })

  ;(db as any).query   = { trainingSessions: { findFirst }, userProfile: { findFirst }, races: { findFirst } }
  ;(db as any).select  = mockSelect
  ;(db as any).update  = mockUpdate
  ;(db as any).insert  = mockInsert

  return { findFirst, mockSelect, mockUpdate, mockSet, mockInsert, mockInsertValues }
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(fetchStravaActivity as any).mockResolvedValue(ACTIVITY)
})

describe('syncStravaActivity', () => {
  it('returns early if activity already synced (dedup guard)', async () => {
    const { mockUpdate } = mockDb({ sessionForDedup: { ...SESSION, stravaActivityId: '123' as any } })
    await syncStravaActivity('user-1', 123)
    expect(fetchStravaActivity).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('skips non-Run activity types', async () => {
    ;(fetchStravaActivity as any).mockResolvedValue({ ...ACTIVITY, type: 'Ride' })
    const { mockUpdate } = mockDb()
    await syncStravaActivity('user-1', 123)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('skips activities under 1.0 km', async () => {
    ;(fetchStravaActivity as any).mockResolvedValue({ ...ACTIVITY, distance: 800 })
    const { mockUpdate } = mockDb()
    await syncStravaActivity('user-1', 123)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('refreshes strava token when expiry is within 5 minutes', async () => {
    ;(refreshStravaToken as any).mockResolvedValue({
      access_token: 'new-tok', refresh_token: 'new-ref',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
    })
    mockDb({ profile: { ...PROFILE, stravaTokenExpiry: new Date(Date.now() + 2 * 60 * 1000) } })
    await syncStravaActivity('user-1', 123)
    expect(refreshStravaToken).toHaveBeenCalledWith('ref-xyz')
    expect(fetchStravaActivity).toHaveBeenCalledWith('new-tok', 123)
  })

  describe('matched session', () => {
    it('writes actuals with binary completion when actualKm >= plannedKm', async () => {
      // Activity: 10.2 km, Session planned: 10 km → completed
      const { mockSet } = mockDb()
      await syncStravaActivity('user-1', 123)
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({
          actualDistanceKm:   expect.closeTo(10.2, 1),
          actualPaceSecPerKm: expect.any(Number),
          actualAvgHr:        155,
          status:             'completed',
          stravaActivityId:   '123',
        }),
      )
    })

    it('sets status partial when actualKm < plannedKm', async () => {
      // Activity: 10.2 km, Session planned: 15 km → partial
      const bigSession = { ...SESSION, distanceKm: 15 }
      const { mockSet } = mockDb({ sessions: [bigSession] })
      await syncStravaActivity('user-1', 123)
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'partial' }),
      )
    })

    it('writes distanceScore as percentage of planned (capped 100)', async () => {
      // 10.2 / 10 * 100 = 102 → capped to 100
      const { mockSet } = mockDb()
      await syncStravaActivity('user-1', 123)
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ distanceScore: 100 }),
      )
    })

    it('does not overwrite a manually edited session', async () => {
      const manualSession = { ...SESSION, notes: '__manual__edited by user', status: 'completed' }
      const { mockUpdate } = mockDb({ sessions: [manualSession] })
      await syncStravaActivity('user-1', 123)
      // update called only once for stravaLastSyncAt (profile), not for the session
      expect(mockUpdate).toHaveBeenCalledTimes(1)
    })

    it('updates stravaLastSyncAt on the user profile', async () => {
      const { mockUpdate } = mockDb()
      await syncStravaActivity('user-1', 123)
      // update called twice: session actuals + profile sync timestamp
      expect(mockUpdate).toHaveBeenCalledTimes(2)
    })
  })

  describe('no matched session (bonus run)', () => {
    it('inserts a bonus session when no planned session within ±36h', async () => {
      // Session 8 days in future — no match
      const { mockInsert, mockInsertValues } = mockDb({
        sessions: [{ ...SESSION, date: '2026-04-23' }],
      })
      await syncStravaActivity('user-1', 123)
      expect(mockInsert).toHaveBeenCalled()
      expect(mockInsertValues).toHaveBeenCalledWith(
        expect.objectContaining({
          type:             'bonus',
          status:           'completed',
          stravaActivityId: '123',
        }),
      )
    })

    it('inserts bonus session when sessions array is empty', async () => {
      const { mockInsert } = mockDb({ sessions: [] })
      await syncStravaActivity('user-1', 123)
      expect(mockInsert).toHaveBeenCalled()
    })
  })
})
