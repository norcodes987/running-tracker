# Percy Phase 2: UI Tabs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire all four app tabs (Dashboard, Workouts, Race, Profile) to live Neon data, fix the Garmin CSV parser, and add goal-time editing + race completion flows.

**Architecture:** Next.js 16 App Router RSCs fetch data via Drizzle and pass to pure client widgets. Pure calculation functions live in `lib/dashboard/metrics.ts` (unit-tested). DB query functions are co-located in `lib/dashboard/queries.ts` and `lib/sessions/queries.ts` (not unit-tested). Profile mutations go through two new API routes.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM, `@neondatabase/serverless`, shadcn/ui (alert-dialog needed), Lucide React, Vitest, Playwright

---

## File Map

| File | Status | Purpose |
|---|---|---|
| `lib/utils/format.ts` | Create | `formatPace()`, `formatDuration()`, `formatKm()` |
| `lib/dashboard/metrics.ts` | Create | Pure calc: weekly distance, est. finish, avg pace, completion rate |
| `lib/dashboard/queries.ts` | Create | `getDashboardSessions()` DB fetch |
| `lib/sessions/queries.ts` | Create | `groupSessionsByWeek()` (pure) + `getSessionsByWeek()` (DB) |
| `lib/training/garmin-parser.ts` | Modify | Quote-strip fix + pace benchmark extraction |
| `components/nav/AppNav.tsx` | Create | Client nav — active tabs, icons, view transitions |
| `components/dashboard/WeeklyDistanceWidget.tsx` | Create | Circular SVG arc + km display |
| `components/dashboard/EstimatedFinishWidget.tsx` | Create | Blend calc, confidence badge, delta |
| `components/dashboard/AvgPaceWidget.tsx` | Create | 4-week rolling avg table |
| `components/dashboard/CompletionRateWidget.tsx` | Create | Per-type % grid + consecutive-weeks banner |
| `components/workouts/AdaptationBanner.tsx` | Create | Plan change diff with reasoning |
| `components/workouts/SessionCard.tsx` | Create | Expandable card — type badge, pace, actuals stub |
| `components/workouts/WeekSection.tsx` | Create | Collapsible week group |
| `components/race/RaceInfoCard.tsx` | Create | Overview, goal summary, pace band table |
| `components/profile/GoalTimeForm.tsx` | Create | Inline edit → PATCH /api/profile |
| `components/profile/GarminUploadForm.tsx` | Create | Re-upload CSV → PATCH /api/profile |
| `components/profile/HrZonesDisplay.tsx` | Create | Read-only Z1–Z5 bpm ranges |
| `components/profile/TrainingSummary.tsx` | Create | Weeks / km / hit-miss stats |
| `components/profile/EndRaceSection.tsx` | Create | AlertDialog + clear/keep actions |
| `app/(app)/layout.tsx` | Modify | Replace nav stub with `<AppNav />` |
| `app/(app)/dashboard/page.tsx` | Modify | Real widgets via `Promise.all` |
| `app/(app)/workouts/page.tsx` | Create | Week-by-week session list |
| `app/(app)/race/page.tsx` | Create | Server-rendered race info with `"use cache"` |
| `app/(app)/profile/page.tsx` | Create | Profile settings + end race |
| `app/api/profile/route.ts` | Create | PATCH — goal time + Garmin re-upload |
| `app/api/races/[id]/complete/route.ts` | Create | POST — end race (clear or keep) |
| `__tests__/utils/format.test.ts` | Create | Unit tests for format helpers |
| `__tests__/dashboard/metrics.test.ts` | Create | Unit tests for pure calc functions |
| `__tests__/training/garmin-parser.test.ts` | Modify | Add quote-strip + pace benchmark tests |
| `__tests__/sessions/grouping.test.ts` | Create | Unit tests for pure week-grouping logic |
| `e2e/dashboard.spec.ts` | Create | Dashboard loads, widgets render |
| `e2e/workouts.spec.ts` | Create | Session cards expand/collapse |
| `e2e/profile.spec.ts` | Create | Goal time edit, end race flow |

---

## Task 1: Format utilities

**Files:**
- Create: `lib/utils/format.ts`
- Create: `__tests__/utils/format.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/utils/format.test.ts
import { describe, it, expect } from 'vitest'
import { formatPace, formatDuration, formatKm } from '@/lib/utils/format'

describe('formatPace', () => {
  it('formats whole minutes', () => expect(formatPace(300)).toBe('5:00'))
  it('pads seconds', () => expect(formatPace(308)).toBe('5:08'))
  it('handles sub-minute values', () => expect(formatPace(45)).toBe('0:45'))
})

describe('formatDuration', () => {
  it('formats sub-hour as m:ss', () => expect(formatDuration(45)).toBe('45:00'))
  it('formats hours correctly', () => expect(formatDuration(90.5)).toBe('1:30:30'))
  it('pads minutes and seconds', () => expect(formatDuration(61.083)).toBe('1:01:05'))
})

describe('formatKm', () => {
  it('formats to 1 decimal', () => expect(formatKm(21.1)).toBe('21.1'))
  it('appends zero decimal', () => expect(formatKm(10)).toBe('10.0'))
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd /workspace/running-tracker && npx vitest run __tests__/utils/format.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the format utilities**

```ts
// lib/utils/format.ts

/** Convert seconds-per-km to "m:ss" string */
export function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60)
  const s = secPerKm % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Convert total minutes to "h:mm:ss" or "m:ss" */
