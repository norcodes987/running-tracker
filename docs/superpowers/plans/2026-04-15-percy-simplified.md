# Percy Simplified — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace auto-generated training plan, quality-score system, and makeup matching with CSV-uploaded plan, binary completion, and simplified dashboard.

**Architecture:** No schema migration — existing `training_sessions` table is reused. Extra Strava runs are stored as `type = 'bonus'`. All calculations use Strava actuals only; CSV target pace and profile pace zones are display references. The workouts page gains a two-section layout (Training Plan / Extra Runs) and a CSV upload button.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Drizzle ORM, Neon DB, Vitest, Tailwind CSS v4

**Working directory:** `/workspace/running-tracker/.worktrees/phase-3-strava`

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `lib/training/parse-csv.ts` | **Create** | Pure CSV parser — date, type, km, target_pace |
| `app/api/races/[id]/plan/route.ts` | **Create** | POST: parse CSV, replace planned sessions |
| `app/api/sessions/[id]/route.ts` | **Create** | PATCH: manual override for actual distance/pace |
| `components/workouts/PlanUploadButton.tsx` | **Create** | Client component — file picker, POST to plan API |
| `components/workouts/BonusRunsList.tsx` | **Create** | Renders extra Strava runs below plan |
| `components/profile/PaceSettings.tsx` | **Create** | Editable pace zones per type |
| `lib/strava/sync-activity.ts` | **Modify** | Remove makeup matching; add bonus insert; binary completion; manual override guard |
| `lib/dashboard/metrics.ts` | **Modify** | Remove estFinish; exclude bonus from targetKm; add bonus row to avgPace; update signature |
| `lib/dashboard/queries.ts` | **Modify** | Include bonus sessions (already does — no change needed) |
| `lib/sessions/queries.ts` | **Modify** | Filter bonus out of plan query; add getBonusSessions |
| `app/(app)/dashboard/page.tsx` | **Modify** | Remove EstimatedFinishWidget; pass paceZones to calcAvgPaceByType |
| `app/(app)/workouts/page.tsx` | **Modify** | Two-section layout; add PlanUploadButton + BonusRunsList |
| `components/workouts/SessionCard.tsx` | **Modify** | Show actual km/pace; add inline manual edit |
| `app/(app)/profile/page.tsx` | **Modify** | Add PaceSettings; remove GarminUploadForm |
| `app/api/profile/route.ts` | **Modify** | Add paceZones PATCH; remove garmin logic; remove auto-recalc |
| `__tests__/strava/sync-activity.test.ts` | **Modify** | Remove quality-score mock; add bonus insert tests; add manual override guard test |
| `__tests__/dashboard/metrics.test.ts` | **Modify** | Remove estFinish tests; add bonus row test; update avgPace signature |
| `__tests__/training/parse-csv.test.ts` | **Create** | Unit tests for CSV parser |
| `README.md` | **Modify** | Update to reflect simplified feature set |

---

## Task 1: CSV Parser

**Files:**
- Create: `lib/training/parse-csv.ts`
- Create: `__tests__/training/parse-csv.test.ts`

- [ ] **Step 1: Write failing tests**

Create `__tests__/training/parse-csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parsePlanCsv } from '@/lib/training/parse-csv'

const VALID_CSV = `date,type,km,target_pace
16 Apr,tempo,7.0,5:18
18 Apr,long_run,13.7,5:55
19 Apr,easy,2.9,6:09
21 Apr,interval,4.7,4:24
24 May,race_pace,7.8,4:44`

describe('parsePlanCsv', () => {
  it('parses valid CSV into session objects', () => {
    const result = parsePlanCsv(VALID_CSV, 2026)
    expect(result).toHaveLength(5)
    expect(result[0]).toEqual({
      date: '2026-04-16',
      type: 'tempo',
      distanceKm: 7.0,
      targetPaceSecPerKm: 318, // 5*60+18
    })
  })

  it('parses YYYY-MM-DD dates without year param', () => {
    const csv = `date,type,km,target_pace\n2026-04-16,easy,8.0,6:05`
    const result = parsePlanCsv(csv, 2026)
    expect(result[0].date).toBe('2026-04-16')
  })

  it('converts target_pace mm:ss to seconds', () => {
    const csv = `date,type,km,target_pace\n16 Apr,easy,8.0,6:09`
    const result = parsePlanCsv(csv, 2026)
    expect(result[0].targetPaceSecPerKm).toBe(369) // 6*60+9
  })

  it('throws on unknown session type', () => {
    const csv = `date,type,km,target_pace\n16 Apr,swim,8.0,5:00`
    expect(() => parsePlanCsv(csv, 2026)).toThrow('unknown type')
  })

  it('throws on missing required column', () => {
    const csv = `date,type,km\n16 Apr,easy,8.0`
    expect(() => parsePlanCsv(csv, 2026)).toThrow('columns')
  })

  it('throws when CSV has only a header row', () => {
    const csv = `date,type,km,target_pace`
    expect(() => parsePlanCsv(csv, 2026)).toThrow('at least one data row')
  })

  it('skips blank lines', () => {
    const csv = `date,type,km,target_pace\n16 Apr,easy,8.0,6:09\n\n18 Apr,tempo,7.0,5:18`
    const result = parsePlanCsv(csv, 2026)
    expect(result).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /workspace/running-tracker/.worktrees/phase-3-strava
npx vitest run __tests__/training/parse-csv.test.ts
```

Expected: all 7 tests fail with "Cannot find module".

- [ ] **Step 3: Implement the parser**

Create `lib/training/parse-csv.ts`:

```ts
// lib/training/parse-csv.ts

export type ParsedSession = {
  date:               string  // YYYY-MM-DD
  type:               string
  distanceKm:         number
  targetPaceSecPerKm: number
}

const VALID_TYPES = new Set(['easy', 'tempo', 'interval', 'long_run', 'race_pace'])

function parsePace(paceStr: string): number {
  const clean = paceStr.trim().replace(/\s*\/km\s*/i, '')
  const [min, sec] = clean.split(':').map(Number)
  if (isNaN(min) || isNaN(sec)) throw new Error(`Invalid pace: "${paceStr}"`)
  return min * 60 + sec
}

function parseDate(dateStr: string, year: number): string {
  const clean = dateStr.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean
  const d = new Date(`${clean} ${year}`)
  if (isNaN(d.getTime())) throw new Error(`Invalid date: "${dateStr}"`)
  return d.toISOString().slice(0, 10)
}

export function parsePlanCsv(csvText: string, year: number): ParsedSession[] {
  const lines = csvText.trim().split(/\r?\n/)
  if (lines.length < 2) throw new Error('CSV must have a header and at least one data row')

  const header = lines[0].toLowerCase().split(',').map(h => h.trim())
  const dateIdx = header.indexOf('date')
  const typeIdx = header.indexOf('type')
  const kmIdx   = header.findIndex(h => h === 'km' || h === 'distance_km' || h === 'distance')
  const paceIdx = header.findIndex(h => h.includes('pace'))

  if ([dateIdx, typeIdx, kmIdx, paceIdx].some(i => i === -1)) {
    throw new Error('CSV must have columns: date, type, km, target_pace')
  }

  return lines
    .slice(1)
    .filter(line => line.trim() !== '')
    .map((line, i) => {
      const cols = line.split(',').map(c => c.trim())
      const type = cols[typeIdx].toLowerCase()
      if (!VALID_TYPES.has(type)) {
        throw new Error(`Row ${i + 2}: unknown type "${cols[typeIdx]}". Valid: ${[...VALID_TYPES].join(', ')}`)
      }
      return {
        date:               parseDate(cols[dateIdx], year),
        type,
        distanceKm:         parseFloat(cols[kmIdx]),
        targetPaceSecPerKm: parsePace(cols[paceIdx]),
      }
    })
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
npx vitest run __tests__/training/parse-csv.test.ts
```

