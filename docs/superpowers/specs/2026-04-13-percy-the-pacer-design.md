# Percy the Pacer — Design Spec

**Date:** 2026-04-13  
**Status:** Approved

---

## 1. Overview

Percy the Pacer is a mobile-first PWA for half-marathon runners. It generates a personalised phase-based training plan from Garmin data (or physiological fallback), tracks session completion via Strava or manual logging, and adapts the plan automatically when sessions are missed or partially completed using either rule-based logic (Option A) or Gemini AI rescheduling (Option B).

One race at a time. One user per account. No queuing.

---

## 2. Tech Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16.2.x (App Router, Turbopack) |
| Language | TypeScript strict mode |
| Database | Neon DB (serverless Postgres) via Drizzle ORM |
| Auth | NextAuth v5 (Auth.js) — Credentials provider, bcrypt, DB sessions |
| Data fetching | SWR (client) + `React.cache()` (server deduplication) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Deployment | Vercel |
| PWA | next-pwa (manifest.json + service worker) |
| AI rescheduling | Google Gemini API (`gemini-2.0-flash`) |

**Next.js 16 constraints:**
- Turbopack is default — no webpack config
- Route protection via `proxy.ts` (not `middleware.ts`)
- All `params` and `searchParams` must be `await`ed
- Use `"use cache"` directive — not old fetch cache options
- Minimum Node.js: 20.9.0

---

## 3. Project Structure

```
/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── register/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx              ← sticky nav + race header
│   │   ├── dashboard/page.tsx
│   │   ├── workouts/page.tsx
│   │   ├── race/page.tsx
│   │   └── profile/page.tsx
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts
│   │   ├── races/route.ts
│   │   ├── sessions/route.ts
│   │   ├── adaptive-plan/ai-reschedule/route.ts
│   │   └── strava/
│   │       ├── callback/route.ts
│   │       └── webhook/route.ts
│   └── layout.tsx                  ← root: fonts, PWA meta
├── lib/
│   ├── auth.ts
│   ├── db/
│   │   └── schema.ts
│   ├── race/
│   │   ├── active-race.ts
│   │   └── complete-race.ts
│   ├── training/
│   │   ├── pace-calculator.ts
│   │   ├── periodization.ts        ← plan generation algorithm
│   │   └── quality-score.ts
│   └── adaptive-plan/
│       ├── orchestrator.ts
│       ├── option-a-rules.ts
│       └── option-b-ai.ts
├── components/
│   ├── race-setup/                 ← 3-step modal
│   ├── workouts/                   ← session cards, log-run form
│   └── dashboard/                  ← metric widgets
├── proxy.ts                        ← Next.js 16 route protection
└── public/
    └── manifest.json
```

Route groups `(auth)` and `(app)` share no layout — auth pages are standalone full-screen. All `(app)` routes share the sticky nav layout.

---

## 4. Database Schema

