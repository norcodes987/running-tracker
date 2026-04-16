# Percy Phase 3 — Strava Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Strava activity sync into Percy so completed runs automatically update session actuals and calculate quality scores.

**Architecture:** Strava OAuth stores tokens on `user_profile`; a webhook handler and shared `syncStravaActivity()` function match incoming activities to planned sessions, score them via `calculateQualityScore()`, and stub the orchestrator call. A "Sync now" button in the Profile tab provides a manual trigger backed by the same shared function.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM, Neon DB (serverless Postgres), Strava API v3, Vitest, Playwright

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/db/schema.ts` | Modify | Add `stravaAthleteId`, `stravaAthleteName`, `stravaWebhookSubscriptionId`, `stravaLastSyncAt` to `user_profile` |
| `lib/strava/client.ts` | Create | Pure Strava API wrappers — no DB, no side effects |
| `lib/strava/sync-activity.ts` | Create | Shared sync logic: token refresh, dedup, session match, quality score, DB write, orchestrator stub |
| `app/api/strava/auth/route.ts` | Create | GET: redirect to Strava OAuth authorize URL |
| `app/api/strava/callback/route.ts` | Create | GET: exchange code, fetch athlete, store tokens, register webhook, redirect |
| `app/api/strava/disconnect/route.ts` | Create | POST: delete webhook subscription, null tokens |
| `app/api/strava/webhook/route.ts` | Create | GET: hub challenge; POST: dispatch to syncStravaActivity |
| `app/api/strava/sync/route.ts` | Create | POST: fetch last 10 activities, call syncStravaActivity for each |
| `components/profile/StravaSection.tsx` | Create | Connected/disconnected UI, Sync now button, Disconnect button |
| `app/(app)/profile/page.tsx` | Modify | Fetch strava fields from profile, slot in StravaSection |
| `__tests__/strava/sync-activity.test.ts` | Create | Unit tests for sync logic (dedup, no match, score write, stub log) |
| `e2e/strava.spec.ts` | Create | Profile shows Connect Strava; Sync now renders when connected |

---

## Task 1: DB Schema + Migration

**Files:**
- Modify: `lib/db/schema.ts`

- [ ] **Step 1: Add four columns to `userProfile` in `lib/db/schema.ts`**

Replace the existing `userProfile` table definition:

```ts
export const userProfile = pgTable('user_profile', {
  id:                          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:                      text('user_id').notNull().references(() => users.id).unique(),
  maxHr:                       integer('max_hr'),
  age:                         integer('age'),
  thresholdPaceSecPerKm:       integer('threshold_pace_sec_per_km'),
  paceZones:                   jsonb('pace_zones'),
  hrZones:                     jsonb('hr_zones'),
  acwrBaseline:                real('acwr_baseline'),
  stravaAccessToken:           text('strava_access_token'),
  stravaRefreshToken:          text('strava_refresh_token'),
  stravaTokenExpiry:           timestamp('strava_token_expiry'),
  stravaAthleteId:             integer('strava_athlete_id'),
  stravaAthleteName:           text('strava_athlete_name'),
  stravaWebhookSubscriptionId: integer('strava_webhook_subscription_id'),
  stravaLastSyncAt:            timestamp('strava_last_sync_at'),
  updatedAt:                   timestamp('updated_at').defaultNow(),
})
```

- [ ] **Step 2: Generate migration**

```bash
npm run db:generate
```

Expected: a new `.sql` file appears in `drizzle/` with four `ALTER TABLE` statements adding the new columns.

- [ ] **Step 3: Run migration**

```bash
npm run db:migrate
```

Expected: `All migrations applied successfully` (or similar Drizzle output). No errors.

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts drizzle/
git commit -m "feat: add strava athlete + webhook + sync columns to user_profile"
```

---

## Task 2: Strava API Client

**Files:**
- Create: `lib/strava/client.ts`

- [ ] **Step 1: Create `lib/strava/client.ts`**