Expected: 7/7 pass.

- [ ] **Step 5: Commit**

```bash
git add lib/training/parse-csv.ts __tests__/training/parse-csv.test.ts
git commit -m "feat: CSV plan parser"
```

---

## Task 2: CSV Upload API Route

**Files:**
- Create: `app/api/races/[id]/plan/route.ts`

- [ ] **Step 1: Write failing test**

Add to `__tests__/training/parse-csv.test.ts` (at the end):

```ts
// Verify the parser handles real-world target_pace with /km suffix
it('handles target_pace with /km suffix', () => {
  const csv = `date,type,km,target_pace\n16 Apr,easy,8.0,6:09 /km`
  const result = parsePlanCsv(csv, 2026)
  expect(result[0].targetPaceSecPerKm).toBe(369)
})
```

- [ ] **Step 2: Run — should pass (the `/km` strip is already in parsePace)**

```bash
npx vitest run __tests__/training/parse-csv.test.ts
```

Expected: 8/8 pass.

- [ ] **Step 3: Create the API route**

Create `app/api/races/[id]/plan/route.ts`:

```ts
// app/api/races/[id]/plan/route.ts
import { NextResponse }      from 'next/server'
import { auth }              from '@/lib/auth'
import { db }                from '@/lib/db'
import { races, trainingSessions } from '@/lib/db/schema'
import { eq, and }           from 'drizzle-orm'
import { parsePlanCsv }      from '@/lib/training/parse-csv'

export async function POST(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id
  const raceId = params.id

  // Verify race belongs to user
  const race = await db.query.races.findFirst({
    where: and(eq(races.id, raceId), eq(races.userId, userId)),
  })
  if (!race) {
    return NextResponse.json({ error: 'Race not found' }, { status: 404 })
  }

  // Parse multipart form
  let csvText: string
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    csvText = await (file as File).text()
  } catch {
    return NextResponse.json({ error: 'Failed to read file' }, { status: 400 })
  }

  // Parse CSV
  let parsed: ReturnType<typeof parsePlanCsv>
  try {
    const raceYear = new Date(race.raceDate).getUTCFullYear()
    parsed = parsePlanCsv(csvText, raceYear)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid CSV' },
      { status: 422 },
    )
  }

  // Delete existing planned sessions for this race
  await db
    .delete(trainingSessions)
    .where(
      and(
        eq(trainingSessions.raceId, raceId),
        eq(trainingSessions.userId, userId),
        eq(trainingSessions.status, 'planned'),
      ),
    )

  // Insert new sessions
  if (parsed.length > 0) {
    await db.insert(trainingSessions).values(
      parsed.map(s => ({
        userId,
        raceId,
        date:               s.date,
        type:               s.type,
        distanceKm:         s.distanceKm,
        targetPaceSecPerKm: s.targetPaceSecPerKm,
        status:             'planned' as const,
      })),
    )
  }

  return NextResponse.json({ inserted: parsed.length })
}
```

- [ ] **Step 4: Run full test suite — no regressions**

```bash
npx vitest run
```

Expected: all existing tests pass (this is a new file, no existing tests break).

- [ ] **Step 5: Commit**

```bash
git add app/api/races/\[id\]/plan/route.ts
git commit -m "feat: POST /api/races/[id]/plan — CSV upload"
```

---

## Task 3: Simplify Strava Sync

Replace quality-score logic with binary completion. Remove 7-day fallback. Add bonus insert. Add manual override guard.

**Files:**
- Modify: `lib/strava/sync-activity.ts`
- Modify: `__tests__/strava/sync-activity.test.ts`

- [ ] **Step 1: Write new/updated tests**

Replace the full content of `__tests__/strava/sync-activity.test.ts`:

```ts
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
      const sessionUpdateCalls = (mockUpdate as any).mock.calls.filter(
        (call: unknown[]) => call.length > 0,
      )
      // The profile update still runs, so mockUpdate is called once
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
```

- [ ] **Step 2: Run tests — many should fail (bonus insert not wired yet)**

```bash
npx vitest run __tests__/strava/sync-activity.test.ts
```

Expected: dedup, skip Ride, skip <1km, token refresh tests pass; matched/bonus tests fail.

- [ ] **Step 3: Rewrite sync-activity.ts**

Replace the full content of `lib/strava/sync-activity.ts`:

