// __tests__/strava/sync-activity.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock DB
vi.mock('@/lib/db', () => ({ db: { query: {}, update: vi.fn(), select: vi.fn() } }))
vi.mock('@/lib/strava/client', () => ({
  fetchStravaActivity: vi.fn(),
  refreshStravaToken:  vi.fn(),
}))
vi.mock('@/lib/training/quality-score', () => ({
  calculateQualityScore: vi.fn(),
}))

import { db } from '@/lib/db'
import { fetchStravaActivity, refreshStravaToken } from '@/lib/strava/client'
import { calculateQualityScore } from '@/lib/training/quality-score'
import { syncStravaActivity } from '@/lib/strava/sync-activity'

// Baseline mock data
const PROFILE = {
  id:                 'prof-1',
  userId:             'user-1',
  stravaAccessToken:  'tok-abc',
  stravaRefreshToken: 'ref-xyz',
  stravaTokenExpiry:  new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
  stravaAthleteId:    null,
  stravaAthleteName:  null,
  stravaWebhookSubscriptionId: null,
  stravaLastSyncAt:   null,
  maxHr: 185, age: 30, thresholdPaceSecPerKm: null,
  paceZones: null, hrZones: null, acwrBaseline: null,
  updatedAt: new Date(),
}

const ACTIVITY = {
  id:                123,
  type:              'Run',
  distance:          10200,       // 10.2 km in metres
  moving_time:       3600,        // seconds
  average_heartrate: 155,
  average_speed:     2.833,       // m/s → ~353 sec/km
  start_date:        '2026-04-15T07:00:00Z',
}

const SESSION = {
  id:                 'sess-1',
  userId:             'user-1',
  raceId:             'race-1',
  date:               '2026-04-15',
  type:               'easy',
  distanceKm:         10,
  targetPaceSecPerKm: 390,
  targetHrZone:       'Z2',
  status:             'planned',
  actualDistanceKm:   null,
  actualPaceSecPerKm: null,
  actualAvgHr:        null,
  distanceScore:      null,
  paceScore:          null,
  qualityScore:       null,
  stravaActivityId:   null,
  notes:              null,
  rescheduledFrom:    null,
  createdAt:          new Date(),
}

const RACE = {
  id: 'race-1', userId: 'user-1', status: 'active',
  name: 'Test Race', raceDate: '2026-10-01',
  distanceKm: 21.0975, goalTimeMinutes: 100,
  trainingStartDate: '2026-04-01', fitnessLevel: 'building',
  actualTimeMinutes: null, notes: null, completedAt: null, location: null,
  createdAt: new Date(),
}

// Helper: set up a DB mock that returns given data
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
  // Call order: 1=dedup check, 2=profile, 3=race
  findFirst
    .mockResolvedValueOnce(sessionForDedup)  // dedup: existing session with stravaActivityId
    .mockResolvedValueOnce(profile)           // profile lookup
    .mockResolvedValueOnce(race)              // active race

  // select().from().where() chain for session matching
  const mockWhere = vi.fn().mockResolvedValue(sessions)
  const mockFrom  = vi.fn().mockReturnValue({ where: mockWhere })
  const mockSelect = vi.fn().mockReturnValue({ from: mockFrom })

  // update().set().where() chain for writing actuals
  const mockUpdateWhere = vi.fn().mockResolvedValue(undefined)
  const mockSet         = vi.fn().mockReturnValue({ where: mockUpdateWhere })
  const mockUpdate      = vi.fn().mockReturnValue({ set: mockSet })

  ;(db as any).query = {
    trainingSessions: { findFirst },
    userProfile:      { findFirst },
    races:            { findFirst },
  }
  ;(db as any).select = mockSelect
  ;(db as any).update = mockUpdate

  return { findFirst, mockSelect, mockUpdate, mockSet, mockUpdateWhere }
}

beforeEach(() => {
  vi.clearAllMocks()
  ;(fetchStravaActivity as any).mockResolvedValue(ACTIVITY)
  ;(calculateQualityScore as any).mockReturnValue({
    distanceScore: 90,
    paceScore:     85,
    qualityScore:  88,
    status:        'completed',
  })
})