```ts
// lib/strava/client.ts

const BASE = 'https://www.strava.com/api/v3'
const TOKEN_URL = 'https://www.strava.com/oauth/token'

export type StravaTokenResponse = {
  access_token:  string
  refresh_token: string
  expires_at:    number   // Unix timestamp (seconds)
  athlete?:      StravaAthlete
}

export type StravaAthlete = {
  id:        number
  firstname: string
  lastname:  string
}

export type StravaActivity = {
  id:                number
  type:              string   // 'Run', 'VirtualRun', etc.
  distance:          number   // metres
  moving_time:       number   // seconds
  average_heartrate: number | undefined
  average_speed:     number   // m/s
  start_date:        string   // ISO 8601 datetime string
}

export type StravaActivitySummary = {
  id:         number
  type:       string
  start_date: string
}

export async function exchangeCode(code: string): Promise<StravaTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type:    'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Strava token exchange failed: ${res.status}`)
  return res.json()
}

export async function refreshStravaToken(refreshToken: string): Promise<StravaTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Strava token refresh failed: ${res.status}`)
  return res.json()
}

export async function fetchStravaActivity(accessToken: string, activityId: number): Promise<StravaActivity> {
  const res = await fetch(`${BASE}/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Strava fetch activity failed: ${res.status}`)
  return res.json()
}

export async function fetchStravaActivities(accessToken: string, perPage: number): Promise<StravaActivitySummary[]> {
  const res = await fetch(`${BASE}/athlete/activities?per_page=${perPage}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Strava fetch activities failed: ${res.status}`)
  return res.json()
}

export async function fetchStravaAthlete(accessToken: string): Promise<StravaAthlete> {
  const res = await fetch(`${BASE}/athlete`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Strava fetch athlete failed: ${res.status}`)
  return res.json()
}

