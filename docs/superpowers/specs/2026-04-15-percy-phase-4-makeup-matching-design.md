# Percy the Pacer — Phase 4 Design Spec

**Date:** 2026-04-15  
**Status:** Approved  
**Phase:** 4 of 4 — Makeup Run Matching

---

## 1. Overview

Phase 4 adds makeup run matching to the Strava sync pipeline. When a user misses a planned session and then runs on a day with no scheduled workout, Percy retroactively credits the missed session with the makeup run's actuals and quality score.

This replaces the orchestrator stub added in Phase 3 with real matching logic. No orchestrator, no ACWR, no Gemini, no new routes, no UI changes.

---

## 2. Scope

**In scope:**
- Extend `syncStravaActivity()` with a 7-day fallback match for missed sessions
- Remove the Phase 3 orchestrator stub
- Unit tests for the new fallback logic
- Playwright E2E test for the makeup run scenario

**Out of scope:**
- ACWR calculation
- Adaptive plan orchestration (Option A rules or Option B AI)
- Plan change audit log (`plan_changes` table — schema exists but unused)
- UI changes (quality score display already works for matched sessions)

---

## 3. Matching Logic

### Current flow (unchanged)
```
1. Dedup guard — if any session already has this stravaActivityId → return early
2. ±36h match   — find nearest planned session within ±36h of activity start_date
3. No match     → log, return
```

### New flow
```
1. Dedup guard  — if any session already has this stravaActivityId → return early
2. ±36h match   — find nearest planned session within ±36h of activity start_date
3. No ±36h match → 7-day fallback:
     - Find the most recent session where:
         status = 'planned'
         scheduledDate >= (activityDate − 7 days)
         scheduledDate < activityDate
         userId + raceId match
     - Order by scheduledDate DESC, take first
4. No match found → log '[sync] no matching session for activity', return
5. Match found (either path) → write actuals + quality score (existing logic, unchanged)
```

### Key rules
- **First match wins:** `partial` and `completed` sessions are not eligible for the 7-day fallback. The fallback only matches `planned` sessions.
- **Most recent missed first:** if two sessions were missed in the last 7 days, the one closest to the activity date wins.
- **No future sessions:** `scheduledDate < activityDate` ensures only past missed sessions are eligible.
- **Actuals write is identical** regardless of which path matched — the same quality score calculation, status assignment, and DB update used in the ±36h path.

---

## 4. Orchestrator Stub Removal

The stub added in Phase 3 (`lib/strava/sync-activity.ts` lines 147–150):
```ts
// 11. Orchestrator stub
if (result.qualityScore < 85) {
  console.log('[orchestrator] stub — would trigger for session', matched.id, 'quality:', result.qualityScore)
}
```

Remove entirely. No replacement needed.

---

## 5. Files Changed

| File | Change |
|---|---|
| `lib/strava/sync-activity.ts` | Remove orchestrator stub; add 7-day fallback query after failed ±36h match |
| `__tests__/strava/sync-activity.test.ts` | Add unit test cases for fallback matching |
| `e2e/strava.spec.ts` | Add E2E scenario: missed session credited by makeup run |

---

## 6. Unit Tests

New test cases in `__tests__/strava/sync-activity.test.ts`:

| Scenario | Expected outcome |
|---|---|
| Activity on Day 5, planned session missed on Day 2 (3 days ago) | Matched to Day 2 session |
| Activity on Day 5, planned session missed on Day −3 (8 days ago) | No match — outside 7-day window |
| Activity on Day 5, two missed sessions (Day 2 and Day 4) | Matched to Day 4 (most recent) |
| Activity on Day 5, Day 4 session is `partial` (already has actuals) | No fallback match — `partial` ineligible |
| Activity on Day 5, Day 4 session is `completed` | No fallback match — `completed` ineligible |
| Activity on Day 5, Day 4 has a `planned` session (±36h match fires first) | ±36h path taken, fallback not reached |

---

## 7. E2E Tests

New scenario in `e2e/strava.spec.ts`:

**Missed session → makeup run credited**
1. Seed a planned session dated 3 days ago (status `planned`, no actuals)
2. Seed today as having no planned session
3. POST to `/api/strava/sync` (mocked Strava returning a run activity for today)
4. Assert the 3-day-old session now has `status = 'completed'` (or `partial` depending on distance), `actualDistanceKm` populated, `qualityScore` set
5. Assert the session card in the Workouts tab reflects the actuals

---

## 8. Non-Goals

- No changes to `plan_changes` table (schema exists, remains unused)
- No changes to ACWR baseline or any orchestration logic
- No changes to the webhook handler, sync route, or OAuth flow
- No changes to any UI components