describe('syncStravaActivity', () => {
  it('returns early if activity already synced (dedup guard)', async () => {
    const { mockUpdate } = mockDb({ sessionForDedup: { ...SESSION, stravaActivityId: '123' as any } })
    await syncStravaActivity('user-1', 123)
    expect(fetchStravaActivity).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns early if no session found within ±36h or 7-day fallback', async () => {
    // Session is 5 days away from the activity date
    const farSession = { ...SESSION, date: '2026-04-20' }
    const { mockUpdate } = mockDb({ sessions: [farSession] })
    await syncStravaActivity('user-1', 123)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('writes actuals and quality score to the matched session', async () => {
    const { mockSet, mockUpdateWhere } = mockDb()
    await syncStravaActivity('user-1', 123)

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        actualDistanceKm:   expect.closeTo(10.2, 1),
        actualPaceSecPerKm: expect.any(Number),
        actualAvgHr:        155,
        distanceScore:      90,
        paceScore:          85,
        qualityScore:       88,
        status:             'completed',
        stravaActivityId:   '123',
      }),
    )
    expect(mockUpdateWhere).toHaveBeenCalled()
  })

  it('updates stravaLastSyncAt on the user profile', async () => {
    const { mockUpdate } = mockDb()
    await syncStravaActivity('user-1', 123)

    // update is called twice: once for session, once for profile
    expect(mockUpdate).toHaveBeenCalledTimes(2)
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
      access_token:  'new-tok',
      refresh_token: 'new-ref',
      expires_at:    Math.floor(Date.now() / 1000) + 3600,
    })
    const expiredProfile = {
      ...PROFILE,
      stravaTokenExpiry: new Date(Date.now() + 2 * 60 * 1000), // expires in 2 min
    }
    mockDb({ profile: expiredProfile })
    await syncStravaActivity('user-1', 123)
    expect(refreshStravaToken).toHaveBeenCalledWith('ref-xyz')
    expect(fetchStravaActivity).toHaveBeenCalledWith('new-tok', 123)
  })

  describe('fallback matching (7-day window)', () => {
    it('matches a planned session 3 days before the activity when no ±36h match', async () => {
      // Activity: 2026-04-15T07:00:00Z  Session: 2026-04-12 (3 days prior, 75h away — outside ±36h)
      const missedSession = { ...SESSION, id: 'sess-missed', date: '2026-04-12' }
      const { mockSet } = mockDb({ sessions: [missedSession] })
      await syncStravaActivity('user-1', 123)
      expect(mockSet).toHaveBeenCalledWith(
        expect.objectContaining({ stravaActivityId: '123' }),
      )
    })

    it('does not match a session 8 days before the activity', async () => {
      // 2026-04-07 is 8 days before 2026-04-15 — outside 7-day window
      const oldSession = { ...SESSION, id: 'sess-old', date: '2026-04-07' }
      const { mockUpdate } = mockDb({ sessions: [oldSession] })
      await syncStravaActivity('user-1', 123)
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('does not match a future session via fallback', async () => {
      // Sessions scheduled after the activity date are not missed — they are upcoming
      const futureSession = { ...SESSION, id: 'sess-future', date: '2026-04-17' }
      const { mockUpdate } = mockDb({ sessions: [futureSession] })
      await syncStravaActivity('user-1', 123)
      expect(mockUpdate).not.toHaveBeenCalled()
    })

    it('picks the most recent missed session when two are within 7 days', async () => {
      // Both outside ±36h, both within 7 days — 2026-04-13 is more recent than 2026-04-11
      const older  = { ...SESSION, id: 'sess-older',  date: '2026-04-11', distanceKm: 5 }
      const recent = { ...SESSION, id: 'sess-recent', date: '2026-04-13', distanceKm: 8 }
      mockDb({ sessions: [older, recent] })
      await syncStravaActivity('user-1', 123)
      // calculateQualityScore is called with the matched session's plannedKm
      // If most-recent logic is correct, plannedKm should be 8 (from 2026-04-13 session)
      expect(calculateQualityScore).toHaveBeenCalledWith(
        expect.objectContaining({ plannedKm: 8 }),
      )
    })

    it('does not match when sessions array is empty (partial/completed excluded by DB query)', async () => {
      // In production the DB query filters status='planned', so partial/completed sessions
      // are never in allSessions. Simulate this by providing an empty sessions array.
      const { mockUpdate } = mockDb({ sessions: [] })
      await syncStravaActivity('user-1', 123)
      expect(mockUpdate).not.toHaveBeenCalled()
    })
  })
})