export async function registerStravaWebhook(callbackUrl: string, verifyToken: string): Promise<number> {
  const res = await fetch(`${BASE}/push_subscriptions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:    process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      callback_url: callbackUrl,
      verify_token: verifyToken,
    }),
  })
  if (!res.ok) throw new Error(`Strava register webhook failed: ${res.status}`)
  const data = await res.json()
  return data.id as number
}

export async function deleteStravaWebhook(subscriptionId: number): Promise<void> {
  const res = await fetch(`${BASE}/push_subscriptions/${subscriptionId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
    }),
  })
  // 204 = success, 404 = already gone — both are fine
  if (!res.ok && res.status !== 404) {
    throw new Error(`Strava delete webhook failed: ${res.status}`)
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/strava/client.ts
git commit -m "feat: strava API client — token exchange, activity fetch, webhook management"
```

---

## Task 3: Sync Activity (TDD)

**Files:**
- Create: `__tests__/strava/sync-activity.test.ts`
- Create: `lib/strava/sync-activity.ts`

- [ ] **Step 1: Write the failing tests**

Create `__tests__/strava/sync-activity.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests — verify they all fail**

```bash
npm test -- __tests__/strava/sync-activity.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/strava/sync-activity'`

- [ ] **Step 3: Implement `lib/strava/sync-activity.ts`**

```ts
// lib/strava/sync-activity.ts
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { trainingSessions, userProfile, races } from '@/lib/db/schema'
import { calculateQualityScore } from '@/lib/training/quality-score'
import {
  fetchStravaActivity,
  refreshStravaToken,
  type StravaActivity,
} from '@/lib/strava/client'

const WINDOW_MS = 36 * 60 * 60 * 1000 // ±36 hours in milliseconds

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
  // speed in m/s → sec/km
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

  // 3. Get valid access token (refresh if needed)
  const accessToken = await ensureFreshToken(
    userId,
    profile.stravaAccessToken,
    profile.stravaRefreshToken,
    profile.stravaTokenExpiry ?? null,
  )

  // 4. Fetch activity from Strava
  const activity: StravaActivity = await fetchStravaActivity(accessToken, stravaActivityId)

  // 5. Filter: only Run type, only ≥1.0 km
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
  const allSessions = await db
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

  if (candidates.length === 0) {
    console.log('[sync] no matching session for activity', stravaActivityId)
    return
  }

  // Pick nearest
  const matched = candidates.reduce((nearest, s) => {
    const sDiff = Math.abs(new Date(s.date + 'T00:00:00Z').getTime() - activityTime)
    const nDiff = Math.abs(new Date(nearest.date + 'T00:00:00Z').getTime() - activityTime)
    return sDiff < nDiff ? s : nearest
  })

  // 8. Calculate quality score
  const activityPaceSec = speedToSecPerKm(activity.average_speed)
  const result = calculateQualityScore({
    type:               matched.type as Parameters<typeof calculateQualityScore>[0]['type'],
    plannedKm:          matched.distanceKm,
    actualKm:           activityKm,
    targetPaceSecPerKm: matched.targetPaceSecPerKm ?? activityPaceSec,
    actualPaceSecPerKm: activityPaceSec,
  })

  // 9. Write actuals to session
  await db
    .update(trainingSessions)
    .set({
      actualDistanceKm:   activityKm,
      actualPaceSecPerKm: activityPaceSec,
      actualAvgHr:        activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
      distanceScore:      result.distanceScore,
      paceScore:          result.paceScore,
      qualityScore:       result.qualityScore,
      status:             result.status,
      stravaActivityId:   String(stravaActivityId),
    })
    .where(eq(trainingSessions.id, matched.id))

  // 10. Update last sync timestamp
  await db
    .update(userProfile)
    .set({ stravaLastSyncAt: new Date() })
    .where(eq(userProfile.userId, userId))

  // 11. Orchestrator stub
  if (result.qualityScore < 85) {
    console.log('[orchestrator] stub —', 'would trigger for session', matched.id, 'quality:', result.qualityScore)
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- __tests__/strava/sync-activity.test.ts
```

Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add __tests__/strava/sync-activity.test.ts lib/strava/sync-activity.ts
git commit -m "feat: sync activity — session match, quality score, orchestrator stub (TDD)"
```

---

## Task 4: OAuth Connect Routes

**Files:**
- Create: `app/api/strava/auth/route.ts`
- Create: `app/api/strava/callback/route.ts`

- [ ] **Step 1: Create `app/api/strava/auth/route.ts`**

```ts
// app/api/strava/auth/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', process.env.AUTH_URL!))
  }

  const params = new URLSearchParams({
    client_id:     process.env.STRAVA_CLIENT_ID!,
    redirect_uri:  `${process.env.AUTH_URL}/api/strava/callback`,
    response_type: 'code',
    approval_prompt: 'auto',
    scope:         'activity:read_all',
  })

  return NextResponse.redirect(
    `https://www.strava.com/oauth/authorize?${params.toString()}`,
  )
}
```

- [ ] **Step 2: Create `app/api/strava/callback/route.ts`**

```ts
// app/api/strava/callback/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { userProfile } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import {
  exchangeCode,
  fetchStravaAthlete,
  registerStravaWebhook,
} from '@/lib/strava/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', process.env.AUTH_URL!))
  }
  const userId = session.user.id

  const code = request.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(
      new URL('/profile?error=strava_denied', process.env.AUTH_URL!),
    )
  }

  // Exchange code for tokens
  const tokens = await exchangeCode(code)

  // Fetch athlete name
  const athlete = await fetchStravaAthlete(tokens.access_token)
  const athleteName = `${athlete.firstname} ${athlete.lastname}`.trim()

  // Register webhook subscription
  const callbackUrl = `${process.env.AUTH_URL}/api/strava/webhook`
  let subscriptionId: number | null = null
  try {
    subscriptionId = await registerStravaWebhook(
      callbackUrl,
      process.env.STRAVA_WEBHOOK_VERIFY_TOKEN!,
    )
  } catch (err) {
    // Non-fatal: webhook registration can fail if already registered
    console.warn('[strava] webhook registration failed:', err)
  }

  // Store everything on user_profile
  await db
    .update(userProfile)
    .set({
      stravaAccessToken:           tokens.access_token,
      stravaRefreshToken:          tokens.refresh_token,
      stravaTokenExpiry:           new Date(tokens.expires_at * 1000),
      stravaAthleteId:             athlete.id,
      stravaAthleteName:           athleteName,
      stravaWebhookSubscriptionId: subscriptionId,
    })
    .where(eq(userProfile.userId, userId))

  return NextResponse.redirect(new URL('/profile', process.env.AUTH_URL!))
}
```

- [ ] **Step 3: Commit**

```bash
git add app/api/strava/auth/route.ts app/api/strava/callback/route.ts
git commit -m "feat: strava OAuth connect — auth redirect and callback handler"
```

---

## Task 5: Disconnect Route

**Files:**
- Create: `app/api/strava/disconnect/route.ts`

- [ ] **Step 1: Create `app/api/strava/disconnect/route.ts`**

```ts
// app/api/strava/disconnect/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { userProfile } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { deleteStravaWebhook } from '@/lib/strava/client'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  // Load profile to get webhook subscription ID
  const profile = await db.query.userProfile.findFirst({
    where: eq(userProfile.userId, userId),
  })

  // Delete webhook subscription from Strava (best-effort)
  if (profile?.stravaWebhookSubscriptionId) {
    try {
      await deleteStravaWebhook(profile.stravaWebhookSubscriptionId)
    } catch (err) {
      console.warn('[strava] webhook deletion failed (continuing):', err)
    }
  }

  // Null all strava fields on user_profile
  await db
    .update(userProfile)
    .set({
      stravaAccessToken:           null,
      stravaRefreshToken:          null,
      stravaTokenExpiry:           null,
      stravaAthleteId:             null,
      stravaAthleteName:           null,
      stravaWebhookSubscriptionId: null,
      stravaLastSyncAt:            null,
    })
    .where(eq(userProfile.userId, userId))

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/strava/disconnect/route.ts
git commit -m "feat: strava disconnect — delete webhook subscription, null tokens"
```

---

## Task 6: Webhook Handler

**Files:**
- Create: `app/api/strava/webhook/route.ts`

- [ ] **Step 1: Create `app/api/strava/webhook/route.ts`**

```ts
// app/api/strava/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { userProfile } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { syncStravaActivity } from '@/lib/strava/sync-activity'

