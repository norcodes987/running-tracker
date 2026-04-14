# Percy the Pacer — Phase 2 Design Spec

**Date:** 2026-04-14
**Status:** Approved
**Phase:** 2 of 4 — UI Tabs

---

## 1. Overview

Phase 2 implements the four application tabs (Dashboard, Workouts, Race, Profile) and wires them to live data from the Neon DB. It also fixes the Garmin CSV parser and extracts pace benchmarks from real activity data.

Strava activity sync is Phase 4. For Phase 2, training sessions remain in `planned` status — dashboard widgets show graceful empty/zero states and the Workouts tab is read-only. All mutations (goal time edit, End Race) are fully implemented in Phase 2 since they are independent of Strava.

---

## 2. Navigation

`AppNav` is a client component (`'use client'`) that replaces the static nav stub in `app/(app)/layout.tsx`.

- Uses `usePathname()` to determine the active tab
- Active tab: `#C8FF00` bottom border (`border-b-2 border-accent`), text colour `text-accent`
- Inactive tabs: `text-muted`
- Links use `document.startViewTransition(() => router.push(href))` when the API is available, falling back to plain `router.push(href)`
- Below 375px: Lucide icons only — labels hidden via `@media (max-width: 374px) { .nav-label { display: none } .nav-icon { display: block } }`

**Tabs:**

| Label | href | Icon |
|---|---|---|
| Dashboard | `/dashboard` | `LayoutDashboard` |
| Workouts | `/workouts` | `Activity` |
| Race | `/race` | `Flag` |
| Profile | `/profile` | `User` |

---

## 3. Dashboard Tab

### Layout

Layout C — compact pair at top, two full-width sections below. Data fetched in parallel with `Promise.all()` in the server component. `React.cache()` used for `getActiveRace()` deduplication.

```
┌────────────────┬───────────────┐
│ Weekly Distance│  Est. Finish  │
├────────────────┴───────────────┤
│         Avg Pace (table)       │
├────────────────────────────────┤
│      Completion Rate (grid)    │
└────────────────────────────────┘
```

### Widget: Weekly Distance

- **Target km** — sum of `distance_km` for all non-rest planned sessions in the current ISO week (Mon–Sun, SGT = UTC+8)
- **Actual km** — sum of `actual_distance_km` for sessions with `status IN ('completed', 'partial')` in the same window
- **Display** — `"32.4 / 38.0 km"` with a circular SVG arc showing percentage
- **Arc colour** — chartreuse (`#C8FF00`) >80%, amber (`#FF9500`) 50–80%, red (`#FF4444`) <50%
- **Empty state** — `"0.0 / 38.0 km"` with red arc at 0%

SGT week calculation: convert `Date.now()` to SGT (add 8h), find Monday of that week, format as `YYYY-MM-DD` for DB string comparison.

### Widget: Estimated Finish Time

Blend formula (rolling 4-week actual paces):
```
blend      = (long_run_avg × 0.40) + (race_pace_avg × 0.35) + (tempo_avg × 0.25)
est_minutes = (blend × race.distanceKm / 60) × 0.97
```

When a type has no data, its target pace from `calculateTrainingPaces()` is used as a stand-in so the estimate is always shown (with reduced confidence).

- **Confidence badge** — `HIGH` (all 3 types have ≥1 actual), `MED` (2 types), `LOW` (1 type), hidden when no actuals at all
- **Delta** — `"−1:50 to goal"` (chartreuse if ahead, amber if behind)
- **Empty state** — no badge shown, displays goal time as `"Est. —"`

### Widget: Avg Pace Per Session Type

Rolling 4-week window. Session types shown: `long_run`, `race_pace`, `tempo`, `interval`, `easy`.

Columns: Type / Actual / Target

- **Actual colour** — chartreuse if actual pace < target (faster), amber if slower
- **Trend arrow** — compare most-recent 2 weeks vs prior 2 weeks within the 4-week window. ↑ if improving >5 sec/km, ↓ declining, → stable
- **Interval row** — pace column shows `"—"` with a note `"use HR"` (HR-based scoring, no target pace comparison)
- **Empty state** — `"—"` in actual column, target pace shown from `calculateTrainingPaces()`