```ts
// lib/strava/sync-activity.ts
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { trainingSessions, userProfile, races } from '@/lib/db/schema'
import {
  fetchStravaActivity,
  refreshStravaToken,
  type StravaActivity,
} from '@/lib/strava/client'

const WINDOW_MS = 36 * 60 * 60 * 1000 // ±36 hours

async function ensureFreshToken(
  userId: string,
  accessToken: string,
  refreshToken: string,
  tokenExpiry: Date | null,
): Promise<string> {
  const expiresAt = tokenExpiry?.getTime() ?? 0
  const fiveMin   = 5 * 60 * 1000
  if (Date.now() < expiresAt - fiveMin) return accessToken

  const tokens = await refreshStravaToken(refreshToken)
  await db
    .update(userProfile)
    .set({
      stravaAccessToken:  tokens.access_token,
      stravaRefreshToken: tokens.refresh_token,
      stravaTokenExpiry:  new Date(tokens.expires_at * 1000),
    })
    .where(eq(userProfile.userId, userId))
  return tokens.access_token
}

function metresToKm(metres: number): number {
  return metres / 1000
}

function speedToSecPerKm(speedMs: number): number {
  return speedMs > 0 ? Math.round(1000 / speedMs) : 0
}

export async function syncStravaActivity(
  userId: string,
  stravaActivityId: number,
): Promise<void> {
  // 1. Dedup guard
  const existing = await db.query.trainingSessions.findFirst({
    where: and(
      eq(trainingSessions.userId, userId),
      eq(trainingSessions.stravaActivityId, String(stravaActivityId)),
    ),
  })
  if (existing) return

  // 2. Load profile (tokens)
  const profile = await db.query.userProfile.findFirst({
    where: eq(userProfile.userId, userId),
  })
  if (!profile?.stravaAccessToken || !profile.stravaRefreshToken) return

  // 3. Get valid access token
  const accessToken = await ensureFreshToken(
    userId,
    profile.stravaAccessToken,
    profile.stravaRefreshToken,
    profile.stravaTokenExpiry ?? null,
  )

  // 4. Fetch activity from Strava
  const activity: StravaActivity = await fetchStravaActivity(accessToken, stravaActivityId)

  // 5. Filter: Run only, ≥1.0 km
  if (activity.type !== 'Run' && activity.type !== 'VirtualRun') return
  const activityKm = metresToKm(activity.distance)
  if (activityKm < 1.0) return

  // 6. Get active race
  const race = await db.query.races.findFirst({
    where: and(eq(races.userId, userId), eq(races.status, 'active')),
  })
  if (!race) return

  // 7. Match to nearest planned session within ±36h
  const activityTime = new Date(activity.start_date).getTime()
  const allSessions  = await db
    .select()
    .from(trainingSessions)
    .where(
      and(
        eq(trainingSessions.userId, userId),
        eq(trainingSessions.raceId, race.id),
        eq(trainingSessions.status, 'planned'),
      ),
    )

  const candidates = allSessions.filter((s) => {
    const sessionTime = new Date(s.date + 'T00:00:00Z').getTime()
    return Math.abs(sessionTime - activityTime) <= WINDOW_MS
  })

  const matched = candidates.length > 0
    ? candidates.reduce((nearest, s) => {
        const sDiff = Math.abs(new Date(s.date + 'T00:00:00Z').getTime() - activityTime)
        const nDiff = Math.abs(new Date(nearest.date + 'T00:00:00Z').getTime() - activityTime)
        return sDiff < nDiff ? s : nearest
      })
    : undefined

  const activityPaceSec = speedToSecPerKm(activity.average_speed)
  const avgHr = activity.average_heartrate ? Math.round(activity.average_heartrate) : null

  if (!matched) {
    // 8a. No plan match — insert as bonus session
    await db.insert(trainingSessions).values({
      userId,
      raceId:             race.id,
      date:               activity.start_date.slice(0, 10),
      type:               'bonus',
      distanceKm:         activityKm,
      status:             'completed',
      actualDistanceKm:   activityKm,
      actualPaceSecPerKm: activityPaceSec,
      actualAvgHr:        avgHr,
      stravaActivityId:   String(stravaActivityId),
    })
  } else {
    // 8b. Manual override guard — skip actuals write if user overrode this session
    if (!matched.notes?.startsWith('__manual__')) {
      const distanceScore = Math.min(100, Math.round((activityKm / matched.distanceKm) * 100))
      const status = activityKm >= matched.distanceKm ? 'completed' : 'partial'

      await db
        .update(trainingSessions)
        .set({
          actualDistanceKm:   activityKm,
          actualPaceSecPerKm: activityPaceSec,
          actualAvgHr:        avgHr,
          distanceScore,
          status,
          stravaActivityId:   String(stravaActivityId),
        })
        .where(eq(trainingSessions.id, matched.id))
    }
  }

  // 9. Update last sync timestamp
  await db
    .update(userProfile)
    .set({ stravaLastSyncAt: new Date() })
    .where(eq(userProfile.userId, userId))
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
npx vitest run __tests__/strava/sync-activity.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: all tests pass (the quality-score tests are unaffected — `lib/training/quality-score.ts` still exists).

- [ ] **Step 6: Commit**

```bash
git add lib/strava/sync-activity.ts __tests__/strava/sync-activity.test.ts
git commit -m "feat: simplified sync — binary completion, bonus insert, manual guard"
```

---

## Task 4: Manual Override API

**Files:**
- Create: `app/api/sessions/[id]/route.ts`

- [ ] **Step 1: Create the route**

Create `app/api/sessions/[id]/route.ts`:

```ts
// app/api/sessions/[id]/route.ts
import { NextResponse } from 'next/server'
import { auth }         from '@/lib/auth'
import { db }           from '@/lib/db'
import { trainingSessions } from '@/lib/db/schema'
import { eq, and }      from 'drizzle-orm'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  let body: { actualDistanceKm?: unknown; actualPaceSecPerKm?: unknown }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (typeof body.actualDistanceKm !== 'number' || typeof body.actualPaceSecPerKm !== 'number') {
    return NextResponse.json(
      { error: 'actualDistanceKm and actualPaceSecPerKm must be numbers' },
      { status: 400 },
    )
  }

  const existing = await db.query.trainingSessions.findFirst({
    where: and(
      eq(trainingSessions.id, params.id),
      eq(trainingSessions.userId, userId),
    ),
  })
  if (!existing) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const { actualDistanceKm, actualPaceSecPerKm } = body as { actualDistanceKm: number; actualPaceSecPerKm: number }

  // Binary completion (bonus sessions always stay completed)
  const status = existing.type === 'bonus' || actualDistanceKm >= existing.distanceKm
    ? 'completed'
    : 'partial'

  const distanceScore = existing.type === 'bonus'
    ? 100
    : Math.min(100, Math.round((actualDistanceKm / existing.distanceKm) * 100))

  // Preserve existing notes beyond the __manual__ prefix
  const prevNotes = existing.notes?.replace(/^__manual__/, '') ?? ''

  await db
    .update(trainingSessions)
    .set({
      actualDistanceKm,
      actualPaceSecPerKm,
      distanceScore,
      status,
      notes: '__manual__' + prevNotes,
    })
    .where(eq(trainingSessions.id, params.id))

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Run full test suite — no regressions**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add app/api/sessions/\[id\]/route.ts
git commit -m "feat: PATCH /api/sessions/[id] — manual override"
```

---

## Task 5: Dashboard Metrics Simplification

**Files:**
- Modify: `lib/dashboard/metrics.ts`
- Modify: `__tests__/dashboard/metrics.test.ts`

- [ ] **Step 1: Write new/updated tests**

Replace the full content of `__tests__/dashboard/metrics.test.ts`:

```ts
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
```

- [ ] **Step 2: Run — tests fail (signature mismatch, bonus row missing)**

```bash
npx vitest run __tests__/dashboard/metrics.test.ts
```

Expected: failures on `calcAvgPaceByType` signature and bonus row.

- [ ] **Step 3: Update metrics.ts**

Replace the full content of `lib/dashboard/metrics.ts`:

```ts
// lib/dashboard/metrics.ts