```ts
// lib/db/schema.ts
import { pgTable, uuid, text, integer, real,
         timestamp, date, jsonb } from 'drizzle-orm/pg-core'

// Auth
export const users = pgTable('users', {
  id:           uuid('id').primaryKey().defaultRandom(),
  email:        text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt:    timestamp('created_at').defaultNow(),
})

export const sessionsAuth = pgTable('sessions_auth', {
  id:        text('id').primaryKey(),
  userId:    uuid('user_id').references(() => users.id).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
})

// User physiological profile — persists across races
export const userProfile = pgTable('user_profile', {
  id:                    uuid('id').primaryKey().defaultRandom(),
  userId:                uuid('user_id').references(() => users.id).notNull().unique(),
  maxHr:                 integer('max_hr'),
  age:                   integer('age'),
  thresholdPaceSecPerKm: integer('threshold_pace_sec_per_km'),
  paceZones:             jsonb('pace_zones'),
  hrZones:               jsonb('hr_zones'),
  acwrBaseline:          real('acwr_baseline'),
  stravaAccessToken:     text('strava_access_token'),
  stravaRefreshToken:    text('strava_refresh_token'),
  stravaTokenExpiry:     timestamp('strava_token_expiry'),
  updatedAt:             timestamp('updated_at').defaultNow(),
})

// One race at a time per user. Completed races stay as the historical record.
export const races = pgTable('races', {
  id:                uuid('id').primaryKey().defaultRandom(),
  userId:            uuid('user_id').references(() => users.id).notNull(),
  name:              text('name').notNull(),
  raceDate:          date('race_date').notNull(),
  location:          text('location'),
  distanceKm:        real('distance_km').notNull().default(21.0975),
  goalTimeMinutes:   real('goal_time_minutes').notNull(),
  trainingStartDate: date('training_start_date').notNull(),
  fitnessLevel:      text('fitness_level').notNull(), // 'beginner' | 'building' | 'ready'
  status:            text('status').notNull().default('active'), // 'active' | 'completed'
  actualTimeMinutes: real('actual_time_minutes'),     // filled on completion
  notes:             text('notes'),                   // filled on completion
  completedAt:       timestamp('completed_at'),
  createdAt:         timestamp('created_at').defaultNow(),
})

// Training sessions — deleted when race is completed
export const trainingSessions = pgTable('training_sessions', {
  id:                 uuid('id').primaryKey().defaultRandom(),
  userId:             uuid('user_id').references(() => users.id).notNull(),
  raceId:             uuid('race_id').references(() => races.id).notNull(),
  date:               date('date').notNull(),
  type:               text('type').notNull(), // session type enum
  distanceKm:         real('distance_km').notNull(),
  targetPaceSecPerKm: integer('target_pace_sec_per_km'),
  targetHrZone:       text('target_hr_zone'),
  status:             text('status').notNull().default('planned'),
  actualDistanceKm:   real('actual_distance_km'),
  actualPaceSecPerKm: integer('actual_pace_sec_per_km'),
  actualAvgHr:        integer('actual_avg_hr'),
  distanceScore:      integer('distance_score'),
  paceScore:          integer('pace_score'),
  qualityScore:       integer('quality_score'),
  stravaActivityId:   text('strava_activity_id'),
  notes:              text('notes'),
  rescheduledFrom:    uuid('rescheduled_from'),
  createdAt:          timestamp('created_at').defaultNow(),
})

// Plan adaptation audit log — deleted with sessions on race completion
export const planChanges = pgTable('plan_changes', {
  id:          uuid('id').primaryKey().defaultRandom(),
  userId:      uuid('user_id').references(() => users.id).notNull(),
  raceId:      uuid('race_id').references(() => races.id).notNull(),
  triggeredBy: uuid('triggered_by').references(() => trainingSessions.id),
  optionUsed:  text('option_used'),   // 'A' | 'B'
  changes:     jsonb('changes'),
  reasoning:   text('reasoning'),
  createdAt:   timestamp('created_at').defaultNow(),
})
```

**No `race_results` table.** Completed races stay in `races` with `status = 'completed'`. The `actualTimeMinutes`, `notes`, and `completedAt` fields on the `races` row serve as the permanent result record.

---

## 5. Authentication

### Flow
1. `/login` — email + password → NextAuth Credentials → bcrypt.compare → DB session created
2. `/register` — email, password, confirm password → hash → insert `users` + `user_profile` → auto-login → Race Setup modal
3. All `(app)` routes protected via `proxy.ts` — unauthenticated → redirect `/login`
4. Session available via `auth()` server-side, `useSession()` client-side

### Route protection (`proxy.ts`)

```ts
import { auth } from '@/lib/auth'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const session = await auth()
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
                      request.nextUrl.pathname.startsWith('/register')

  if (!session && !isAuthRoute) {
    return Response.redirect(new URL('/login', request.url))
  }
  if (session && isAuthRoute) {
    return Response.redirect(new URL('/dashboard', request.url))
  }
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js).*)'],
}
```

### Auth page design
- Full-screen, centred, dark background (`#080808`)
- Logo "PERCY" in Barlow Condensed + "Train smarter. Race faster." tagline
- shadcn Form, Input, Button components
- Inline error using shadcn Alert — not toast
- Link between `/login` ↔ `/register`

---

## 6. Race Configuration

### Race Setup Modal
Triggered immediately after first login or after a race is completed. A full-screen shadcn Dialog — cannot be dismissed. Progress indicator at top (steps 1 / 2 / 3).

**Step 1 — Race Details**
- Race name (text)
- Race date (date picker, must be future)
- Race distance (select — Half Marathon 21.1km only)
- Race location (text)
- Training start date (date picker, defaults to tomorrow, must be < race date)

**Step 2 — Goal & Fitness**
- Goal finish time (mm:ss input, e.g. `1:40:00`)
- Current fitness level (select): `beginner` (<20km/week) | `building` (20–40km/week) | `ready` (40km+/week)

**Step 3 — Physiological Data**
- Age (number, required — used for Tanaka HR estimate)
- Max HR (number, optional — overrides Tanaka)
- Garmin export (file upload, optional — CSV/JSON)