### Widget: Completion Rate

Grid of 4 cells (Long / Tempo / Interval / Easy — rest excluded).

- **Value** — `(sessions with status 'completed' or 'partial') / (sessions where date ≤ today) × 100`, displayed as `"83%"`. Future scheduled sessions are excluded from the denominator.
- **Colour** — chartreuse if ≥70%, red (`#FF4444`) if <70%
- **Consecutive weeks banner** — if any type is <70% for 2+ consecutive weeks, a chartreuse-border banner appears below the grid:
  `"Interval completion has dropped 2 weeks running — your plan may adapt."`
- **Empty state** — all cells show `"—"`

### Data functions

Pure calculation functions in `lib/dashboard/metrics.ts` (testable, no DB):
- `calcWeeklyDistance(sessions)` → `{ actualKm, targetKm }`
- `calcEstimatedFinish(sessions, distanceKm, goalTimeMinutes)` → `{ estMinutes, deltaMinutes, confidence }`
- `calcAvgPaceByType(sessions, targetPaces)` → `AvgPaceRow[]`
- `calcCompletionRateByType(sessions)` → `CompletionRateRow[]`

DB query functions (not unit tested, use in RSC):
- `getDashboardSessions(userId, raceId)` — fetches all sessions for the active race in one query, used as input to all four calc functions

---

## 4. Workouts Tab

Scrollable week-by-week list. Current week expanded by default, all others collapsed. Read-only — no log run form. Strava will populate actuals in Phase 4.

### Week Section Header

`"Week 3 · Apr 14–20"` with total planned km for the week. Tap to expand/collapse. Current week: chartreuse left accent border.

Week number is computed relative to `race.trainingStartDate`.

### Session Card — Collapsed

- Type badge — coloured border + text, no fill
- Date — `"Sat 12 Apr"`
- Large typographic target pace — DM Mono 700, e.g. `"5:10 /km"`
- Planned distance + HR zone — `"18.0 km · Z2"`
- Status dot (right edge) — dark grey = planned, chartreuse = completed, amber = partial
- `"↪ moved"` tag beside date if `rescheduledFrom` is set

### Session Card — Expanded (tap to toggle)

Reveals below the collapsed row:
1. **Phase + week** — `"Build · Week 5"`
2. **HR zone description** — `"Zone 3 — lactate threshold"`
3. **Rescheduled note** — if `rescheduledFrom` set: `"↪ Moved from [original date]"`
4. **Adaptation banner** — if session has associated `planChanges` entries: chartreuse left-border card showing option used (`Option A` / `Option B`) + `reasoning` text. Tap banner to expand/collapse reasoning.

### Actuals section (hidden in Phase 2)

Quality score ring, distance score bar, and pace score bar are rendered in the component but hidden when `status = 'planned'` and `actualDistanceKm` is null. They surface automatically when Strava populates actuals in Phase 4 — no component changes needed.

### Type Badge Colours

| Type | Colour |
|---|---|
| `long_run` | chartreuse `#C8FF00` |
| `race_pace` | yellow `#FACC15` |
| `interval` | orange `#FB923C` |
| `tempo` | blue `#60A5FA` |
| `easy` | green `#4ADE80` |

### Data

`lib/sessions/queries.ts` — `getSessionsByWeek(userId, raceId)`:
- Fetches all sessions + associated plan changes in two queries
- Groups by ISO week, attaches plan changes per session
- Returns `WeekGroup[]` with `isCurrentWeek` flag

---

## 5. Race Tab

Server-rendered with `"use cache"` (revalidates daily). All content from the active race row.

### Content Sections

**Race overview** — race name, date (formatted `"Sat 5 Oct 2026"`), location, countdown `"42 days to go"`.

**Goal summary** — target finish time, required pace per km (`goalTimeMinutes × 60 / distanceKm` formatted as `"M:SS /km"`), training weeks remaining.

**Pace band table** — constant-pace splits every 5 km up to race distance.

| Distance | Split | Cumulative |
|---|---|---|
| 0–5 km | 23:40 | 23:40 |
| 5–10 km | 23:40 | 47:20 |
| … | … | … |
| 20–21.1 km | 5:13 | 1:40:00 |