export type DashboardSession = {
  id:                 string
  date:               string
  type:               string
  distanceKm:         number
  targetPaceSecPerKm: number | null
  status:             string
  actualDistanceKm:   number | null
  actualPaceSecPerKm: number | null
}

export type WeeklyDistanceResult = { actualKm: number; targetKm: number }

export type AvgPaceRow = {
  type:           string
  actualSecPerKm: number | null
  targetSecPerKm: number | null
  trend:          '↑' | '↓' | '→' | null
}

export type CompletionRateRow = {
  type:                    string
  rate:                    number | null
  consecutiveWeeksBelow70: number
}

// SGT = UTC+8
function getSgtWeekBounds(): { start: string; end: string } {
  const sgtNow = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const dow = sgtNow.getUTCDay()
  const diffToMonday = dow === 0 ? 6 : dow - 1
  const monday = new Date(sgtNow)
  monday.setUTCDate(sgtNow.getUTCDate() - diffToMonday)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { start: fmt(monday), end: fmt(sunday) }
}

export function calcWeeklyDistance(sessions: DashboardSession[]): WeeklyDistanceResult {
  const { start, end } = getSgtWeekBounds()
  const inWeek = sessions.filter(s => s.date >= start && s.date <= end)
  const targetKm = inWeek
    .filter(s => s.type !== 'rest' && s.type !== 'bonus')
    .reduce((sum, s) => sum + s.distanceKm, 0)
  const actualKm = inWeek
    .filter(s => s.status === 'completed' || s.status === 'partial')
    .reduce((sum, s) => sum + (s.actualDistanceKm ?? 0), 0)
  return { actualKm, targetKm }
}

function sessionsInLast28Days(sessions: DashboardSession[]): DashboardSession[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 28)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return sessions.filter(s => s.date >= cutoffStr)
}

const AVG_PACE_TYPES = ['long_run', 'race_pace', 'tempo', 'interval', 'easy', 'bonus'] as const

export function calcAvgPaceByType(
  sessions: DashboardSession[],
  paceZones: Record<string, number>,
): AvgPaceRow[] {
  const recent = sessionsInLast28Days(sessions)
  const now = new Date()
  const twoWeeksAgoStr  = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10)
  const fourWeeksAgoStr = new Date(now.getTime() - 28 * 86400000).toISOString().slice(0, 10)

  return AVG_PACE_TYPES.map(type => {
    const forType = recent.filter(
      s => s.type === type && s.actualPaceSecPerKm !== null &&
        (s.status === 'completed' || s.status === 'partial'),
    )
    const actualSecPerKm = forType.length > 0
      ? Math.round(forType.reduce((sum, s) => sum + s.actualPaceSecPerKm!, 0) / forType.length)
      : null

    const targetSecPerKm = paceZones[type] ?? null

    const recent2w = forType.filter(s => s.date >= twoWeeksAgoStr)
    const prior2w  = forType.filter(s => s.date >= fourWeeksAgoStr && s.date < twoWeeksAgoStr)
    let trend: AvgPaceRow['trend'] = null
    if (recent2w.length > 0 && prior2w.length > 0) {
      const avgR = recent2w.reduce((sum, s) => sum + s.actualPaceSecPerKm!, 0) / recent2w.length
      const avgP = prior2w.reduce((sum, s) => sum + s.actualPaceSecPerKm!, 0) / prior2w.length
      const diff = avgP - avgR
      trend = diff > 5 ? '↑' : diff < -5 ? '↓' : '→'
    }

    return { type, actualSecPerKm, targetSecPerKm, trend }
  })
}

const COMPLETION_TYPES = ['long_run', 'tempo', 'interval', 'easy'] as const

function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  const dow = d.getUTCDay()
  const toMonday = dow === 0 ? 6 : dow - 1
  const mon = new Date(d)
  mon.setUTCDate(d.getUTCDate() - toMonday)
  return mon.toISOString().slice(0, 10)
}