// GET — Strava hub challenge verification
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const mode      = searchParams.get('hub.mode')
  const verifyToken = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  if (
    mode !== 'subscribe' ||
    verifyToken !== process.env.STRAVA_WEBHOOK_VERIFY_TOKEN ||
    !challenge
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 400 })
  }

  return NextResponse.json({ 'hub.challenge': challenge })
}

// POST — Strava activity event
export async function POST(request: NextRequest) {
  const body = await request.json()

  const { object_type, aspect_type, owner_id, object_id } = body as {
    object_type: string
    aspect_type: string
    owner_id:    number
    object_id:   number
  }

  // Only process new run activity events
  if (object_type !== 'activity' || aspect_type !== 'create') {
    return NextResponse.json({ ok: true })
  }

  // Resolve userId from stravaAthleteId
  const profile = await db.query.userProfile.findFirst({
    where: eq(userProfile.stravaAthleteId, owner_id),
  })
  if (!profile) {
    return NextResponse.json({ ok: true })
  }

  // Sync (errors caught so Strava always gets 200)
  try {
    await syncStravaActivity(profile.userId, object_id)
  } catch (err) {
    console.error('[webhook] sync error:', err)
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/strava/webhook/route.ts
git commit -m "feat: strava webhook handler — hub challenge + activity event dispatch"
```

---

## Task 7: Manual Sync Route

**Files:**
- Create: `app/api/strava/sync/route.ts`

- [ ] **Step 1: Create `app/api/strava/sync/route.ts`**

```ts
// app/api/strava/sync/route.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { userProfile } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { fetchStravaActivities, refreshStravaToken } from '@/lib/strava/client'
import { syncStravaActivity } from '@/lib/strava/sync-activity'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  const profile = await db.query.userProfile.findFirst({
    where: eq(userProfile.userId, userId),
  })
  if (!profile?.stravaAccessToken || !profile.stravaRefreshToken) {
    return NextResponse.json({ error: 'Strava not connected' }, { status: 400 })
  }

  // Refresh token if needed
  let accessToken = profile.stravaAccessToken
  const expiresAt = profile.stravaTokenExpiry?.getTime() ?? 0
  if (Date.now() >= expiresAt - 5 * 60 * 1000) {
    const tokens = await refreshStravaToken(profile.stravaRefreshToken)
    await db
      .update(userProfile)
      .set({
        stravaAccessToken:  tokens.access_token,
        stravaRefreshToken: tokens.refresh_token,
        stravaTokenExpiry:  new Date(tokens.expires_at * 1000),
      })
      .where(eq(userProfile.userId, userId))
    accessToken = tokens.access_token
  }

  // Fetch last 10 activities
  const activities = await fetchStravaActivities(accessToken, 10)

  let synced  = 0
  let skipped = 0

  for (const activity of activities) {
    if (activity.type !== 'Run' && activity.type !== 'VirtualRun') {
      skipped++
      continue
    }
    try {
      // syncStravaActivity handles dedup internally
      const before = synced
      await syncStravaActivity(userId, activity.id)
      // Check if stravaLastSyncAt was just updated (proxy for sync happening)
      const updated = await db.query.userProfile.findFirst({
        where: eq(userProfile.userId, userId),
      })
      if (updated?.stravaLastSyncAt && updated.stravaLastSyncAt > (profile.stravaLastSyncAt ?? new Date(0))) {
        synced++
      } else if (before === synced) {
        skipped++
      }
    } catch {
      skipped++
    }
  }

  return NextResponse.json({ synced, skipped })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/strava/sync/route.ts
git commit -m "feat: manual sync route — fetch last 10 activities, dedup via syncStravaActivity"
```

---

## Task 8: StravaSection Component + Profile Page Update

**Files:**
- Create: `components/profile/StravaSection.tsx`
- Modify: `app/(app)/profile/page.tsx`

- [ ] **Step 1: Create `components/profile/StravaSection.tsx`**

```tsx
// components/profile/StravaSection.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  isConnected:    boolean
  athleteName:    string | null
  lastSyncAt:     Date | null
}

function formatSyncDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date).replace(',', ' ·')
}