Final segment uses the actual remaining distance (e.g. 1.0975 km for a half marathon).

**Training note** — static coaching text: `"Training for [location]. Focus on consistent pacing — hit your tempo and race pace sessions every week."` If no location set, omit the location reference.

---

## 6. Profile Tab

### Account info

Email (read-only), joined date from `users.createdAt`.

### Goal Time (editable)

Inline form with a `mm:ss` or `h:mm:ss` input. On save:

1. Parse input to `goalTimeMinutes` (float)
2. PATCH `/api/profile` with `{ goalTimeMinutes }`
3. Server recalculates `targetPaceSecPerKm` for all `planned` sessions in the active race via `calculateTrainingPaces()` and runs a single `db.update` scoped to `status = 'planned'` — past sessions are untouched
4. Returns updated `goalTimeMinutes`; client re-renders with new value

### Garmin Re-upload

File input accepting CSV. On submit:
1. Sends file to PATCH `/api/profile` with `{ garminCsv: string }`
2. Server runs fixed `parseGarminExport()`, updates `user_profile`: `maxHr`, `acwrBaseline`, `paceZones`
3. Shows `"Last updated: [userProfile.updatedAt]"` timestamp

Goal time and Garmin re-upload are separate form sections with separate submit actions — not combined.

### HR Zones Display

Read-only. Derived from `userProfile.maxHr` (or Tanaka estimate if null). Shows Z1–Z5 with bpm ranges and zone labels.

### Training Summary

Read-only stats from `trainingSessions` for the active race:
- Weeks completed (weeks with at least one non-planned session)
- Total km logged (sum of `actual_distance_km`)
- Sessions hit (`status = 'completed'`) vs missed (`status = 'failed'`)

Empty state: all zeroes — graceful, not hidden.

### End Race (Danger Zone)

"End this race" button (red border, `#FF4444`). Tap opens a shadcn `AlertDialog`.

Two actions:

**"Log result & clear data"**
- API route calls `completeRace(raceId, userId, actualTimeMinutes, notes)` from `lib/race/complete-race.ts` (Phase 1 — deletes sessions + plan changes, marks race complete)
- Redirects to `/dashboard` (Race Setup modal auto-opens — no active race)

**"Keep data for now"**
- API route does NOT call `completeRace()` (which always deletes). Instead runs a direct `db.update(races).set({ status: 'completed', actualTimeMinutes, notes, completedAt: new Date() })` with no deletes
- Redirects to `/dashboard`

The `AlertDialog` includes optional fields for actual finish time and notes before confirming either action.

API route: POST `/api/races/[id]/complete` with body `{ action: 'clear' | 'keep', actualTimeMinutes?: number, notes?: string }`.

---

## 7. Garmin Parser Fix

File: `lib/training/garmin-parser.ts`

### Fix 1 — Quote stripping

Current `split(',')` leaves surrounding `"..."` on all Garmin CSV values. Fix: after splitting, strip quotes from each cell:

```ts
const clean = (s: string) => s?.trim().replace(/^"|"$/g, '') ?? ''
```

Apply `clean()` before `parseFloat`, `parseInt`, and date parsing.

### Fix 2 — Pace benchmark extraction

Read `Avg Pace` (column index 12) and `Avg HR` (column index 7) from each run activity.

Parse pace string `"5:48"` → `5 × 60 + 48 = 348` sec/km.

Classification (requires `maxHr` to be computed first from the same dataset):

```
HR > 85% maxHr              → interval
HR 75–85% maxHr, dist < med → tempo
HR 75–85% maxHr, dist ≥ med → race_pace
HR < 75% maxHr,  dist < med → easy
HR < 75% maxHr,  dist ≥ med → long_run
```

Where `med` = median distance across all runs in the file.

Average the pace sec/km values per classified type. Return as `paceBenchmarks` in `GarminParseResult`. Types with fewer than 2 data points are omitted (insufficient signal).

`GarminParseResult` interface is unchanged — `paceBenchmarks` was already `Partial<Record<string, number>>`.

---