export function calcCompletionRateByType(sessions: DashboardSession[]): CompletionRateRow[] {
  const today = new Date().toISOString().slice(0, 10)
  return COMPLETION_TYPES.map(type => {
    const past = sessions.filter(s => s.type === type && s.date <= today)
    if (past.length === 0) return { type, rate: null, consecutiveWeeksBelow70: 0 }

    const done = past.filter(s => s.status === 'completed' || s.status === 'partial')
    const rate = Math.round((done.length / past.length) * 100)

    const byWeek = new Map<string, { total: number; done: number }>()
    for (const s of past) {
      const wk = isoWeekKey(s.date)
      const e = byWeek.get(wk) ?? { total: 0, done: 0 }
      e.total++
      if (s.status === 'completed' || s.status === 'partial') e.done++
      byWeek.set(wk, e)
    }
    const weeks = [...byWeek.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    let consecutiveWeeksBelow70 = 0
    for (const [, { total, done: d }] of weeks) {
      if ((d / total) * 100 < 70) consecutiveWeeksBelow70++
      else break
    }

    return { type, rate, consecutiveWeeksBelow70 }
  })
}
```

- [ ] **Step 4: Run tests — all should pass**

```bash
npx vitest run __tests__/dashboard/metrics.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/dashboard/metrics.ts __tests__/dashboard/metrics.test.ts
git commit -m "feat: simplified dashboard metrics — binary completion, bonus row, paceZones signature"
```

---

## Task 6: Dashboard Page Update

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`
- Modify: `components/dashboard/AvgPaceWidget.tsx`

- [ ] **Step 1: Update AvgPaceWidget to handle nullable targetSecPerKm and show pace for all types**

Replace the full content of `components/dashboard/AvgPaceWidget.tsx`:

```tsx
// components/dashboard/AvgPaceWidget.tsx
import { formatPace } from '@/lib/utils/format'
import type { AvgPaceRow } from '@/lib/dashboard/metrics'

type Props = { rows: AvgPaceRow[] }

const TYPE_LABELS: Record<string, string> = {
  long_run:  'Long',
  race_pace: 'Race',
  tempo:     'Tempo',
  interval:  'Interval',
  easy:      'Easy',
  bonus:     'Extra',
}

export function AvgPaceWidget({ rows }: Props) {
  const activeRows = rows.filter(r => r.actualSecPerKm !== null)
  if (activeRows.length === 0) {
    return (
      <div className="rounded-lg bg-surface p-4">
        <p className="mb-2 text-[10px] uppercase tracking-widest text-muted">Avg Pace / Type</p>
        <p className="text-xs text-muted">No runs logged yet</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="mb-3 text-[10px] uppercase tracking-widest text-muted">Avg Pace / Type</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-muted">
            <th className="pb-2 text-left font-normal">Type</th>
            <th className="pb-2 text-right font-normal">Actual</th>
            <th className="pb-2 text-right font-normal">Target</th>
          </tr>
        </thead>
        <tbody>
          {activeRows.map(row => {
            const faster = row.targetSecPerKm !== null && row.actualSecPerKm! < row.targetSecPerKm
            return (
              <tr key={row.type} className="border-t border-border">
                <td className="py-1.5 text-text">
                  {TYPE_LABELS[row.type] ?? row.type}
                  {row.trend && <span className="ml-1 text-muted">{row.trend}</span>}
                </td>
                <td className={`py-1.5 text-right font-mono ${faster ? 'text-accent' : 'text-warning'}`}>
                  {formatPace(row.actualSecPerKm!)}
                </td>
                <td className="py-1.5 text-right font-mono text-muted">
                  {row.targetSecPerKm !== null ? formatPace(row.targetSecPerKm) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 2: Update dashboard page**

Replace the full content of `app/(app)/dashboard/page.tsx`:

```tsx
// app/(app)/dashboard/page.tsx
import { auth }              from '@/lib/auth'
import { redirect }          from 'next/navigation'
import { getActiveRace }     from '@/lib/race/active-race'
import { getDashboardSessions } from '@/lib/dashboard/queries'
import {
  calcWeeklyDistance,
  calcAvgPaceByType,
  calcCompletionRateByType,
} from '@/lib/dashboard/metrics'
import { db }                from '@/lib/db'
import { userProfile }       from '@/lib/db/schema'
import { eq }                from 'drizzle-orm'
import { WeeklyDistanceWidget }  from '@/components/dashboard/WeeklyDistanceWidget'
import { AvgPaceWidget }         from '@/components/dashboard/AvgPaceWidget'
import { CompletionRateWidget }  from '@/components/dashboard/CompletionRateWidget'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const race = await getActiveRace()
  if (!race) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted">No active race — setup modal should be open.</p>
      </div>
    )
  }

  const [sessions, profile] = await Promise.all([
    getDashboardSessions(session.user.id, race.id),
    db.query.userProfile.findFirst({ where: eq(userProfile.userId, session.user.id) }),
  ])

  const paceZones   = (profile?.paceZones ?? {}) as Record<string, number>
  const weeklyDist  = calcWeeklyDistance(sessions)
  const avgPace     = calcAvgPaceByType(sessions, paceZones)
  const completion  = calcCompletionRateByType(sessions)

  return (
    <div className="flex flex-col gap-3 p-4">
      <WeeklyDistanceWidget
        actualKm={weeklyDist.actualKm}
        targetKm={weeklyDist.targetKm}
      />
      <AvgPaceWidget rows={avgPace} />
      <CompletionRateWidget rows={completion} />
    </div>
  )
}
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add app/\(app\)/dashboard/page.tsx components/dashboard/AvgPaceWidget.tsx
git commit -m "feat: simplified dashboard page — remove estimated finish, paceZones from profile"
```

---

## Task 7: Workouts Queries — Split Plan vs Bonus

**Files:**
- Modify: `lib/sessions/queries.ts`

- [ ] **Step 1: Write failing test**

Add to `__tests__/sessions/grouping.test.ts` (read file first to see existing structure, then append):

```ts
// Add at the end of __tests__/sessions/grouping.test.ts:
import { getBonusSessions } from '@/lib/sessions/queries'

describe('getBonusSessions (unit — pure filter)', () => {
  it('is exported from lib/sessions/queries', () => {
    expect(typeof getBonusSessions).toBe('function')
  })
})
```

- [ ] **Step 2: Run — fails**

```bash
npx vitest run __tests__/sessions/grouping.test.ts
```

Expected: fails with "getBonusSessions is not exported".

- [ ] **Step 3: Update lib/sessions/queries.ts**

Open `lib/sessions/queries.ts`. Make two changes:

**Change 1:** In the `getSessionsByWeek` DB query, add `ne(trainingSessions.type, 'bonus')` to the WHERE clause.

Find this block (around line 99–122):
```ts
  const [sessionRows, changeRows] = await Promise.all([
    db
      .select({ ... })
      .from(trainingSessions)
      .where(
        and(
          eq(trainingSessions.userId, userId),
          eq(trainingSessions.raceId, raceId),
        ),
      ),
```

Change the `.where(...)` to:
```ts
      .where(
        and(
          eq(trainingSessions.userId, userId),
          eq(trainingSessions.raceId, raceId),
          ne(trainingSessions.type, 'bonus'),
        ),
      ),
```

Also add `ne` to the drizzle-orm import at line 94:
```ts
  const { eq, and, ne } = await import('drizzle-orm')
```

**Change 2:** Add `getBonusSessions` at the end of the file:

```ts
export type BonusSession = {
  id:                 string
  date:               string
  actualDistanceKm:   number | null
  actualPaceSecPerKm: number | null
  actualAvgHr:        number | null
  stravaActivityId:   string | null
}

export async function getBonusSessions(
  userId: string,
  raceId: string,
): Promise<BonusSession[]> {
  const { eq, and } = await import('drizzle-orm')
  const { db } = await import('@/lib/db')
  const { trainingSessions } = await import('@/lib/db/schema')

  const rows = await db
    .select({
      id:                 trainingSessions.id,
      date:               trainingSessions.date,
      actualDistanceKm:   trainingSessions.actualDistanceKm,
      actualPaceSecPerKm: trainingSessions.actualPaceSecPerKm,
      actualAvgHr:        trainingSessions.actualAvgHr,
      stravaActivityId:   trainingSessions.stravaActivityId,
    })
    .from(trainingSessions)
    .where(
      and(
        eq(trainingSessions.userId, userId),
        eq(trainingSessions.raceId, raceId),
        eq(trainingSessions.type, 'bonus'),
      ),
    )

  return rows.sort((a, b) => b.date.localeCompare(a.date))
}
```

- [ ] **Step 4: Run tests — all pass**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/sessions/queries.ts __tests__/sessions/grouping.test.ts
git commit -m "feat: filter bonus from plan sessions; add getBonusSessions query"
```

---

## Task 8: Workouts Page — Two Sections + Upload Button

**Files:**
- Create: `components/workouts/BonusRunsList.tsx`
- Create: `components/workouts/PlanUploadButton.tsx`
- Modify: `app/(app)/workouts/page.tsx`

- [ ] **Step 1: Create BonusRunsList**

Create `components/workouts/BonusRunsList.tsx`:

```tsx
// components/workouts/BonusRunsList.tsx
import { formatPace } from '@/lib/utils/format'
import type { BonusSession } from '@/lib/sessions/queries'

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

type Props = { sessions: BonusSession[] }

export function BonusRunsList({ sessions }: Props) {
  if (sessions.length === 0) return null

  return (
    <div className="mt-6">
      <p className="mb-3 px-1 text-[10px] uppercase tracking-widest text-muted">Extra Runs</p>
      <div className="flex flex-col gap-2">
        {sessions.map(s => (
          <div key={s.id} className="rounded-lg bg-surface p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted">{formatDate(s.date)}</p>
              <p className="text-sm text-text">
                {s.actualDistanceKm?.toFixed(1) ?? '—'} km
              </p>
            </div>
            <p className="font-mono text-sm text-muted">
              {s.actualPaceSecPerKm ? formatPace(s.actualPaceSecPerKm) + ' /km' : '—'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create PlanUploadButton**

Create `components/workouts/PlanUploadButton.tsx`:

```tsx
// components/workouts/PlanUploadButton.tsx
'use client'

import { useRef, useState } from 'react'
import { useRouter }        from 'next/navigation'

type Props = { raceId: string }

export function PlanUploadButton({ raceId }: Props) {
  const inputRef             = useRef<HTMLInputElement>(null)
  const [status, setStatus]  = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const router               = useRouter()

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setStatus('uploading')
    setMessage(null)

    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch(`/api/races/${raceId}/plan`, { method: 'POST', body: form })
      const data = await res.json() as { inserted?: number; error?: string }
      if (!res.ok) {
        setStatus('error')
        setMessage(data.error ?? 'Upload failed')
      } else {
        setStatus('done')
        setMessage(`Loaded ${data.inserted} sessions`)
        router.refresh()
      }
    } catch {
      setStatus('error')
      setMessage('Upload failed — check your connection')
    } finally {
      // Reset input so the same file can be re-uploaded
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFile}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={status === 'uploading'}
        className="border border-border text-muted text-xs px-4 py-2 rounded-sm hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
      >
        {status === 'uploading' ? 'Uploading…' : 'Upload Plan'}
      </button>
      {message && (
        <p className={`text-xs ${status === 'error' ? 'text-danger' : 'text-accent'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Update workouts page**

Replace the full content of `app/(app)/workouts/page.tsx`:

```tsx
// app/(app)/workouts/page.tsx
import { auth }              from '@/lib/auth'
import { redirect }          from 'next/navigation'
import { getActiveRace }     from '@/lib/race/active-race'
import { getSessionsByWeek, getBonusSessions } from '@/lib/sessions/queries'
import { WeekSection }       from '@/components/workouts/WeekSection'
import { BonusRunsList }     from '@/components/workouts/BonusRunsList'
import { PlanUploadButton }  from '@/components/workouts/PlanUploadButton'

export default async function WorkoutsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const race = await getActiveRace()
  if (!race) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted">No active race.</p>
      </div>
    )
  }

  const [groups, bonusSessions] = await Promise.all([
    getSessionsByWeek(session.user.id, race.id, race.trainingStartDate),
    getBonusSessions(session.user.id, race.id),
  ])

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-widest text-muted">Training Plan</p>
        <PlanUploadButton raceId={race.id} />
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted px-1">No sessions yet — upload a CSV plan to get started.</p>
      ) : (
        groups.map(group => (
          <WeekSection
            key={group.weekNumber}
            group={group}
            defaultExpanded={group.isCurrentWeek}
          />
        ))
      )}

      <BonusRunsList sessions={bonusSessions} />
    </div>
  )
}
```

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/workouts/BonusRunsList.tsx components/workouts/PlanUploadButton.tsx app/\(app\)/workouts/page.tsx
git commit -m "feat: workouts page — two sections, CSV upload button, bonus runs list"
```