export function StravaSection({ isConnected, athleteName, lastSyncAt }: Props) {
  const router  = useRouter()
  const [syncing,      setSyncing]      = useState(false)
  const [syncResult,   setSyncResult]   = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res  = await fetch('/api/strava/sync', { method: 'POST' })
      const data = await res.json() as { synced: number; skipped: number }
      setSyncResult(data.synced === 0 ? 'Already up to date' : `Synced ${data.synced} run${data.synced === 1 ? '' : 's'}`)
    } catch {
      setSyncResult('Sync failed — try again')
    } finally {
      setSyncing(false)
      router.refresh()
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    await fetch('/api/strava/disconnect', { method: 'POST' })
    router.refresh()
  }

  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="text-[10px] uppercase tracking-widest text-muted mb-3">Strava</p>

      {!isConnected ? (
        <a
          href="/api/strava/auth"
          className="inline-block border border-accent text-accent text-xs px-4 py-2 rounded-sm hover:bg-accent hover:text-bg transition-colors"
        >
          Connect Strava
        </a>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm text-text">
              <span className="text-accent mr-1">✓</span>
              Connected{athleteName ? ` as ${athleteName}` : ''}
            </p>
            {lastSyncAt && (
              <p className="text-xs text-muted mt-0.5">
                Last synced: {formatSyncDate(lastSyncAt)}
              </p>
            )}
            {!lastSyncAt && (
              <p className="text-xs text-muted mt-0.5">Never synced</p>
            )}
          </div>

          {syncResult && (
            <p className="text-xs text-accent">{syncResult}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="border border-accent text-accent text-xs px-4 py-2 rounded-sm hover:bg-accent hover:text-bg transition-colors disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="border border-border text-muted text-xs px-4 py-2 rounded-sm hover:border-danger hover:text-danger transition-colors disabled:opacity-50"
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update `app/(app)/profile/page.tsx`**

Add `StravaSection` import at the top alongside the other profile imports:

```ts
import { StravaSection }    from '@/components/profile/StravaSection'
```

Inside `ProfilePage`, extend the existing `Promise.all` to fetch profile (already fetched), then pass strava fields. The only change needed is inserting `<StravaSection>` into the JSX after `<GarminUploadForm>`:

Replace the return statement's JSX body with:

```tsx
  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Account info */}
      <div className="rounded-lg bg-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted">Account</p>
        <p className="mt-2 text-sm text-text">{user?.email}</p>
        <p className="text-xs text-muted">Joined {joinedDate}</p>
      </div>

      {race && <GoalTimeForm currentGoalTimeMinutes={race.goalTimeMinutes} />}

      <GarminUploadForm lastUpdated={profile?.updatedAt ?? null} />

      <StravaSection
        isConnected={!!profile?.stravaAccessToken}
        athleteName={profile?.stravaAthleteName ?? null}
        lastSyncAt={profile?.stravaLastSyncAt ?? null}
      />

      <HrZonesDisplay maxHr={profile?.maxHr ?? null} age={profile?.age ?? null} />

      <TrainingSummary
        weeksCompleted={weeksCompleted}
        totalKmLogged={totalKmLogged}
        sessionsHit={sessionsHit}
        sessionsMissed={sessionsMissed}
      />

      {race && <EndRaceSection raceId={race.id} raceName={race.name} />}
    </div>
  )
```

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

```bash
npm test
```

Expected: all existing tests pass (StravaSection is a client component with no unit tests to add).

- [ ] **Step 4: Commit**

```bash
git add components/profile/StravaSection.tsx app/\(app\)/profile/page.tsx
git commit -m "feat: StravaSection component + wire into profile page"
```

---

## Task 9: E2E Tests

**Files:**
- Create: `e2e/strava.spec.ts`

- [ ] **Step 1: Create `e2e/strava.spec.ts`**

```ts
// e2e/strava.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Strava integration — profile page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/profile')
  })

  test('shows Connect Strava or redirects to login', async ({ page }) => {
    const url = page.url()
    if (url.includes('/login')) return // not logged in — acceptable
    await expect(page.locator('text=Strava')).toBeVisible()
  })

  test('profile page renders without crash', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.locator('main')).toBeVisible()
  })

  test('shows Connect Strava button when not connected', async ({ page }) => {
    if (page.url().includes('/login')) return
    // In CI, user won't have Strava connected — button should be visible
    const connectBtn = page.getByText('Connect Strava')
    const syncBtn    = page.getByText('Sync now')
    // Either Connect or Sync should exist (depending on test DB state)
    const hasConnect = await connectBtn.isVisible().catch(() => false)
    const hasSync    = await syncBtn.isVisible().catch(() => false)
    expect(hasConnect || hasSync).toBe(true)
  })

  test('Strava section is present on profile page', async ({ page }) => {
    if (page.url().includes('/login')) return
    // The section heading "STRAVA" is always rendered
    const stravaHeading = page.locator('text=Strava').first()
    await expect(stravaHeading).toBeVisible()
  })
})
```

- [ ] **Step 2: Run E2E tests**

```bash
npm run test:e2e -- e2e/strava.spec.ts
```

Expected: tests pass (or skip gracefully if not logged in).

- [ ] **Step 3: Run full test suite one final time**

```bash
npm test
```

Expected: all unit tests pass with no regressions.

- [ ] **Step 4: Final commit**

```bash
git add e2e/strava.spec.ts
git commit -m "test: E2E specs for Strava profile section"
```

---

## Self-Review Checklist

- [x] **OAuth connect flow** — auth redirect, callback with code exchange, token + athlete storage, webhook registration ✓ (Tasks 4)
- [x] **Token refresh** — `ensureFreshToken` in sync-activity + sync route ✓ (Tasks 3, 7)
- [x] **Webhook GET (hub challenge)** — verify token check, echo challenge ✓ (Task 6)
- [x] **Webhook POST (event dispatch)** — filter to create/activity, resolve userId via stravaAthleteId, call syncStravaActivity ✓ (Task 6)
- [x] **Dedup guard** — first check in syncStravaActivity ✓ (Task 3)
- [x] **Session matching ±36h** — window filter + nearest pick ✓ (Task 3)
- [x] **Activity filters** — Run type only, ≥1.0 km ✓ (Task 3)
- [x] **Quality score write** — distanceScore, paceScore, qualityScore, status, actuals ✓ (Task 3)
- [x] **stravaLastSyncAt update** — after each successful sync ✓ (Task 3)
- [x] **Orchestrator stub log** — when quality < 85 ✓ (Task 3)
- [x] **Disconnect** — delete webhook subscription, null all strava fields ✓ (Task 5)
- [x] **Manual sync route** — fetch 10 activities, call syncStravaActivity per run ✓ (Task 7)
- [x] **StravaSection UI** — connected/disconnected states, sync now, disconnect ✓ (Task 8)
- [x] **Profile page update** — StravaSection slotted in, strava fields passed from profile query ✓ (Task 8)
- [x] **Schema migration** — 4 new columns + generate + migrate ✓ (Task 1)
- [x] **Env vars** — STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, STRAVA_WEBHOOK_VERIFY_TOKEN, AUTH_URL ✓ (spec)
- [x] **Type consistency** — StravaActivity, StravaTokenResponse, StravaAthlete defined in client.ts and used consistently in sync-activity.ts, callback route ✓