## 8. New API Routes

### PATCH `/api/profile`

Body (either or both):
```ts
{ goalTimeMinutes?: number, garminCsv?: string }
```

- Requires auth session
- If `goalTimeMinutes`: validate >0, update `races` goal + recalculate target paces on planned sessions
- If `garminCsv`: parse, update `user_profile`
- Returns updated profile fields

### POST `/api/races/[id]/complete`

Body:
```ts
{ action: 'clear' | 'keep', actualTimeMinutes?: number, notes?: string }
```

- Validates race belongs to authenticated user and is `active`
- `clear` → calls `completeRace()` transaction (deletes sessions + plan changes, marks complete)
- `keep` → updates race status + completion fields only, no deletes

---

## 9. File Map

| File | Status | Purpose |
|---|---|---|
| `lib/utils/format.ts` | Create | `formatPace()`, `formatDuration()`, `formatKm()` |
| `lib/dashboard/metrics.ts` | Create | Pure calc functions for all 4 dashboard widgets |
| `lib/sessions/queries.ts` | Create | `getSessionsByWeek()` — grouped with plan changes |
| `lib/training/garmin-parser.ts` | Modify | Fix quote stripping + extract pace benchmarks |
| `components/nav/AppNav.tsx` | Create | Client nav — active tabs, icons, view transitions |
| `components/dashboard/WeeklyDistanceWidget.tsx` | Create | Circular arc + km display |
| `components/dashboard/EstimatedFinishWidget.tsx` | Create | Blend calc, confidence badge, delta |
| `components/dashboard/AvgPaceWidget.tsx` | Create | 4-week rolling avg table |
| `components/dashboard/CompletionRateWidget.tsx` | Create | Per-type % grid + consecutive weeks banner |
| `components/workouts/SessionCard.tsx` | Create | Expandable card with type badge, pace, actuals stub |
| `components/workouts/WeekSection.tsx` | Create | Collapsible week group |
| `components/workouts/AdaptationBanner.tsx` | Create | Plan change diff with reasoning |
| `components/race/RaceInfoCard.tsx` | Create | Overview, goal summary, pace band |
| `components/profile/GoalTimeForm.tsx` | Create | Inline edit form → pace recalc |
| `components/profile/GarminUploadForm.tsx` | Create | Re-upload Garmin CSV |
| `components/profile/HrZonesDisplay.tsx` | Create | Read-only Z1–Z5 bpm ranges |
| `components/profile/TrainingSummary.tsx` | Create | Weeks, km, hit/miss stats |
| `components/profile/EndRaceSection.tsx` | Create | AlertDialog + two-action completion |
| `app/(app)/layout.tsx` | Modify | Replace nav stub with `<AppNav />` |
| `app/(app)/dashboard/page.tsx` | Modify | Real widgets via Promise.all |
| `app/(app)/workouts/page.tsx` | Create | Week-by-week session list |
| `app/(app)/race/page.tsx` | Create | Server-rendered race info with `"use cache"` |
| `app/(app)/profile/page.tsx` | Create | Profile settings + end race |
| `app/api/profile/route.ts` | Create | PATCH — goal time + Garmin re-upload |
| `app/api/races/[id]/complete/route.ts` | Create | POST — end race (clear or keep) |
| `__tests__/dashboard/metrics.test.ts` | Create | Unit tests for pure calc functions |
| `__tests__/training/garmin-parser.test.ts` | Modify | Add tests for quote-strip fix + pace benchmarks |
| `__tests__/sessions/queries.test.ts` | Create | Unit tests for session grouping logic |
| `e2e/dashboard.spec.ts` | Create | Dashboard loads, shows race name, widgets render |
| `e2e/workouts.spec.ts` | Create | Session cards expand/collapse |
| `e2e/profile.spec.ts` | Create | Goal time edit, end race flow |

---

## 10. Out of Scope for Phase 2

- Strava OAuth + webhook (Phase 4)
- Quality score display in session cards (needs actuals — Phase 4 activates it)
- Adaptive plan orchestration (Phase 3)
- PWA / service worker / offline caching (Phase 4)
- Manual log run form (removed — Strava is source of truth)