---

## Task 9: SessionCard Manual Edit

**Files:**
- Modify: `components/workouts/SessionCard.tsx`

- [ ] **Step 1: Update SessionCard**

Replace the full content of `components/workouts/SessionCard.tsx`:

```tsx
// components/workouts/SessionCard.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatPace } from '@/lib/utils/format'
import type { RawSession } from '@/lib/sessions/queries'

const TYPE_COLORS: Record<string, string> = {
  long_run:  '#C8FF00',
  race_pace: '#FACC15',
  interval:  '#FB923C',
  tempo:     '#60A5FA',
  easy:      '#4ADE80',
  bonus:     '#A78BFA',
}

const TYPE_LABELS: Record<string, string> = {
  long_run:  'Long Run',
  race_pace: 'Race Pace',
  interval:  'Interval',
  tempo:     'Tempo',
  easy:      'Easy',
  bonus:     'Extra',
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#C8FF00',
  partial:   '#FF9500',
  planned:   '#444',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

// Parse "mm:ss" string → seconds
function parsePaceInput(value: string): number | null {
  const match = value.trim().match(/^(\d+):(\d{2})$/)
  if (!match) return null
  return parseInt(match[1]) * 60 + parseInt(match[2])
}

type Props = { session: RawSession; weekNumber: number; phaseName?: string }

export function SessionCard({ session, weekNumber, phaseName }: Props) {
  const [expanded, setExpanded]   = useState(false)
  const [editing, setEditing]     = useState(false)
  const [distInput, setDistInput] = useState(session.actualDistanceKm?.toFixed(1) ?? '')
  const [paceInput, setPaceInput] = useState(
    session.actualPaceSecPerKm ? formatPace(session.actualPaceSecPerKm) : '',
  )
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const router = useRouter()

  const color = TYPE_COLORS[session.type] ?? '#888'
  const isManual = session.notes?.startsWith('__manual__') ?? false

  async function handleSave() {
    const dist = parseFloat(distInput)
    const pace = parsePaceInput(paceInput)
    if (isNaN(dist) || dist <= 0) { setSaveError('Enter a valid distance'); return }
    if (pace === null) { setSaveError('Enter pace as mm:ss'); return }

    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualDistanceKm: dist, actualPaceSecPerKm: pace }),
      })
      if (!res.ok) throw new Error('Save failed')
      setEditing(false)
      router.refresh()
    } catch {
      setSaveError('Save failed — try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      data-testid="session-card"
      role="button"
      tabIndex={0}
      className="cursor-pointer rounded-lg bg-surface p-3"
      onClick={() => !editing && setExpanded(v => !v)}
      onKeyDown={(e) => { if (!editing && (e.key === 'Enter' || e.key === ' ')) setExpanded(v => !v) }}
    >
      {/* Collapsed row */}
      <div className="flex items-center gap-3">
        <span
          className="rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{ borderColor: color, color }}
        >
          {TYPE_LABELS[session.type] ?? session.type}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted">{formatDate(session.date)}</p>
          {session.actualDistanceKm !== null ? (
            <p className="text-sm text-text">
              {session.actualDistanceKm.toFixed(1)} km
              {session.actualPaceSecPerKm && (
                <span className="ml-2 font-mono text-xs text-muted">
                  {formatPace(session.actualPaceSecPerKm)} /km
                </span>
              )}
              {isManual && <span className="ml-1 text-[10px] text-muted">✎</span>}
            </p>
          ) : (
            <p className="text-xs text-muted">{session.distanceKm.toFixed(1)} km planned</p>
          )}
        </div>
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: STATUS_COLORS[session.status] ?? '#444' }}
        />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          className="mt-3 border-t border-border pt-3"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          {phaseName && (
            <p className="text-xs text-muted">{phaseName} · Week {weekNumber}</p>
          )}
          {session.targetPaceSecPerKm && (
            <p className="mt-1 text-xs text-muted">
              Target: {formatPace(session.targetPaceSecPerKm)} /km · {session.distanceKm.toFixed(1)} km
            </p>
          )}

          {!editing ? (
            <button
              className="mt-3 border border-border text-muted text-xs px-3 py-1.5 rounded-sm hover:border-accent hover:text-accent transition-colors"
              onClick={() => {
                setDistInput(session.actualDistanceKm?.toFixed(1) ?? '')
                setPaceInput(session.actualPaceSecPerKm ? formatPace(session.actualPaceSecPerKm) : '')
                setSaveError(null)
                setEditing(true)
              }}
            >
              {session.actualDistanceKm !== null ? 'Edit actuals' : 'Add actuals'}
            </button>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted uppercase tracking-wide">Distance (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={distInput}
                    onChange={e => setDistInput(e.target.value)}
                    className="w-24 rounded border border-border bg-bg px-2 py-1 text-sm text-text font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted uppercase tracking-wide">Avg Pace (mm:ss)</label>
                  <input
                    type="text"
                    placeholder="5:30"
                    value={paceInput}
                    onChange={e => setPaceInput(e.target.value)}
                    className="w-24 rounded border border-border bg-bg px-2 py-1 text-sm text-text font-mono"
                  />
                </div>
              </div>
              {saveError && <p className="text-xs text-danger">{saveError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="border border-accent text-accent text-xs px-3 py-1.5 rounded-sm hover:bg-accent hover:text-bg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="border border-border text-muted text-xs px-3 py-1.5 rounded-sm hover:border-danger hover:text-danger transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add components/workouts/SessionCard.tsx
git commit -m "feat: SessionCard — show actuals, inline manual edit"
```

