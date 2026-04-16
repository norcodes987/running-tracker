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
    const { mockUpdate } = mockDb({ sessionForDedup: { ...SESSION, stravaActivityId: '123' } })
    await syncStravaActivity('user-1', 123)
    expect(fetchStravaActivity).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('returns early if no matching planned session found within ±36h', async () => {
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

  it('logs orchestrator stub when quality score < 85', async () => {
    ;(calculateQualityScore as any).mockReturnValue({
      distanceScore: 50, paceScore: 50, qualityScore: 50, status: 'failed',
    })
    mockDb()
    const consoleSpy = vi.spyOn(console, 'log')
    await syncStravaActivity('user-1', 123)
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[orchestrator] stub'),
      expect.any(String),
      expect.stringContaining('quality:'),
      50,
    )
  })

  it('does not log orchestrator stub when quality score >= 85', async () => {
    mockDb()
    const consoleSpy = vi.spyOn(console, 'log')
    await syncStravaActivity('user-1', 123)
    const orchestratorCalls = consoleSpy.mock.calls.filter(c =>
      String(c[0]).includes('[orchestrator]'),
    )
    expect(orchestratorCalls).toHaveLength(0)
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
})