**On completion:**
1. Save to `races` + `user_profile`
2. Run `generatePlan()` → insert all `training_sessions`
3. Redirect to `/dashboard`

### Constraint: one active race at a time
```ts
// app/api/races/route.ts
const existing = await db.query.races.findFirst({
  where: and(eq(races.userId, userId), eq(races.status, 'active')),
})
if (existing) return NextResponse.json({ error: '...' }, { status: 409 })
```

### Active race access
```ts
// lib/race/active-race.ts
export const getActiveRace = cache(async () => {
  const session = await auth()
  if (!session?.user?.id) return null
  return db.query.races.findFirst({
    where: and(eq(races.userId, session.user.id), eq(races.status, 'active')),
  })
})

export function getRacePaceSecPerKm(goalTimeMinutes: number, distanceKm: number) {
  return Math.round((goalTimeMinutes * 60) / distanceKm)
}

export function getDaysToRace(raceDate: Date) {
  return Math.ceil((raceDate.getTime() - Date.now()) / 86400000)
}
```

---

## 7. Race Lifecycle

### States
- `active` — currently training
- `completed` — race date passed or manually marked done

### Completing a race
1. Show Race Completion screen — "Race complete! How did it go?"
2. User enters actual finish time + optional notes
3. Two buttons: "Log result & clear data" | "Keep data for now"
4. On "Log result & clear data":
   - Delete all `plan_changes` rows for this race (FK first)
   - Delete all `training_sessions` rows for this race
   - Update `races`: `status = 'completed'`, write `actualTimeMinutes`, `notes`, `completedAt`
   - Redirect to Race Setup modal (for new race)

```ts
// lib/race/complete-race.ts
export async function completeRace(raceId: string, userId: string, actualTimeMinutes: number, notes?: string) {
  await db.transaction(async (tx) => {
    await tx.delete(planChanges).where(and(eq(planChanges.raceId, raceId), eq(planChanges.userId, userId)))
    await tx.delete(trainingSessions).where(and(eq(trainingSessions.raceId, raceId), eq(trainingSessions.userId, userId)))
    await tx.update(races)
      .set({ status: 'completed', actualTimeMinutes, notes, completedAt: new Date() })
      .where(and(eq(races.id, raceId), eq(races.userId, userId)))
  })
}
```

`user_profile` data (max HR, HR zones, Garmin benchmarks) is preserved across races.

---

## 8. Training Plan Generation

### Trigger
Runs once at Race Setup completion. Pure function: `generatePlan(race, userProfile) → TrainingSession[]`. No LLM involved — fully deterministic.

### Weekly session pattern (every week)
```
Mon  rest
Tue  interval
Wed  easy
Thu  tempo
Fri  rest
Sat  long_run
Sun  easy (base phase) | race_pace (build + peak phases)
```

1 interval and 1 tempo every week without exception.

### Phase structure (anchored to race date)
```
Taper  last 2 weeks    60% → 40% of peak volume; long_run capped at 10km
Peak   weeks 3–4       highest volume (100% of peak)
Build  weeks 5–9       +10% volume per week building toward peak
Base   remaining       aerobic foundation, steady volume
```

If training window < 13 weeks, phases compress proportionally. Taper (2 weeks) is always preserved.

### Peak week volume
```
beginner  →  35 km
building  →  50 km
ready     →  65 km
```
If Garmin 28-day chronic load is available, override: `peak = chronicLoad × 1.20`.

### Pace seeding
All target paces derived from `calculateTrainingPaces(racePaceSecPerKm)`:

```ts
// lib/training/pace-calculator.ts
export function calculateTrainingPaces(racePaceSecPerKm: number) {
  return {
    race_pace: Math.round(racePaceSecPerKm),
    tempo:     Math.round(racePaceSecPerKm * 1.12),
    long_run:  Math.round(racePaceSecPerKm * 1.25),
    easy:      Math.round(racePaceSecPerKm * 1.30),
    interval:  Math.round(racePaceSecPerKm * 0.93),
    recovery:  Math.round(racePaceSecPerKm * 1.45),
  }
}
```

Garmin pace benchmarks override these per session type if available.

### HR zones (from max HR)
```
z1 (recovery):  < 60% max_hr
z2 (easy):      60–70% max_hr
z3 (tempo):     70–80% max_hr
z4 (race pace): 80–90% max_hr
z5 (interval):  > 90% max_hr
```