---

## Task 10: Profile Simplification

Replace GarminUploadForm with PaceSettings. Update API route.

**Files:**
- Create: `components/profile/PaceSettings.tsx`
- Modify: `app/(app)/profile/page.tsx`
- Modify: `app/api/profile/route.ts`

- [ ] **Step 1: Create PaceSettings component**

Create `components/profile/PaceSettings.tsx`:

```tsx
// components/profile/PaceSettings.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatPace } from '@/lib/utils/format'

const PACE_TYPES = [
  { key: 'easy',      label: 'Easy' },
  { key: 'tempo',     label: 'Tempo' },
  { key: 'interval',  label: 'Interval' },
  { key: 'long_run',  label: 'Long Run' },
  { key: 'race_pace', label: 'Race Pace' },
] as const

type PaceZones = Partial<Record<string, number>>

// Seconds → "mm:ss"
function secToStr(sec: number | undefined): string {
  if (!sec) return ''
  return formatPace(sec)
}

// "mm:ss" → seconds | null
function strToSec(s: string): number | null {
  const match = s.trim().match(/^(\d+):(\d{2})$/)
  if (!match) return null
  return parseInt(match[1]) * 60 + parseInt(match[2])
}

type Props = { paceZones: PaceZones }

export function PaceSettings({ paceZones }: Props) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(PACE_TYPES.map(({ key }) => [key, secToStr(paceZones[key])])),
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const router = useRouter()

  async function handleSave() {
    const zones: Record<string, number> = {}
    for (const { key } of PACE_TYPES) {
      const sec = strToSec(values[key])
      if (values[key] && sec === null) {
        setError(`Invalid pace for ${key} — use mm:ss format`)
        return
      }
      if (sec !== null) zones[key] = sec
    }

    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paceZones: zones }),
      })
      if (!res.ok) throw new Error('Save failed')
      setSaved(true)
      router.refresh()
    } catch {
      setError('Save failed — try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="mb-3 text-[10px] uppercase tracking-widest text-muted">Target Paces</p>
      <div className="flex flex-col gap-3">
        {PACE_TYPES.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <label className="text-sm text-text w-24">{label}</label>
            <input
              type="text"
              placeholder="mm:ss"
              value={values[key]}
              onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
              className="w-24 rounded border border-border bg-bg px-2 py-1 text-sm font-mono text-text text-right"
            />
          </div>
        ))}
      </div>
      {error  && <p className="mt-2 text-xs text-danger">{error}</p>}
      {saved  && <p className="mt-2 text-xs text-accent">Saved</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 border border-accent text-accent text-xs px-4 py-2 rounded-sm hover:bg-accent hover:text-bg transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save paces'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Update PATCH /api/profile**

Replace the full content of `app/api/profile/route.ts`:

```ts
// app/api/profile/route.ts
import { NextResponse } from 'next/server'
import { auth }         from '@/lib/auth'
import { db }           from '@/lib/db'
import { races, userProfile } from '@/lib/db/schema'
import { eq, and }      from 'drizzle-orm'