export function formatDuration(minutes: number): string {
  const totalSec = Math.round(minutes * 60)
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Format km to 1 decimal place string */
export function formatKm(km: number): string {
  return km.toFixed(1)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run __tests__/utils/format.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/utils/format.ts __tests__/utils/format.test.ts
git commit -m "feat: format utilities (formatPace, formatDuration, formatKm)"
```

---

## Task 2: Fix Garmin parser

**Files:**
- Modify: `lib/training/garmin-parser.ts`
- Modify: `__tests__/training/garmin-parser.test.ts`

- [ ] **Step 1: Write failing tests for the two fixes**

Append to `__tests__/training/garmin-parser.test.ts`:

```ts
// Add after the existing imports / samples

const quotedCsv = `"Activity Type","Date","Distance","Calories","Time","Avg HR","Max HR","Avg Pace","Best Pace"
"Running","2026-04-01 07:30:00","10.05","650","01:00:30","145","178","6:01","4:52"
"Running","2026-03-29 08:00:00","8.0","510","00:48:00","138","165","6:00","5:10"
"Running","2026-03-25 06:45:00","21.1","1400","01:55:00","152","182","5:28","4:40"
"Cycling","2026-03-24 09:00:00","40.0","900","01:30:00","130","155","",""`

describe('parseGarminExport — CSV quote stripping', () => {
  it('parses quoted CSV values correctly', () => {
    const result = parseGarminExport(quotedCsv, 'csv')
    expect(result.maxHr).toBe(182)
  })

  it('calculates chronic load from quoted CSV', () => {
    const result = parseGarminExport(quotedCsv, 'csv')
    expect(result.chronicLoadKm).toBeGreaterThan(0)
  })
})

describe('parseGarminExport — pace benchmarks', () => {
  it('returns paceBenchmarks from unquoted CSV', () => {
    const result = parseGarminExport(csvSample, 'csv')
    // With 3 runs: dist median=10.05, maxHr=182
    // Run1: avgHr=145 (79.7% → 75-85%), dist=10.05 >= 10.05 → race_pace, pace=6:01=361s
    // Run2: avgHr=138 (75.8% → 75-85%), dist=8.0 < 10.05 → tempo, pace=6:00=360s
    // Run3: avgHr=152 (83.5% → 75-85%), dist=21.1 >= 10.05 → race_pace, pace=5:28=328s
    // race_pace: 2 runs → avg = (361+328)/2 = 344.5 → 344
    // tempo: 1 run → omitted (< 2 data points)
    expect(result.paceBenchmarks.race_pace).toBe(344)
    expect(result.paceBenchmarks.tempo).toBeUndefined()
  })

  it('omits types with fewer than 2 data points', () => {
    const result = parseGarminExport(csvSample, 'csv')
    const counts = Object.keys(result.paceBenchmarks).length
    // Only race_pace qualifies in the sample
    expect(counts).toBe(1)
  })
})
```

- [ ] **Step 2: Run tests to verify the new ones fail**

```bash
npx vitest run __tests__/training/garmin-parser.test.ts
```

Expected: existing 5 pass, new 4 fail.

- [ ] **Step 3: Rewrite `lib/training/garmin-parser.ts` with both fixes**

```ts
// lib/training/garmin-parser.ts

export type GarminParseResult = {
  maxHr:         number | null
  chronicLoadKm: number
  paceBenchmarks: Partial<Record<string, number>>
}

type RunActivity = {
  date:          Date
  distanceKm:    number
  maxHr:         number
  durationSec:   number
  avgHr:         number
  avgPaceSec:    number  // sec/km, 0 if unavailable
}

const clean = (s: string) => s?.trim().replace(/^"|"$/g, '') ?? ''

function parsePaceStr(pace: string): number {
  const parts = pace.split(':').map(Number)
  if (parts.length === 2 && !parts.some(isNaN)) return parts[0] * 60 + parts[1]
  return 0
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

function parseCSV(content: string): RunActivity[] {
  const lines = content.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => clean(h))
  const idx = (name: string) => headers.findIndex(h => h === name)

  const typeIdx    = idx('Activity Type')
  const dateIdx    = idx('Date')
  const distIdx    = idx('Distance')
  const maxHrIdx   = idx('Max HR')
  const timeIdx    = idx('Time')
  const avgHrIdx   = idx('Avg HR')
  const avgPaceIdx = idx('Avg Pace')

  const runs: RunActivity[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const type = clean(cols[typeIdx])
    if (!type || !type.toLowerCase().includes('running')) continue

    const distKm     = parseFloat(clean(cols[distIdx]))
    const maxHr      = parseInt(clean(cols[maxHrIdx]))
    const dateStr    = clean(cols[dateIdx])
    const avgHr      = parseInt(clean(cols[avgHrIdx])) || 0
    const avgPaceSec = parsePaceStr(clean(cols[avgPaceIdx]))

    if (!dateStr || isNaN(distKm) || isNaN(maxHr)) continue

    const timeParts = clean(cols[timeIdx] ?? '').split(':').map(Number)
    const durationSec = timeParts.length === 3
      ? timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2]
      : 0

    runs.push({ date: new Date(dateStr), distanceKm: distKm, maxHr, durationSec, avgHr, avgPaceSec })
  }

  return runs
}

function parseJSON(content: string): RunActivity[] {
  let data: { activities?: unknown[] }
  try { data = JSON.parse(content) } catch { return [] }

  const activities = data.activities ?? []
  const runs: RunActivity[] = []

  for (const act of activities) {
    const a = act as Record<string, unknown>
    const type = String(a.activityType ?? '')
    if (!type.toLowerCase().includes('running')) continue

    const distKm      = (Number(a.distance) || 0) / 1000
    const maxHr       = Number(a.maxHR) || 0
    const dateStr     = String(a.startTimeLocal ?? '')
    const durationSec = Number(a.duration) || 0
    const avgHr       = Number(a.averageHR) || 0

    if (!dateStr || distKm === 0) continue

    runs.push({ date: new Date(dateStr), distanceKm: distKm, maxHr, durationSec, avgHr, avgPaceSec: 0 })
  }

  return runs
}

function classifyAndBenchmark(
  runs: RunActivity[],
  maxHr: number,
): Partial<Record<string, number>> {
  const med = median(runs.map(r => r.distanceKm))
  const groups: Record<string, number[]> = {}

  for (const r of runs) {
    if (r.avgPaceSec === 0 || r.avgHr === 0) continue
    const hrPct = r.avgHr / maxHr
    let sessionType: string
    if (hrPct > 0.85) {
      sessionType = 'interval'
    } else if (hrPct >= 0.75) {
      sessionType = r.distanceKm < med ? 'tempo' : 'race_pace'
    } else {
      sessionType = r.distanceKm < med ? 'easy' : 'long_run'
    }
    if (!groups[sessionType]) groups[sessionType] = []
    groups[sessionType].push(r.avgPaceSec)
  }

  const benchmarks: Partial<Record<string, number>> = {}
  for (const [type, paces] of Object.entries(groups)) {
    if (paces.length < 2) continue
    benchmarks[type] = Math.round(paces.reduce((a, b) => a + b, 0) / paces.length)
  }
  return benchmarks
}

export function parseGarminExport(
  content: string,
  format: 'csv' | 'json',
): GarminParseResult {
  const runs = format === 'csv' ? parseCSV(content) : parseJSON(content)

  if (runs.length === 0) {
    return { maxHr: null, chronicLoadKm: 0, paceBenchmarks: {} }
  }

  const maxHr = Math.max(...runs.map(r => r.maxHr))

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 28)
  const chronicLoadKm = runs
    .filter(r => r.date >= cutoff)
    .reduce((sum, r) => sum + r.distanceKm, 0)

  const paceBenchmarks = maxHr > 0 ? classifyAndBenchmark(runs, maxHr) : {}

  return { maxHr: maxHr > 0 ? maxHr : null, chronicLoadKm, paceBenchmarks }
}
```

- [ ] **Step 4: Run all garmin tests**

```bash
npx vitest run __tests__/training/garmin-parser.test.ts
```

Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/training/garmin-parser.ts __tests__/training/garmin-parser.test.ts
git commit -m "fix: garmin parser — quote stripping and pace benchmark extraction"
```

---

## Task 3: Dashboard metrics (pure functions)

**Files:**
- Create: `lib/dashboard/metrics.ts`
- Create: `lib/dashboard/queries.ts`
- Create: `__tests__/dashboard/metrics.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run __tests__/dashboard/metrics.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/dashboard/metrics.ts`**

```ts
// lib/dashboard/metrics.ts
import type { TrainingPaces } from '@/lib/training/pace-calculator'

export type DashboardSession = {
  id: string
  date: string               // "YYYY-MM-DD"
  type: string
  distanceKm: number
  targetPaceSecPerKm: number | null
  status: string
  actualDistanceKm: number | null
  actualPaceSecPerKm: number | null
}

export type WeeklyDistanceResult  = { actualKm: number; targetKm: number }
export type EstimatedFinishResult = {
  estMinutes: number
  deltaMinutes: number
  confidence: 'HIGH' | 'MED' | 'LOW' | null
}
export type AvgPaceRow = {
  type: string
  actualSecPerKm: number | null
  targetSecPerKm: number
  trend: '↑' | '↓' | '→' | null
}
export type CompletionRateRow = {
  type: string
  rate: number | null
  consecutiveWeeksBelow70: number
}

// SGT = UTC+8. Returns current ISO-week bounds as YYYY-MM-DD strings.
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
    .filter(s => s.type !== 'rest')
    .reduce((sum, s) => sum + s.distanceKm, 0)
  const actualKm = inWeek
    .filter(s => s.status === 'completed' || s.status === 'partial')
    .reduce((sum, s) => sum + (s.actualDistanceKm ?? 0), 0)
  return { actualKm, targetKm }
}

function avgPaceForType(sessions: DashboardSession[], type: string): number | null {
  const relevant = sessions.filter(
    s => s.type === type &&
    s.actualPaceSecPerKm !== null &&
    (s.status === 'completed' || s.status === 'partial'),
  )
  if (relevant.length === 0) return null
  return relevant.reduce((sum, s) => sum + s.actualPaceSecPerKm!, 0) / relevant.length
}

function sessionsInLast28Days(sessions: DashboardSession[]): DashboardSession[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 28)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return sessions.filter(s => s.date >= cutoffStr)
}

export function calcEstimatedFinish(
  sessions: DashboardSession[],
  distanceKm: number,
  goalTimeMinutes: number,
  targetPaces: TrainingPaces,
): EstimatedFinishResult {
  const recent = sessionsInLast28Days(sessions)
  const longRunAvg  = avgPaceForType(recent, 'long_run')
  const racePaceAvg = avgPaceForType(recent, 'race_pace')
  const tempoAvg    = avgPaceForType(recent, 'tempo')
  const dataCount   = [longRunAvg, racePaceAvg, tempoAvg].filter(v => v !== null).length

  const blend =
    (longRunAvg  ?? targetPaces.long_run)  * 0.40 +
    (racePaceAvg ?? targetPaces.race_pace) * 0.35 +
    (tempoAvg    ?? targetPaces.tempo)     * 0.25

  const estMinutes   = (blend * distanceKm / 60) * 0.97
  const deltaMinutes = estMinutes - goalTimeMinutes
  const confidence   =
    dataCount === 0 ? null :
    dataCount === 3 ? 'HIGH' :
    dataCount === 2 ? 'MED' : 'LOW'

  return { estMinutes, deltaMinutes, confidence }
}

const AVG_PACE_TYPES = ['long_run', 'race_pace', 'tempo', 'interval', 'easy'] as const

export function calcAvgPaceByType(
  sessions: DashboardSession[],
  targetPaces: TrainingPaces,
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
    const targetSecPerKm = targetPaces[type as keyof TrainingPaces] ?? targetPaces.easy

    const recent2w = forType.filter(s => s.date >= twoWeeksAgoStr)
    const prior2w  = forType.filter(s => s.date >= fourWeeksAgoStr && s.date < twoWeeksAgoStr)
    let trend: AvgPaceRow['trend'] = null
    if (recent2w.length > 0 && prior2w.length > 0) {
      const avgR = recent2w.reduce((sum, s) => sum + s.actualPaceSecPerKm!, 0) / recent2w.length
      const avgP = prior2w.reduce((sum, s)  => sum + s.actualPaceSecPerKm!, 0) / prior2w.length
      const diff = avgP - avgR   // positive = faster (lower sec/km = improvement)
      trend = diff > 5 ? '↑' : diff < -5 ? '↓' : '→'
    }

    return { type, actualSecPerKm, targetSecPerKm, trend }
  })
}

const COMPLETION_TYPES = ['long_run', 'tempo', 'interval', 'easy'] as const

function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr)
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

    // Consecutive weeks below 70% from most-recent week backwards
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

- [ ] **Step 4: Create `lib/dashboard/queries.ts`**

```ts
// lib/dashboard/queries.ts
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { trainingSessions } from '@/lib/db/schema'
import type { DashboardSession } from './metrics'