Max HR = user-entered override → or Garmin extract → or Tanaka: `208 − (0.7 × age)`.

---

## 9. Session Types & Priority

```ts
export const SESSION_PRIORITY = {
  long_run:   5,  // never drop
  race_pace:  4,
  interval:   3,
  tempo:      2,
  easy:       1,  // most expendable
  rest:       0,
} as const

export type SessionType = keyof typeof SESSION_PRIORITY
```

---

## 10. Session Completion & Quality Score

### Distance score (0–100)
```
≥100% planned  → 100
85–99%         → proportional
50–84%         → proportional
<50%           → 0
```

### Pace score (0–100)
```
deviation  = actual_pace_sec_per_km − target_pace_sec_per_km
pace_score = clamp(100 − ((deviation / tolerance) × 100), 0, 100)
```
Tolerance bands:
```
easy:      ±45 sec/km  (inverted: penalise too fast)
long_run:  ±30 sec/km
tempo:     ±20 sec/km
race_pace: ±15 sec/km
interval:  skip — use HR score instead
```

### HR score for intervals
```
% of session time in z5 (>90% max_hr):
  ≥60%   → 100
  40–59% → proportional
  <40%   → 0
```

### Final quality score
```
quality_score = (distance_score × 0.5) + (pace_score × 0.5)

≥ 85  → completed  → no adaptation
60–84 → partial    → Option A
< 60  → failed     → orchestrator (may escalate to Option B)
```

---

## 11. Adaptive Plan

### Orchestrator (`lib/adaptive-plan/orchestrator.ts`)
Routes to **Option B (Gemini)** if ANY:
- 2+ missed sessions in last 14 days
- Missed session type is `long_run` or `race_pace`
- Days to race ≤ 14
- ACWR > 1.5

Otherwise routes to **Option A**.

### ACWR calculation
```
load   = distance_km × intensity_factor × 10
acwr   = acute_load (last 7 days) / chronic_load (4-week rolling avg)

< 0.8   → undertrained
0.8–1.3 → optimal
1.3–1.5 → risk — swap next session to easy
> 1.5   → danger — force Option B + rest day flag
```

### Option A — Rule-based (`lib/adaptive-plan/option-a-rules.ts`)
Applied in strict order:
1. Within 14 days of race → drop missed session, no reschedule
2. Easy run skipped → drop, no reschedule
3. Partial ≥80% complete → mark `completed`, no adaptation
4. Find next available slot:
   - Rest day → insert missed session
   - Easy run day → displace (drop) easy, insert missed session
   - Higher-priority session → push both, drop a later easy run
5. Never schedule past race date
6. Partial sessions: reschedule only remaining distance (planned − actual km)

### Option B — AI rescheduling (`lib/adaptive-plan/option-b-ai.ts`)
Uses `gemini-2.0-flash`. Sends: upcoming 14 sessions, missed session details, race context (name, days to race, goal time, taper phase), runner profile (weeks completed, sessions missed), ACWR status, Garmin readiness signals.

System prompt instructs Gemini: respond ONLY in JSON, no markdown, no preamble.

```json
{
  "actions": [
    {
      "action": "reschedule" | "drop" | "modify" | "add",
      "sessionId": "string | null",
      "newDate": "YYYY-MM-DD | null",
      "newDistanceKm": "number | null",
      "reason": "string"
    }
  ],
  "reasoning": "1–2 sentence coaching rationale",
  "confidence": "high" | "medium" | "low"
}
```

All actions applied server-side. Each written to `plan_changes` audit table.

---

## 12. Garmin Data Onboarding

Parsed at Race Setup Step 3 upload. Extracted:
- `max_hr` — highest HR across hard-effort activities
- Pace benchmarks per session type from recent runs → seed target paces
- Last 28 days activity load → seed ACWR chronic baseline

All stored on `user_profile` (persists across races).

---

## 13. Strava Integration

OAuth2 callback: `app/api/strava/callback/route.ts`  
Webhook: `app/api/strava/webhook/route.ts` (registered on OAuth setup)

On each activity sync:
- Ignore activities < 1.0 km
- Match to nearest planned session within ±36 hrs
- Calculate distance_score, pace_score, quality_score
- Paces derived from active race goal time (not hardcoded)
- Update session status + actuals in Neon DB
- If quality_score < 85 → trigger orchestrator

---

## 14. Navigation