export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  let body: { goalTimeMinutes?: unknown; paceZones?: unknown }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (body.goalTimeMinutes !== undefined) {
    if (typeof body.goalTimeMinutes !== 'number' || body.goalTimeMinutes <= 0) {
      return NextResponse.json({ error: 'goalTimeMinutes must be a positive number' }, { status: 400 })
    }
    const activeRace = await db.query.races.findFirst({
      where: and(eq(races.userId, userId), eq(races.status, 'active')),
    })
    if (!activeRace) {
      return NextResponse.json({ error: 'No active race' }, { status: 404 })
    }
    await db.update(races)
      .set({ goalTimeMinutes: body.goalTimeMinutes })
      .where(eq(races.id, activeRace.id))
  }

  if (body.paceZones !== undefined) {
    if (typeof body.paceZones !== 'object' || body.paceZones === null) {
      return NextResponse.json({ error: 'paceZones must be an object' }, { status: 400 })
    }
    await db
      .insert(userProfile)
      .values({ userId, paceZones: body.paceZones })
      .onConflictDoUpdate({
        target: userProfile.userId,
        set: { paceZones: body.paceZones, updatedAt: new Date() },
      })
  }

  const profile = await db.query.userProfile.findFirst({
    where: eq(userProfile.userId, userId),
  })

  return NextResponse.json({ ok: true, profile })
}
```

- [ ] **Step 3: Update profile page**

Replace the full content of `app/(app)/profile/page.tsx`:

```tsx
// app/(app)/profile/page.tsx
import { auth }          from '@/lib/auth'
import { redirect }      from 'next/navigation'
import { getActiveRace } from '@/lib/race/active-race'
import { db }            from '@/lib/db'
import { users, userProfile, trainingSessions } from '@/lib/db/schema'
import { eq, and }       from 'drizzle-orm'
import { GoalTimeForm }  from '@/components/profile/GoalTimeForm'
import { EndRaceSection } from '@/components/profile/EndRaceSection'
import { StravaSection } from '@/components/profile/StravaSection'
import { TrainingSummary } from '@/components/profile/TrainingSummary'
import { PaceSettings }  from '@/components/profile/PaceSettings'

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const [user, profile, race] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    db.query.userProfile.findFirst({ where: eq(userProfile.userId, userId) }),
    getActiveRace(),
  ])

  let weeksCompleted = 0
  let totalKmLogged  = 0
  let sessionsHit    = 0
  let sessionsMissed = 0

  if (race) {
    const sessions = await db
      .select()
      .from(trainingSessions)
      .where(and(eq(trainingSessions.userId, userId), eq(trainingSessions.raceId, race.id)))

    const withActuals = sessions.filter(
      s => s.status !== 'planned' && s.actualDistanceKm !== null,
    )
    const weekSet = new Set(withActuals.map(s => {
      const d = new Date(s.date)
      d.setUTCDate(d.getUTCDate() - (d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1))
      return d.toISOString().slice(0, 10)
    }))
    weeksCompleted = weekSet.size
    totalKmLogged  = withActuals.reduce((sum, s) => sum + (s.actualDistanceKm ?? 0), 0)
    sessionsHit    = sessions.filter(s => s.status === 'completed').length
    sessionsMissed = sessions.filter(
      s => s.status === 'planned' && s.date < new Date().toISOString().slice(0, 10),
    ).length
  }

  const joinedDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : '—'

  const paceZones = (profile?.paceZones ?? {}) as Record<string, number>

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="rounded-lg bg-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted">Account</p>
        <p className="mt-2 text-sm text-text">{user?.email}</p>
        <p className="text-xs text-muted">Joined {joinedDate}</p>
      </div>

      {race && <GoalTimeForm currentGoalTimeMinutes={race.goalTimeMinutes} />}

      <PaceSettings paceZones={paceZones} />

      <StravaSection
        isConnected={!!profile?.stravaAccessToken}
        athleteName={profile?.stravaAthleteName ?? null}
        lastSyncAt={profile?.stravaLastSyncAt ?? null}
      />

      <TrainingSummary
        weeksCompleted={weeksCompleted}
        totalKmLogged={totalKmLogged}
        sessionsHit={sessionsHit}
        sessionsMissed={sessionsMissed}
      />

      {race && <EndRaceSection raceId={race.id} raceName={race.name} />}
    </div>
  )
}
```

- [ ] **Step 4: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add components/profile/PaceSettings.tsx app/\(app\)/profile/page.tsx app/api/profile/route.ts
git commit -m "feat: profile — PaceSettings replaces GarminUpload; simplified PATCH route"
```

---

## Task 11: README Update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace README content**

Replace the full content of `README.md`:

```markdown
# Percy the Pacer

Mobile-first PWA for half-marathon runners. Upload your training plan as a CSV, sync runs from Strava, and track completion and pace trends across session types.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript strict |
| Database | Neon DB (serverless Postgres) via Drizzle ORM |
| Auth | NextAuth v5 — Credentials + DB sessions |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Testing | Vitest (unit) + Playwright (E2E) |

## Getting Started

```bash
cp .env.example .env.local   # fill in DATABASE_URL, AUTH_SECRET, Strava keys
npm install
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Key Features

- **Race setup** — set race date and goal time
- **CSV plan upload** — upload your training plan once: `date, type, km, target_pace`
- **Strava sync** — OAuth2 connect, webhook push, manual "Sync now"
- **Binary completion** — a session is completed when actual distance ≥ planned distance
- **Manual override** — edit actual distance and pace on any session; overrides Strava data
- **Extra runs** — Strava runs with no matching planned session appear as "Extra Runs"
- **Dashboard** — weekly distance, completion rate by type, average pace by type (last 28 days)
- **Target paces** — set reference paces per type (easy, tempo, interval, long run, race pace) on your profile

## Environment Variables

```
DATABASE_URL
AUTH_SECRET
AUTH_URL
STRAVA_CLIENT_ID
STRAVA_CLIENT_SECRET
STRAVA_WEBHOOK_VERIFY_TOKEN
```

## Project Structure

```
app/
  (auth)/        ← login, register
  (app)/         ← dashboard, workouts, race, profile
  api/           ← REST routes (races, sessions, strava/*, profile)
lib/
  db/            ← Drizzle schema + client
  strava/        ← OAuth client, sync-activity
  training/      ← CSV parser, quality-score (retained), pace-calculator
components/
  race-setup/    ← 3-step setup modal
  workouts/      ← session cards, bonus runs list, CSV upload button
  profile/       ← Strava section, pace settings
  dashboard/     ← weekly distance, avg pace, completion rate widgets
```

## CSV Plan Format

```
date,type,km,target_pace
2026-04-16,tempo,7.0,5:18
2026-04-18,long_run,13.7,5:55
2026-04-19,easy,2.9,6:09
2026-04-21,interval,4.7,4:24
```

- `date`: `DD MMM` (e.g. `16 Apr`) or `YYYY-MM-DD`
- `type`: `easy`, `tempo`, `interval`, `long_run`, `race_pace`
- `km`: planned distance
- `target_pace`: `mm:ss` — displayed only, not used in calculations

Uploading a new CSV replaces all planned sessions. Sessions with actuals already recorded are not affected.

## Test

```bash
npm test                      # vitest unit tests
npx playwright test           # E2E (requires Chromium system deps)
```
```

- [ ] **Step 2: Run final test suite**

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: update README for simplified Percy"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| CSV upload: date, type, km, target_pace | Task 1, 2 |
| Re-upload replaces planned sessions | Task 2 |
| Strava sync: ±36h match, binary completion | Task 3 |
| Bonus insert when no match | Task 3 |
| Manual override guard (`__manual__` prefix) | Task 3, 4 |
| status = completed if actualKm ≥ plannedKm, else partial | Task 3, 4 |
| distanceScore = min(100, actualKm/plannedKm*100) | Task 3 |
| Dashboard: weekly distance (bonus in actual, not target) | Task 5 |
| Dashboard: avg pace by type incl. bonus row | Task 5, 6 |
| Dashboard: completion rate excl. bonus | Task 5 |
| Estimated finish removed | Task 6 |
| Workouts: plan sessions excl. bonus | Task 7 |
| Workouts: extra runs section | Task 8 |
| Workouts: CSV upload button | Task 8 |
| SessionCard: show actual km + pace | Task 9 |
| SessionCard: inline manual edit | Task 9 |
| Profile: PaceSettings per type | Task 10 |
| Profile: PATCH /api/profile accepts paceZones | Task 10 |
| Garmin upload removed from profile | Task 10 |
| README updated | Task 11 |

All requirements covered. No placeholders. ✅