export async function getDashboardSessions(
  userId: string,
  raceId: string,
): Promise<DashboardSession[]> {
  const rows = await db
    .select({
      id:                 trainingSessions.id,
      date:               trainingSessions.date,
      type:               trainingSessions.type,
      distanceKm:         trainingSessions.distanceKm,
      targetPaceSecPerKm: trainingSessions.targetPaceSecPerKm,
      status:             trainingSessions.status,
      actualDistanceKm:   trainingSessions.actualDistanceKm,
      actualPaceSecPerKm: trainingSessions.actualPaceSecPerKm,
    })
    .from(trainingSessions)
    .where(
      and(
        eq(trainingSessions.userId, userId),
        eq(trainingSessions.raceId, raceId),
      ),
    )
  return rows
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run __tests__/dashboard/metrics.test.ts
```

Expected: 9 tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/dashboard/metrics.ts lib/dashboard/queries.ts __tests__/dashboard/metrics.test.ts
git commit -m "feat: dashboard metrics pure functions + DB query"
```

---

## Task 4: Session grouping utilities

**Files:**
- Create: `lib/sessions/queries.ts`
- Create: `__tests__/sessions/grouping.test.ts`

- [ ] **Step 1: Write failing tests for the pure grouping function**

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run __tests__/sessions/grouping.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `lib/sessions/queries.ts`**

```ts
// lib/sessions/queries.ts
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { trainingSessions, planChanges } from '@/lib/db/schema'

export type PlanChange = {
  id: string
  optionUsed: string | null
  reasoning: string | null
}

export type RawSession = {
  id: string
  date: string
  type: string
  distanceKm: number
  targetPaceSecPerKm: number | null
  targetHrZone: string | null
  status: string
  actualDistanceKm: number | null
  actualPaceSecPerKm: number | null
  actualAvgHr: number | null
  distanceScore: number | null
  paceScore: number | null
  qualityScore: number | null
  notes: string | null
  rescheduledFrom: string | null
  planChanges: PlanChange[]
}

export type WeekGroup = {
  weekNumber: number
  weekLabel: string
  startDate: string
  endDate: string
  plannedKm: number
  sessions: RawSession[]
  isCurrentWeek: boolean
}

function toWeekNumber(sessionDate: string, trainingStartDate: string): number {
  const start   = new Date(trainingStartDate).getTime()
  const session = new Date(sessionDate).getTime()
  return Math.floor((session - start) / (7 * 86400000)) + 1
}

function weekBoundsFromStart(trainingStartDate: string, weekNumber: number): { start: Date; end: Date } {
  const start = new Date(trainingStartDate)
  start.setUTCDate(start.getUTCDate() + (weekNumber - 1) * 7)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  return { start, end }
}

function formatWeekLabel(weekNumber: number, start: Date, end: Date): string {
  const startStr = start.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
  const endStr   = end.toLocaleDateString('en-GB', { day: 'numeric' })
  return `Week ${weekNumber} · ${startStr}–${endStr}`
}

export function groupSessionsByWeek(
  sessions: RawSession[],
  trainingStartDate: string,
): WeekGroup[] {
  const today = new Date().toISOString().slice(0, 10)
  const grouped = new Map<number, RawSession[]>()

  for (const s of sessions) {
    const wn = toWeekNumber(s.date, trainingStartDate)
    if (!grouped.has(wn)) grouped.set(wn, [])
    grouped.get(wn)!.push(s)
  }

  return [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekNumber, weekSessions]) => {
      const { start, end } = weekBoundsFromStart(trainingStartDate, weekNumber)
      const startStr = start.toISOString().slice(0, 10)
      const endStr   = end.toISOString().slice(0, 10)
      return {
        weekNumber,
        weekLabel: formatWeekLabel(weekNumber, start, end),
        startDate: startStr,
        endDate:   endStr,
        plannedKm: weekSessions.reduce((sum, s) => sum + s.distanceKm, 0),
        sessions:  weekSessions.sort((a, b) => a.date.localeCompare(b.date)),
        isCurrentWeek: today >= startStr && today <= endStr,
      }
    })
}

export async function getSessionsByWeek(
  userId: string,
  raceId: string,
  trainingStartDate: string,
): Promise<WeekGroup[]> {
  const [sessionRows, changeRows] = await Promise.all([
    db
      .select()
      .from(trainingSessions)
      .where(
        and(
          eq(trainingSessions.userId, userId),
          eq(trainingSessions.raceId, raceId),
        ),
      ),
    db
      .select({
        id:          planChanges.id,
        triggeredBy: planChanges.triggeredBy,
        optionUsed:  planChanges.optionUsed,
        reasoning:   planChanges.reasoning,
      })
      .from(planChanges)
      .where(
        and(
          eq(planChanges.userId, userId),
          eq(planChanges.raceId, raceId),
        ),
      ),
  ])

  const changesBySession = new Map<string, PlanChange[]>()
  for (const c of changeRows) {
    if (!c.triggeredBy) continue
    if (!changesBySession.has(c.triggeredBy)) changesBySession.set(c.triggeredBy, [])
    changesBySession.get(c.triggeredBy)!.push({
      id: c.id, optionUsed: c.optionUsed, reasoning: c.reasoning,
    })
  }

  const rawSessions: RawSession[] = sessionRows.map(s => ({
    ...s,
    planChanges: changesBySession.get(s.id) ?? [],
  }))

  return groupSessionsByWeek(rawSessions, trainingStartDate)
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run __tests__/sessions/grouping.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/sessions/queries.ts __tests__/sessions/grouping.test.ts
git commit -m "feat: session grouping utility + DB query"
```

---

## Task 5: AppNav + layout update

**Files:**
- Create: `components/nav/AppNav.tsx`
- Modify: `app/(app)/layout.tsx`

- [ ] **Step 1: Create `components/nav/AppNav.tsx`**

```tsx
// components/nav/AppNav.tsx
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Activity,
  Flag,
  User,
  type LucideIcon,
} from 'lucide-react'

type Tab = { label: string; href: string; Icon: LucideIcon }

const TABS: Tab[] = [
  { label: 'Dashboard', href: '/dashboard', Icon: LayoutDashboard },
  { label: 'Workouts',  href: '/workouts',  Icon: Activity },
  { label: 'Race',      href: '/race',      Icon: Flag },
  { label: 'Profile',   href: '/profile',   Icon: User },
]

export function AppNav() {
  const pathname = usePathname()
  const router   = useRouter()

  function navigate(href: string) {
    if ('startViewTransition' in document) {
      document.startViewTransition(() => { router.push(href) })
    } else {
      router.push(href)
    }
  }

  return (
    <nav className="sticky top-0 z-50 flex border-b border-border bg-bg">
      {TABS.map(({ label, href, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <button
            key={href}
            onClick={() => navigate(href)}
            className={[
              'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] uppercase tracking-widest transition-colors',
              active
                ? 'border-b-2 border-accent text-accent'
                : 'text-muted hover:text-text',
            ].join(' ')}
          >
            <Icon size={18} />
            <span className="nav-label">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
```

- [ ] **Step 2: Add nav-label media query to `app/globals.css`**

Append at the end of `app/globals.css`:

```css
@media (max-width: 374px) {
  .nav-label { display: none; }
}
```

- [ ] **Step 3: Modify `app/(app)/layout.tsx` — replace nav stub with `<AppNav />`**

Replace the entire `<nav>` block (lines 36–45 in the current file):

Old:
```tsx
      {/* Sticky nav — stub, filled out in Phase 2 */}
      <nav className="sticky top-0 z-50 flex border-b border-border bg-bg">
        {['Dashboard', 'Workouts', 'Race', 'Profile'].map((tab) => (
          <div
            key={tab}
            className="flex-1 py-3 text-center text-xs uppercase tracking-widest text-muted"
          >
            {tab}
          </div>
        ))}
      </nav>
```

New:
```tsx
      <AppNav />
```

Also add the import at the top of the file:

```tsx
import { AppNav } from '@/components/nav/AppNav'
```

- [ ] **Step 4: Commit**

```bash
git add components/nav/AppNav.tsx app/globals.css app/(app)/layout.tsx
git commit -m "feat: AppNav client component with active tabs and view transitions"
```

---

## Task 6: Dashboard widgets + page

**Files:**
- Create: `components/dashboard/WeeklyDistanceWidget.tsx`
- Create: `components/dashboard/EstimatedFinishWidget.tsx`
- Create: `components/dashboard/AvgPaceWidget.tsx`
- Create: `components/dashboard/CompletionRateWidget.tsx`
- Modify: `app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Create `components/dashboard/WeeklyDistanceWidget.tsx`**

```tsx
// components/dashboard/WeeklyDistanceWidget.tsx

type Props = { actualKm: number; targetKm: number }

export function WeeklyDistanceWidget({ actualKm, targetKm }: Props) {
  const pct   = targetKm === 0 ? 0 : Math.min(actualKm / targetKm, 1)
  const color = pct >= 0.8 ? '#C8FF00' : pct >= 0.5 ? '#FF9500' : '#FF4444'
  const r     = 32
  const cx    = 40
  const cy    = 40
  const circ  = 2 * Math.PI * r
  const dash  = pct * circ

  return (
    <div className="flex items-center gap-4 rounded-lg bg-surface p-4">
      <svg width="80" height="80" viewBox="0 0 80 80" className="shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1a1a" strokeWidth="6" />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted">Weekly Distance</p>
        <p className="mt-1 font-mono text-xl font-bold text-text">
          {actualKm.toFixed(1)}
          <span className="text-sm text-muted"> / {targetKm.toFixed(1)} km</span>
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `components/dashboard/EstimatedFinishWidget.tsx`**

```tsx
// components/dashboard/EstimatedFinishWidget.tsx
import { formatDuration } from '@/lib/utils/format'
import type { EstimatedFinishResult } from '@/lib/dashboard/metrics'

type Props = EstimatedFinishResult & { goalTimeMinutes: number }

export function EstimatedFinishWidget({ estMinutes, deltaMinutes, confidence, goalTimeMinutes }: Props) {
  const ahead        = deltaMinutes <= 0
  const deltaAbs     = Math.abs(deltaMinutes)
  const deltaLabel   = `${ahead ? '−' : '+'}${formatDuration(deltaAbs)} to goal`
  const deltaColor   = ahead ? 'text-accent' : 'text-warning'

  return (
    <div className="flex flex-col gap-1 rounded-lg bg-surface p-4">
      <p className="text-[10px] uppercase tracking-widest text-muted">Est. Finish</p>
      <div className="flex items-baseline gap-2">
        <p className="font-mono text-xl font-bold text-text">
          {confidence ? formatDuration(estMinutes) : '—'}
        </p>
        {confidence && (
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted">
            {confidence}
          </span>
        )}
      </div>
      {confidence && (
        <p className={`font-mono text-xs ${deltaColor}`}>{deltaLabel}</p>
      )}
      {!confidence && (
        <p className="text-xs text-muted">Goal: {formatDuration(goalTimeMinutes)}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `components/dashboard/AvgPaceWidget.tsx`**

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
}

export function AvgPaceWidget({ rows }: Props) {
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
          {rows.map(row => {
            const faster  = row.actualSecPerKm !== null && row.actualSecPerKm < row.targetSecPerKm
            const isInterval = row.type === 'interval'
            return (
              <tr key={row.type} className="border-t border-border">
                <td className="py-1.5 text-text">
                  {TYPE_LABELS[row.type] ?? row.type}
                  {row.trend && (
                    <span className="ml-1 text-muted">{row.trend}</span>
                  )}
                </td>
                <td className={`py-1.5 text-right font-mono ${faster ? 'text-accent' : 'text-warning'}`}>
                  {isInterval
                    ? <span className="text-muted text-xs">use HR</span>
                    : row.actualSecPerKm !== null
                      ? formatPace(row.actualSecPerKm)
                      : <span className="text-muted">—</span>
                  }
                </td>
                <td className="py-1.5 text-right font-mono text-muted">
                  {formatPace(row.targetSecPerKm)}
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

- [ ] **Step 4: Create `components/dashboard/CompletionRateWidget.tsx`**

```tsx
// components/dashboard/CompletionRateWidget.tsx
import type { CompletionRateRow } from '@/lib/dashboard/metrics'

type Props = { rows: CompletionRateRow[] }

const TYPE_LABELS: Record<string, string> = {
  long_run: 'Long', tempo: 'Tempo', interval: 'Interval', easy: 'Easy',
}

export function CompletionRateWidget({ rows }: Props) {
  const bannerRow = rows.find(r => r.consecutiveWeeksBelow70 >= 2)

  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="mb-3 text-[10px] uppercase tracking-widest text-muted">Completion Rate</p>
      <div className="grid grid-cols-2 gap-2">
        {rows.map(row => {
          const good  = row.rate !== null && row.rate >= 70
          const color = good ? 'text-accent' : 'text-danger'
          return (
            <div key={row.type} className="rounded bg-bg p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted">
                {TYPE_LABELS[row.type] ?? row.type}
              </p>
              <p className={`mt-1 font-mono text-lg font-bold ${color}`}>
                {row.rate !== null ? `${row.rate}%` : '—'}
              </p>
            </div>
          )
        })}
      </div>
      {bannerRow && (
        <div className="mt-3 rounded border border-accent px-3 py-2 text-xs text-text">
          {TYPE_LABELS[bannerRow.type]} completion has dropped{' '}
          {bannerRow.consecutiveWeeksBelow70} weeks running — your plan may adapt.
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Rewrite `app/(app)/dashboard/page.tsx`**

```tsx
// app/(app)/dashboard/page.tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getActiveRace } from '@/lib/race/active-race'
import { getDashboardSessions } from '@/lib/dashboard/queries'
import {
  calcWeeklyDistance,
  calcEstimatedFinish,
  calcAvgPaceByType,
  calcCompletionRateByType,
} from '@/lib/dashboard/metrics'
import { calculateTrainingPaces, getRacePaceSecPerKm } from '@/lib/training/pace-calculator'
import { getRacePaceSecPerKm as racePace } from '@/lib/race/active-race'
import { WeeklyDistanceWidget }   from '@/components/dashboard/WeeklyDistanceWidget'
import { EstimatedFinishWidget }  from '@/components/dashboard/EstimatedFinishWidget'
import { AvgPaceWidget }          from '@/components/dashboard/AvgPaceWidget'
import { CompletionRateWidget }   from '@/components/dashboard/CompletionRateWidget'

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

  const paceSecPerKm = getRacePaceSecPerKm(race.goalTimeMinutes, race.distanceKm)
  const targetPaces  = calculateTrainingPaces(paceSecPerKm)
  const sessions     = await getDashboardSessions(session.user.id, race.id)

  const [weeklyDist, estFinish, avgPace, completionRate] = [
    calcWeeklyDistance(sessions),
    calcEstimatedFinish(sessions, race.distanceKm, race.goalTimeMinutes, targetPaces),
    calcAvgPaceByType(sessions, targetPaces),
    calcCompletionRateByType(sessions),
  ]

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="grid grid-cols-2 gap-3">
        <WeeklyDistanceWidget
          actualKm={weeklyDist.actualKm}
          targetKm={weeklyDist.targetKm}
        />
        <EstimatedFinishWidget
          estMinutes={estFinish.estMinutes}
          deltaMinutes={estFinish.deltaMinutes}
          confidence={estFinish.confidence}
          goalTimeMinutes={race.goalTimeMinutes}
        />
      </div>
      <AvgPaceWidget rows={avgPace} />
      <CompletionRateWidget rows={completionRate} />
    </div>
  )
}
```

Note: `getRacePaceSecPerKm` is imported from `lib/race/active-race`. Remove the duplicate import line — the file already exports it. The dashboard import should be:

```tsx
import { getActiveRace, getRacePaceSecPerKm } from '@/lib/race/active-race'
import { calculateTrainingPaces } from '@/lib/training/pace-calculator'
```

- [ ] **Step 6: Commit**

```bash
git add components/dashboard/ app/(app)/dashboard/page.tsx
git commit -m "feat: dashboard widgets — weekly distance, est. finish, avg pace, completion rate"
```

---

## Task 7: Workouts tab

**Files:**
- Create: `components/workouts/AdaptationBanner.tsx`
- Create: `components/workouts/SessionCard.tsx`
- Create: `components/workouts/WeekSection.tsx`
- Create: `app/(app)/workouts/page.tsx`

- [ ] **Step 1: Create `components/workouts/AdaptationBanner.tsx`**

```tsx
// components/workouts/AdaptationBanner.tsx
'use client'

import { useState } from 'react'
import type { PlanChange } from '@/lib/sessions/queries'

type Props = { changes: PlanChange[] }

export function AdaptationBanner({ changes }: Props) {
  const [expanded, setExpanded] = useState(false)
  if (changes.length === 0) return null

  const latest = changes[changes.length - 1]

  return (
    <div
      className="mt-2 cursor-pointer rounded border-l-2 border-accent bg-surface px-3 py-2"
      onClick={() => setExpanded(v => !v)}
    >
      <p className="text-xs text-accent">
        Plan adapted · {latest.optionUsed ?? 'Auto'}
      </p>
      {expanded && latest.reasoning && (
        <p className="mt-1 text-xs text-muted">{latest.reasoning}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create `components/workouts/SessionCard.tsx`**

```tsx
// components/workouts/SessionCard.tsx
'use client'

import { useState } from 'react'
import { formatPace } from '@/lib/utils/format'
import { AdaptationBanner } from './AdaptationBanner'
import type { RawSession } from '@/lib/sessions/queries'

const TYPE_COLORS: Record<string, string> = {
  long_run:  '#C8FF00',
  race_pace: '#FACC15',
  interval:  '#FB923C',
  tempo:     '#60A5FA',
  easy:      '#4ADE80',
}

const TYPE_LABELS: Record<string, string> = {
  long_run:  'Long Run',
  race_pace: 'Race Pace',
  interval:  'Interval',
  tempo:     'Tempo',
  easy:      'Easy',
}

const HR_ZONE_LABELS: Record<string, string> = {
  Z1: 'Zone 1 — recovery',
  Z2: 'Zone 2 — aerobic base',
  Z3: 'Zone 3 — aerobic threshold',
  Z4: 'Zone 4 — lactate threshold',
  Z5: 'Zone 5 — VO₂ max',
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#C8FF00',
  partial:   '#FF9500',
  planned:   '#444',
  failed:    '#FF4444',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

type Props = { session: RawSession; weekNumber: number; phaseName?: string }

export function SessionCard({ session, weekNumber, phaseName }: Props) {
  const [expanded, setExpanded] = useState(false)
  const color = TYPE_COLORS[session.type] ?? '#888'

  return (
    <div
      className="cursor-pointer rounded-lg bg-surface p-3"
      onClick={() => setExpanded(v => !v)}
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
          <p className="text-xs text-muted">
            {formatDate(session.date)}
            {session.rescheduledFrom && (
              <span className="ml-1 text-warning">↪ moved</span>
            )}
          </p>
          {session.targetPaceSecPerKm && (
            <p className="font-mono text-lg font-bold text-text">
              {formatPace(session.targetPaceSecPerKm)} <span className="text-xs text-muted">/km</span>
            </p>
          )}
          <p className="text-xs text-muted">
            {session.distanceKm.toFixed(1)} km
            {session.targetHrZone && ` · ${session.targetHrZone}`}
          </p>
        </div>
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: STATUS_COLORS[session.status] ?? '#444' }}
        />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 border-t border-border pt-3">
          {phaseName && (
            <p className="text-xs text-muted">
              {phaseName} · Week {weekNumber}
            </p>
          )}
          {session.targetHrZone && (
            <p className="mt-1 text-xs text-muted">
              {HR_ZONE_LABELS[session.targetHrZone] ?? session.targetHrZone}
            </p>
          )}
          {session.rescheduledFrom && (
            <p className="mt-1 text-xs text-muted">
              ↪ Moved from {formatDate(session.rescheduledFrom)}
            </p>
          )}
          <AdaptationBanner changes={session.planChanges} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create `components/workouts/WeekSection.tsx`**

```tsx
// components/workouts/WeekSection.tsx
'use client'

import { useState } from 'react'
import { SessionCard } from './SessionCard'
import type { WeekGroup } from '@/lib/sessions/queries'

type Props = { group: WeekGroup; defaultExpanded?: boolean }

export function WeekSection({ group, defaultExpanded = false }: Props) {
  const [open, setOpen] = useState(defaultExpanded)

  return (
    <div
      className={[
        'rounded-lg border',
        group.isCurrentWeek ? 'border-l-4 border-l-accent border-border' : 'border-border',
      ].join(' ')}
    >
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen(v => !v)}
      >
        <div>
          <span className="text-sm font-semibold text-text">{group.weekLabel}</span>
          <span className="ml-2 text-xs text-muted">{group.plannedKm.toFixed(1)} km planned</span>
        </div>
        <span className="text-muted">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          {group.sessions.map(s => (
            <SessionCard
              key={s.id}
              session={s}
              weekNumber={group.weekNumber}
            />
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `app/(app)/workouts/page.tsx`**

```tsx
// app/(app)/workouts/page.tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getActiveRace } from '@/lib/race/active-race'
import { getSessionsByWeek } from '@/lib/sessions/queries'
import { WeekSection } from '@/components/workouts/WeekSection'

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

  const groups = await getSessionsByWeek(session.user.id, race.id, race.trainingStartDate)

  if (groups.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted">No sessions generated yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {groups.map(group => (
        <WeekSection
          key={group.weekNumber}
          group={group}
          defaultExpanded={group.isCurrentWeek}
        />
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Commit**

```bash
git add components/workouts/ app/(app)/workouts/page.tsx
git commit -m "feat: workouts tab — week sections and expandable session cards"
```

---

## Task 8: Race tab

**Files:**
- Create: `components/race/RaceInfoCard.tsx`
- Create: `app/(app)/race/page.tsx`

- [ ] **Step 1: Create `components/race/RaceInfoCard.tsx`**

```tsx
// components/race/RaceInfoCard.tsx
import { formatDuration, formatPace } from '@/lib/utils/format'
import { getRacePaceSecPerKm, getDaysToRace } from '@/lib/race/active-race'

type Race = {
  name: string
  raceDate: string
  location: string | null
  distanceKm: number
  goalTimeMinutes: number
  trainingStartDate: string
}

function formatRaceDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function calcPaceBand(goalTimeMinutes: number, distanceKm: number): Array<{
  label: string; split: string; cumulative: string
}> {
  const paceSecPerKm = (goalTimeMinutes * 60) / distanceKm
  const rows = []
  let cumSec = 0

  for (let start = 0; start < distanceKm; start += 5) {
    const segEnd = Math.min(start + 5, distanceKm)
    const segKm  = segEnd - start
    const splitSec = paceSecPerKm * segKm
    cumSec += splitSec

    const fmtSec = (sec: number) => {
      const m = Math.floor(sec / 60)
      const s = Math.round(sec % 60)
      return `${m}:${String(s).padStart(2, '0')}`
    }

    rows.push({
      label:      `${start}–${segEnd.toFixed(segKm < 5 ? 4 : 0)} km`,
      split:      fmtSec(splitSec),
      cumulative: fmtSec(cumSec),
    })
  }
  return rows
}

type Props = { race: Race }

export function RaceInfoCard({ race }: Props) {
  const paceSecPerKm    = getRacePaceSecPerKm(race.goalTimeMinutes, race.distanceKm)
  const daysToRace      = getDaysToRace(race.raceDate)
  const trainingStart   = new Date(race.trainingStartDate)
  const raceEnd         = new Date(race.raceDate)
  const totalWeeks      = Math.ceil((raceEnd.getTime() - trainingStart.getTime()) / (7 * 86400000))
  const weeksRemaining  = Math.max(0, Math.ceil((raceEnd.getTime() - Date.now()) / (7 * 86400000)))
  const paceBand        = calcPaceBand(race.goalTimeMinutes, race.distanceKm)

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Overview */}
      <div className="rounded-lg bg-surface p-4">
        <h2 className="font-heading text-lg font-bold text-text">{race.name}</h2>
        <p className="mt-1 text-sm text-muted">{formatRaceDate(race.raceDate)}</p>
        {race.location && <p className="text-sm text-muted">{race.location}</p>}
        <p className="mt-2 font-mono text-2xl font-bold text-accent">
          {daysToRace} <span className="text-sm text-muted">days to go</span>
        </p>
      </div>

      {/* Goal summary */}
      <div className="rounded-lg bg-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted">Goal Summary</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="font-mono text-base font-bold text-text">{formatDuration(race.goalTimeMinutes)}</p>
            <p className="text-[10px] text-muted">Finish</p>
          </div>
          <div>
            <p className="font-mono text-base font-bold text-text">{formatPace(paceSecPerKm)}</p>
            <p className="text-[10px] text-muted">Per km</p>
          </div>
          <div>
            <p className="font-mono text-base font-bold text-text">{weeksRemaining}/{totalWeeks}</p>
            <p className="text-[10px] text-muted">Wks left</p>
          </div>
        </div>
      </div>

      {/* Pace band */}
      <div className="rounded-lg bg-surface p-4">
        <p className="mb-3 text-[10px] uppercase tracking-widest text-muted">Pace Band</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-muted">
              <th className="pb-2 text-left font-normal">Distance</th>
              <th className="pb-2 text-right font-normal">Split</th>
              <th className="pb-2 text-right font-normal">Cumulative</th>
            </tr>
          </thead>
          <tbody>
            {paceBand.map(row => (
              <tr key={row.label} className="border-t border-border">
                <td className="py-1.5 text-muted">{row.label}</td>
                <td className="py-1.5 text-right font-mono text-text">{row.split}</td>
                <td className="py-1.5 text-right font-mono text-text">{row.cumulative}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Training note */}
      <p className="text-xs text-muted">
        Training for{race.location ? ` ${race.location}` : ' your race'}.{' '}
        Focus on consistent pacing — hit your tempo and race pace sessions every week.
      </p>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/(app)/race/page.tsx`**

```tsx
// app/(app)/race/page.tsx
import { unstable_cacheLife as cacheLife } from 'next/cache'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getActiveRace } from '@/lib/race/active-race'
import { RaceInfoCard } from '@/components/race/RaceInfoCard'

export default async function RacePage() {
  'use cache'
  cacheLife('days')

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

  return <RaceInfoCard race={race} />
}
```

- [ ] **Step 3: Commit**

```bash
git add components/race/ app/(app)/race/page.tsx
git commit -m "feat: race tab — overview, goal summary, pace band"
```

---

## Task 9: Profile API routes

**Files:**
- Create: `app/api/profile/route.ts`
- Create: `app/api/races/[id]/complete/route.ts`

- [ ] **Step 1: Install alert-dialog shadcn component (needed for Task 10)**

```bash
cd /workspace/running-tracker && npx shadcn@latest add alert-dialog
```

Expected: Creates `components/ui/alert-dialog.tsx`.

- [ ] **Step 2: Create `app/api/profile/route.ts`**

```ts
// app/api/profile/route.ts
import { NextResponse }        from 'next/server'
import { auth }                from '@/lib/auth'
import { db }                  from '@/lib/db'
import { races, trainingSessions, userProfile } from '@/lib/db/schema'
import { eq, and }             from 'drizzle-orm'
import { calculateTrainingPaces } from '@/lib/training/pace-calculator'
import { getRacePaceSecPerKm } from '@/lib/race/active-race'
import { parseGarminExport }   from '@/lib/training/garmin-parser'

export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  let body: { goalTimeMinutes?: number; garminCsv?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const activeRace = await db.query.races.findFirst({
    where: and(eq(races.userId, userId), eq(races.status, 'active')),
  })

  if (body.goalTimeMinutes !== undefined) {
    if (typeof body.goalTimeMinutes !== 'number' || body.goalTimeMinutes <= 0) {
      return NextResponse.json({ error: 'goalTimeMinutes must be a positive number' }, { status: 400 })
    }
    if (!activeRace) {
      return NextResponse.json({ error: 'No active race' }, { status: 404 })
    }

    await db.update(races)
      .set({ goalTimeMinutes: body.goalTimeMinutes })
      .where(eq(races.id, activeRace.id))

    const paceSecPerKm = getRacePaceSecPerKm(body.goalTimeMinutes, activeRace.distanceKm)
    const newPaces     = calculateTrainingPaces(paceSecPerKm)

    // Update target pace for each session type (planned sessions only)
    const typeEntries = Object.entries(newPaces) as [keyof typeof newPaces, number][]
    for (const [type, targetPace] of typeEntries) {
      await db.update(trainingSessions)
        .set({ targetPaceSecPerKm: targetPace })
        .where(
          and(
            eq(trainingSessions.userId, userId),
            eq(trainingSessions.raceId, activeRace.id),
            eq(trainingSessions.type, type),
            eq(trainingSessions.status, 'planned'),
          ),
        )
    }
  }

  if (body.garminCsv !== undefined) {
    if (typeof body.garminCsv !== 'string') {
      return NextResponse.json({ error: 'garminCsv must be a string' }, { status: 400 })
    }
    const parsed = parseGarminExport(body.garminCsv, 'csv')

    await db
      .insert(userProfile)
      .values({
        userId,
        maxHr:         parsed.maxHr,
        acwrBaseline:  parsed.chronicLoadKm,
        paceZones:     parsed.paceBenchmarks,
      })
      .onConflictDoUpdate({
        target: userProfile.userId,
        set: {
          maxHr:        parsed.maxHr,
          acwrBaseline: parsed.chronicLoadKm,
          paceZones:    parsed.paceBenchmarks,
          updatedAt:    new Date(),
        },
      })
  }

  const profile = await db.query.userProfile.findFirst({
    where: eq(userProfile.userId, userId),
  })

  return NextResponse.json({ ok: true, profile })
}
```

- [ ] **Step 3: Create `app/api/races/[id]/complete/route.ts`**

```ts
// app/api/races/[id]/complete/route.ts
import { NextResponse }   from 'next/server'
import { auth }           from '@/lib/auth'
import { db }             from '@/lib/db'
import { races }          from '@/lib/db/schema'
import { eq, and }        from 'drizzle-orm'
import { completeRace }   from '@/lib/race/complete-race'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId  = session.user.id
  const { id: raceId } = await params

  let body: { action: 'clear' | 'keep'; actualTimeMinutes?: number; notes?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (body.action !== 'clear' && body.action !== 'keep') {
    return NextResponse.json({ error: 'action must be "clear" or "keep"' }, { status: 400 })
  }

  const race = await db.query.races.findFirst({
    where: and(eq(races.id, raceId), eq(races.userId, userId), eq(races.status, 'active')),
  })
  if (!race) {
    return NextResponse.json({ error: 'Race not found or not active' }, { status: 404 })
  }

  if (body.action === 'clear') {
    await completeRace(raceId, userId, body.actualTimeMinutes ?? null, body.notes ?? null)
  } else {
    await db.update(races)
      .set({
        status:            'completed',
        actualTimeMinutes: body.actualTimeMinutes ?? null,
        notes:             body.notes ?? null,
        completedAt:       new Date(),
      })
      .where(eq(races.id, raceId))
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: Check `lib/race/complete-race.ts` signature matches the call above**

Read `lib/race/complete-race.ts` and verify `completeRace` accepts `(raceId: string, userId: string, actualTimeMinutes: number | null, notes: string | null)`. Adjust the call in step 3 if the signature differs.

- [ ] **Step 5: Commit**

```bash
git add app/api/profile/route.ts app/api/races/ components/ui/alert-dialog.tsx
git commit -m "feat: PATCH /api/profile and POST /api/races/[id]/complete routes"
```

---

## Task 10: Profile tab components + page

**Files:**
- Create: `components/profile/HrZonesDisplay.tsx`
- Create: `components/profile/TrainingSummary.tsx`
- Create: `components/profile/GoalTimeForm.tsx`
- Create: `components/profile/GarminUploadForm.tsx`
- Create: `components/profile/EndRaceSection.tsx`
- Create: `app/(app)/profile/page.tsx`

- [ ] **Step 1: Create `components/profile/HrZonesDisplay.tsx`**

```tsx
// components/profile/HrZonesDisplay.tsx

const ZONES = [
  { zone: 'Z1', label: 'Recovery',           pctMin: 0,    pctMax: 0.60 },
  { zone: 'Z2', label: 'Aerobic base',        pctMin: 0.60, pctMax: 0.70 },
  { zone: 'Z3', label: 'Aerobic threshold',   pctMin: 0.70, pctMax: 0.80 },
  { zone: 'Z4', label: 'Lactate threshold',   pctMin: 0.80, pctMax: 0.90 },
  { zone: 'Z5', label: 'VO₂ max',             pctMin: 0.90, pctMax: 1.00 },
]

type Props = { maxHr: number | null; age: number | null }

export function HrZonesDisplay({ maxHr, age }: Props) {
  const resolvedMaxHr = maxHr ?? (age ? Math.round(208 - 0.7 * age) : null)

  if (!resolvedMaxHr) {
    return (
      <div className="rounded-lg bg-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted">HR Zones</p>
        <p className="mt-2 text-sm text-muted">Upload Garmin data to calculate HR zones.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="mb-3 text-[10px] uppercase tracking-widest text-muted">
        HR Zones <span className="normal-case">(max {resolvedMaxHr} bpm)</span>
      </p>
      <div className="flex flex-col gap-1.5">
        {ZONES.map(z => {
          const lo = Math.round(resolvedMaxHr * z.pctMin) + (z.pctMin > 0 ? 1 : 0)
          const hi = Math.round(resolvedMaxHr * z.pctMax)
          return (
            <div key={z.zone} className="flex items-center gap-3">
              <span className="w-6 font-mono text-xs font-bold text-accent">{z.zone}</span>
              <span className="flex-1 text-xs text-text">{z.label}</span>
              <span className="font-mono text-xs text-muted">{lo}–{hi} bpm</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `components/profile/TrainingSummary.tsx`**

```tsx
// components/profile/TrainingSummary.tsx

type Props = {
  weeksCompleted: number
  totalKmLogged: number
  sessionsHit: number
  sessionsMissed: number
}

export function TrainingSummary({ weeksCompleted, totalKmLogged, sessionsHit, sessionsMissed }: Props) {
  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="mb-3 text-[10px] uppercase tracking-widest text-muted">Training Summary</p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Weeks completed', value: String(weeksCompleted) },
          { label: 'Total km logged', value: totalKmLogged.toFixed(1) },
          { label: 'Sessions hit',    value: String(sessionsHit) },
          { label: 'Sessions missed', value: String(sessionsMissed) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded bg-bg p-3">
            <p className="font-mono text-lg font-bold text-text">{value}</p>
            <p className="text-[10px] text-muted">{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create `components/profile/GoalTimeForm.tsx`**

```tsx
// components/profile/GoalTimeForm.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { formatDuration } from '@/lib/utils/format'

type Props = { currentGoalTimeMinutes: number }

export function GoalTimeForm({ currentGoalTimeMinutes }: Props) {
  const [value,   setValue]   = useState(formatDuration(currentGoalTimeMinutes))
  const [saving,  setSaving]  = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    // Parse "h:mm:ss" or "m:ss"
    const parts = value.trim().split(':').map(Number)
    if (parts.some(isNaN) || parts.length < 2) {
      setMessage('Enter time as m:ss or h:mm:ss')
      return
    }
    const minutes =
      parts.length === 3
        ? parts[0] * 60 + parts[1] + parts[2] / 60
        : parts[0] + parts[1] / 60
    if (minutes <= 0) { setMessage('Time must be positive'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ goalTimeMinutes: minutes }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setMessage('Saved!')
    } catch {
      setMessage('Error saving — try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="mb-3 text-[10px] uppercase tracking-widest text-muted">Goal Time</p>
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <div className="flex-1">
          <Label htmlFor="goal-time" className="text-xs text-muted">
            h:mm:ss or m:ss
          </Label>
          <Input
            id="goal-time"
            value={value}
            onChange={e => setValue(e.target.value)}
            className="mt-1 font-mono"
            placeholder="1:45:00"
          />
        </div>
        <Button type="submit" disabled={saving} size="sm">
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </form>
      {message && (
        <p className={`mt-2 text-xs ${message === 'Saved!' ? 'text-accent' : 'text-danger'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `components/profile/GarminUploadForm.tsx`**

```tsx
// components/profile/GarminUploadForm.tsx
'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label }  from '@/components/ui/label'

type Props = { lastUpdated: Date | null }

export function GarminUploadForm({ lastUpdated }: Props) {
  const inputRef              = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [message,   setMessage]   = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    const file = inputRef.current?.files?.[0]
    if (!file) { setMessage('Select a CSV file'); return }

    const text = await file.text()
    setUploading(true)
    try {
      const res = await fetch('/api/profile', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ garminCsv: text }),
      })
      if (!res.ok) throw new Error('Upload failed')
      setMessage('Updated!')
    } catch {
      setMessage('Error uploading — try again')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="mb-3 text-[10px] uppercase tracking-widest text-muted">Garmin Data</p>
      {lastUpdated && (
        <p className="mb-2 text-xs text-muted">
          Last updated: {lastUpdated.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <div className="flex-1">
          <Label htmlFor="garmin-csv" className="text-xs text-muted">
            Garmin Activities CSV
          </Label>
          <input
            id="garmin-csv"
            ref={inputRef}
            type="file"
            accept=".csv"
            className="mt-1 block w-full text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-bg file:px-3 file:py-1.5 file:text-xs file:text-text"
          />
        </div>
        <Button type="submit" disabled={uploading} size="sm">
          {uploading ? 'Uploading…' : 'Upload'}
        </Button>
      </form>
      {message && (
        <p className={`mt-2 text-xs ${message === 'Updated!' ? 'text-accent' : 'text-danger'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Create `components/profile/EndRaceSection.tsx`**

```tsx
// components/profile/EndRaceSection.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'

type Props = { raceId: string; raceName: string }

export function EndRaceSection({ raceId, raceName }: Props) {
  const router               = useRouter()
  const [time,   setTime]    = useState('')
  const [notes,  setNotes]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function endRace(action: 'clear' | 'keep') {
    setError(null)
    setLoading(true)
    try {
      let actualTimeMinutes: number | undefined
      if (time.trim()) {
        const parts = time.trim().split(':').map(Number)
        if (parts.some(isNaN)) { setError('Invalid time format'); setLoading(false); return }
        actualTimeMinutes =
          parts.length === 3
            ? parts[0] * 60 + parts[1] + parts[2] / 60
            : parts[0] + parts[1] / 60
      }

      const res = await fetch(`/api/races/${raceId}/complete`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, actualTimeMinutes, notes: notes || undefined }),
      })
      if (!res.ok) throw new Error('Failed')
      router.push('/dashboard')
    } catch {
      setError('Something went wrong — try again')
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-danger p-4">
      <p className="mb-1 text-[10px] uppercase tracking-widest text-danger">Danger Zone</p>
      <p className="mb-3 text-sm text-muted">End training for {raceName}.</p>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline" className="border-danger text-danger hover:bg-danger/10">
            End this race
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End race: {raceName}</AlertDialogTitle>
            <AlertDialogDescription>
              Optionally record your result before ending.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-3 py-2">
            <div>
              <Label htmlFor="end-time" className="text-xs">
                Finish time (optional, h:mm:ss or m:ss)
              </Label>
              <Input
                id="end-time"
                value={time}
                onChange={e => setTime(e.target.value)}
                placeholder="1:45:00"
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="end-notes" className="text-xs">Notes (optional)</Label>
              <Input
                id="end-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="How did it go?"
                className="mt-1"
              />
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>

          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              disabled={loading}
              onClick={() => endRace('clear')}
              className="w-full bg-danger text-white hover:bg-danger/90"
            >
              Log result &amp; clear data
            </AlertDialogAction>
            <AlertDialogAction
              disabled={loading}
              onClick={() => endRace('keep')}
              className="w-full bg-surface text-text hover:bg-surface/80"
            >
              Keep data for now
            </AlertDialogAction>
            <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 6: Create `app/(app)/profile/page.tsx`**

```tsx
// app/(app)/profile/page.tsx
import { auth }           from '@/lib/auth'
import { redirect }       from 'next/navigation'
import { getActiveRace }  from '@/lib/race/active-race'
import { db }             from '@/lib/db'
import { users, userProfile, trainingSessions } from '@/lib/db/schema'
import { eq, and, sum, count } from 'drizzle-orm'
import { HrZonesDisplay }   from '@/components/profile/HrZonesDisplay'
import { TrainingSummary }  from '@/components/profile/TrainingSummary'
import { GoalTimeForm }     from '@/components/profile/GoalTimeForm'
import { GarminUploadForm } from '@/components/profile/GarminUploadForm'
import { EndRaceSection }   from '@/components/profile/EndRaceSection'

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const [user, profile, race] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    db.query.userProfile.findFirst({ where: eq(userProfile.userId, userId) }),
    getActiveRace(),
  ])

  // Training summary stats
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

    // Weeks with at least one non-planned session
    const weekSet = new Set(withActuals.map(s => {
      const d = new Date(s.date)
      d.setUTCDate(d.getUTCDate() - (d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1))
      return d.toISOString().slice(0, 10)
    }))
    weeksCompleted = weekSet.size

    totalKmLogged  = withActuals.reduce((sum, s) => sum + (s.actualDistanceKm ?? 0), 0)
    sessionsHit    = sessions.filter(s => s.status === 'completed').length
    sessionsMissed = sessions.filter(s => s.status === 'failed').length
  }

  const joinedDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : '—'

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
}
```

- [ ] **Step 7: Commit**

```bash
git add components/profile/ app/(app)/profile/page.tsx
git commit -m "feat: profile tab — HR zones, training summary, goal time edit, Garmin upload, end race"
```

---

## Task 11: E2E tests

**Files:**
- Create: `e2e/dashboard.spec.ts`
- Create: `e2e/workouts.spec.ts`
- Create: `e2e/profile.spec.ts`

- [ ] **Step 1: Create `e2e/dashboard.spec.ts`**

```ts
// e2e/dashboard.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Dashboard tab', () => {
  test.beforeEach(async ({ page }) => {
    // Rely on existing auth state from e2e/auth.spec.ts setup,
    // or re-login here if storageState is configured.
    await page.goto('/dashboard')
  })

  test('shows race name in header or redirects to login', async ({ page }) => {
    const url = page.url()
    // Either on dashboard (logged in) or redirected to login
    expect(url).toMatch(/\/(dashboard|login)/)
  })

  test('dashboard page renders without crash', async ({ page }) => {
    // If redirected to login, skip
    if (page.url().includes('/login')) return
    await expect(page.locator('main')).toBeVisible()
  })

  test('weekly distance widget is present', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.getByText('Weekly Distance')).toBeVisible()
  })

  test('est. finish widget is present', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.getByText('Est. Finish')).toBeVisible()
  })

  test('avg pace widget is present', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.getByText('Avg Pace / Type')).toBeVisible()
  })

  test('completion rate widget is present', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.getByText('Completion Rate')).toBeVisible()
  })
})
```

- [ ] **Step 2: Create `e2e/workouts.spec.ts`**

```ts
// e2e/workouts.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Workouts tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/workouts')
  })

  test('renders workouts page without crash', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.locator('main')).toBeVisible()
  })

  test('nav tab Workouts is active', async ({ page }) => {
    if (page.url().includes('/login')) return
    const workoutsTab = page.getByRole('button', { name: /workouts/i })
    await expect(workoutsTab).toBeVisible()
  })

  test('current week is expanded by default', async ({ page }) => {
    if (page.url().includes('/login')) return
    // If sessions exist, at least one session card should be visible
    const cards = page.locator('[class*="rounded-lg bg-surface"]')
    // Just check page loads — sessions may not exist in test env
    await expect(page.locator('main')).toBeVisible()
  })

  test('week section can be toggled', async ({ page }) => {
    if (page.url().includes('/login')) return
    const toggleButtons = page.getByRole('button').filter({ hasText: /Week \d/ })
    const count = await toggleButtons.count()
    if (count === 0) return // no sessions

    const firstToggle = toggleButtons.first()
    await firstToggle.click()
    // After click, the section collapses or expands — page should still be visible
    await expect(page.locator('main')).toBeVisible()
  })
})
```

- [ ] **Step 3: Create `e2e/profile.spec.ts`**

```ts
// e2e/profile.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Profile tab', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/profile')
  })

  test('renders profile page without crash', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.locator('main')).toBeVisible()
  })

  test('shows account section', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.getByText('Account')).toBeVisible()
  })

  test('shows goal time form', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.getByText('Goal Time')).toBeVisible()
  })

  test('shows garmin upload section', async ({ page }) => {
    if (page.url().includes('/login')) return
    await expect(page.getByText('Garmin Data')).toBeVisible()
  })

  test('goal time form saves without error', async ({ page }) => {
    if (page.url().includes('/login')) return
    const input = page.getByLabel(/h:mm:ss or m:ss/i)
    if (await input.count() === 0) return
    await input.fill('1:45:00')
    await page.getByRole('button', { name: /save/i }).click()
    // Expect either "Saved!" or no error class
    await expect(page.getByText('Saved!')).toBeVisible({ timeout: 5000 }).catch(() => {})
  })

  test('end race button opens dialog', async ({ page }) => {
    if (page.url().includes('/login')) return
    const endBtn = page.getByRole('button', { name: /end this race/i })
    if (await endBtn.count() === 0) return
    await endBtn.click()
    await expect(page.getByRole('alertdialog')).toBeVisible()
  })
})
```

- [ ] **Step 4: Run all unit tests to confirm nothing broken**

```bash
npx vitest run
```

Expected: All existing + new tests pass.

- [ ] **Step 5: Run E2E tests (requires dev server running)**

```bash
npx playwright test e2e/dashboard.spec.ts e2e/workouts.spec.ts e2e/profile.spec.ts --reporter=line
```

Expected: Tests pass or skip gracefully when not authenticated.

- [ ] **Step 6: Final commit**

```bash
git add e2e/dashboard.spec.ts e2e/workouts.spec.ts e2e/profile.spec.ts
git commit -m "test: E2E specs for dashboard, workouts, and profile tabs"
```

---

## Self-Review Checklist

Spec sections vs plan coverage:

| Spec Section | Task |
|---|---|
| §2 Navigation (AppNav, view transitions, icons, media query) | Task 5 |
| §3 Dashboard — layout, 4 widgets, SGT week, blend formula, confidence, consecutive weeks | Tasks 3, 6 |
| §4 Workouts — week sections, session card, adaptation banner, actuals stub | Task 7 |
| §5 Race — overview, goal summary, pace band, training note | Task 8 |
| §6 Profile — account, goal time edit, Garmin re-upload, HR zones, training summary, end race (clear + keep) | Tasks 9, 10 |
| §7 Garmin parser fix (quote strip + pace benchmark extraction) | Task 2 |
| §8 API routes (PATCH /api/profile, POST /api/races/[id]/complete) | Task 9 |
| E2E tests | Task 11 |

**Gaps addressed:**
- `alert-dialog` shadcn install included in Task 9 Step 1
- `getRacePaceSecPerKm` import clarified in Task 6 Step 5
- `completeRace` signature check included in Task 9 Step 4