Sticky top nav using shadcn `Tabs`:
```
[ Dashboard ]  [ Workouts ]  [ Race ]  [ Profile ]
```
- Sticky: `position: sticky; top: 0; z-index: 50`
- Active tab: `#C8FF00` bottom border (not filled background)
- Mobile <375px: icons only
- Slim header above nav: "PERCY" left + "X days · [Race Name]" right (from active race)
- Tab transitions: React 19.2 View Transitions API

---

## 15. Tab Specifications

### Tab 1 — Dashboard
Week window: Monday–Sunday, SGT timezone (UTC+8). All metrics from active race — no hardcoded values.

**a) Weekly Distance**
- Sum of `actual_distance_km` for completed/partial sessions Mon–Sun
- "32.4 / 38.0 km" + circular progress arc
- Green >80%, amber 50–80%, red <50%

**b) Estimated Finish Time**
```
blend      = (long_run_avg × 0.40) + (race_pace_avg × 0.35) + (tempo_avg × 0.25)
est_minutes = (blend × race.distanceKm / 60) × 0.97
```
Displayed as "Est. 1:42:30 · −2:30 to goal" with trend sparkline + confidence badge.

**c) Avg Pace Per Session Type (rolling 4-week)**
Table with columns: Type / Actual / Target. Actual coloured: chartreuse if ahead of target, amber if behind. Trend arrow (↑ faster >5 sec/km | → stable | ↓ declining).

**d) Completion Rate Per Session Type**
Grid of percentages. Red if <70%. Banner surfaces AI suggestion if <70% for 2+ consecutive weeks.

**Performance:** `Promise.all()` for all parallel dashboard fetches. SWR `dedupingInterval: 5000`. `React.cache()` on `getActiveRace()`.

### Tab 2 — Workouts
Scrollable week-by-week. Current week expanded by default.

Session card: type badge (colour-coded), date, large typographic target pace, planned distance + HR zone, status dot.  
Tap to expand: actuals, distance + pace quality bar breakdowns, quality score ring, adaptation history.

Adaptation diff banner (chartreuse left-border) when plan changes — tap to expand AI reasoning.

**Log Run** button (manual fallback): distance, duration, avg HR, notes. Quality score calculated on submit. Triggers orchestrator if quality < 85.

Rescheduled sessions show `↪ moved` tag.

### Tab 3 — Race
Server-rendered with `"use cache"` (revalidate: daily). Content from active race — not hardcoded.

1. Race overview: name, date, location, countdown
2. Course info: user-entered location details
3. Goal summary: target time, required pace, training weeks remaining
4. Training implications: flat course → pace work priority; climate delta note
5. Pace band: target splits per 5 km from goal time

### Tab 4 — Profile
- Email + account info
- Garmin export upload (re-upload to update benchmarks)
- Max HR + HR zones display
- Goal time (editable — recalculates all paces on save)
- Strava connection status + last sync timestamp
- Training summary: weeks completed, total km, sessions hit/missed
- Danger zone: "End this race" → confirm → `completeRace()` → Race Setup

---

## 16. Aesthetic Direction

**Concept:** Sports science lab meets running magazine. Precision tool for a focused athlete.

**Palette:**
```css
--bg:      #080808;
--surface: #111111;
--border:  #1e1e1e;
--accent:  #C8FF00;   /* electric chartreuse — for data, not decoration */
--danger:  #FF4444;
--warning: #FF9500;
--text:    #F5F5F5;
--muted:   #666666;
```

**Typography:**
- Display / metrics: `Barlow Condensed 700`
- Numerical data: `DM Mono`
- UI / copy: `Instrument Sans`

**Motion:**
- Session cards stagger in (40ms delay per card)
- Quality score ring: 0 → value on mount
- Status → completed: green flash + checkmark
- Tab transitions: React 19.2 View Transitions API
- ACWR danger: subtle pulse

**Layout rules:**
- Mobile-first, 48px min tap targets
- Asymmetric 2-col grid on dashboard
- Large typographic pace numbers anchor session cards
- Max 4px border-radius — no pill buttons
- Never: Inter/Roboto, purple gradients, generic shadows, confetti

---

## 17. Performance Requirements

- Dashboard < 1s on mobile 4G
- `Promise.all()` for all parallel dashboard fetches
- SWR `dedupingInterval: 5000` on all client hooks
- `React.cache()` for `getActiveRace()` — deduplicates per request
- `"use cache"` on Route & Race tab server components
- Dynamic import: charts, Garmin parser
- Optimistic updates on session status change
- PWA offline: cache today's session + dashboard snapshot
