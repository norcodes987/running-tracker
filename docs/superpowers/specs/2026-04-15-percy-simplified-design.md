# Percy — Simplified Design Spec

**Date:** 2026-04-15  
**Scope:** Replace generated training plan + quality-score system with CSV-uploaded plan, binary completion, and simplified dashboard.

---

## Goals

- User uploads their own training plan as a CSV (one time per race)
- Strava syncs actuals; user can manually override any session
- Completion = distance ≥ 100% of planned. Pace is never judged.
- Extra Strava runs (not in plan) are stored and shown separately
- Dashboard shows weekly distance, completion rate, and avg pace per type
- Profile stores target pace per type for user reference only

---

## What Is Removed

- Quality score system (`paceScore`, `qualityScore`, tolerance bands)
- Auto-generated training plan (periodization engine, Garmin FIT upload)
- Makeup run matching (7-day fallback)
- Estimated finish widget (relied on quality scores)
- `failed` session status
- HR zone targeting

---

## Data Layer

No schema migration. Existing `training_sessions` table is reused.

### Field usage going forward

| Field | Used? | Notes |
|---|---|---|
| `date` | ✅ | Session date from CSV |
| `type` | ✅ | `easy`, `tempo`, `interval`, `long_run`, `race_pace`, `bonus` |
| `distanceKm` | ✅ | Planned distance (from CSV). For bonus: equals actual. |
| `targetPaceSecPerKm` | ✅ | From CSV — display only, not used in calculations |
| `status` | ✅ | `planned` / `completed` / `partial` |
| `actualDistanceKm` | ✅ | From Strava or manual override |
| `actualPaceSecPerKm` | ✅ | From Strava or manual override |
| `actualAvgHr` | ✅ | From Strava (stored, not used in scoring) |
| `stravaActivityId` | ✅ | Dedup guard |
| `distanceScore` | ⚠️ | Written as `round(actualKm / plannedKm * 100)`, capped 100 |
| `paceScore` | ❌ | Left null |
| `qualityScore` | ❌ | Left null |
| `targetHrZone` | ❌ | Left in schema, not written |
| `rescheduledFrom` | ❌ | Left in schema, not written |
| `notes` | ⚠️ | Prefixed `__manual__` when user overrides actuals |
| `planChanges` table | ❌ | Table kept, nothing writes to it |

### Bonus sessions

Unmatched Strava activities are inserted as new rows:
- `type = 'bonus'`
- `status = 'completed'`
- `distanceKm = actualDistanceKm` (no separate planned target)
- `targetPaceSecPerKm = null`

---

## CSV Upload

### Format

```
date,type,km,target_pace
2026-04-16,tempo,7.0,5:18
2026-04-18,long_run,13.7,5:55
2026-04-19,easy,2.9,6:09
```

- `date`: `DD MMM` (e.g. `16 Apr`) or `YYYY-MM-DD`. Year inferred from race year.
- `type`: one of `easy`, `tempo`, `interval`, `long_run`, `race_pace`. Others rejected.
- `km`: positive float.
- `target_pace`: `mm:ss` string. Converted to `targetPaceSecPerKm`. Display only.

### Behaviour

- Upload UI: button on the Workouts page ("Upload Plan") and during race setup.
- On upload: all existing `planned` sessions for the race are deleted and replaced.
- Validation errors (unknown type, bad date, missing columns) return a clear error message and make no DB changes.
- `actualDistanceKm` and related actuals are never affected — only `planned` rows are replaced.

### API route

`POST /api/races/[id]/plan` — multipart form with CSV file. Returns `{ inserted: number }`.

---

## Strava Sync

### Simplified `syncStravaActivity` flow

1. **Dedup** — skip if `stravaActivityId` already in DB.
2. **Filter** — Run or VirtualRun only, ≥ 1.0 km.
3. **Match** — find `planned` sessions within ±36h of activity start. Pick nearest.
4. **If matched:**
   - Write `actualDistanceKm`, `actualPaceSecPerKm`, `actualAvgHr`, `stravaActivityId`.
   - `status = 'completed'` if `actualKm ≥ plannedKm`, else `'partial'`.
   - Skip write if `notes` starts with `__manual__` (user override takes precedence).
   - Update `stravaLastSyncAt` on `userProfile`.
5. **If no match:**
   - Insert new bonus session (type = `'bonus'`, status = `'completed'`).
   - Update `stravaLastSyncAt`.

The 7-day makeup fallback is removed.

---

## Manual Override

- User taps any completed session on the Workouts page to expand it.
- Inline edit fields: `actualDistanceKm` and `actualPaceSecPerKm`.
- On save: values written to DB, `notes` prefixed with `__manual__`.
- Strava re-sync will not overwrite sessions with `notes LIKE '__manual__%'`.

---

## Dashboard

Four widgets:

### Weekly Distance
Sum of `actualDistanceKm` for the current Mon–Sun week. Includes bonus runs.  
Target: sum of `distanceKm` for planned sessions this week.

### Completion Rate
`completed` sessions ÷ planned sessions whose `date ≤ today`.  
Bonus sessions excluded from both numerator and denominator.  
Shown as a percentage per session type.

### Avg Pace by Type
For each type with at least one completed session, show average `actualPaceSecPerKm` formatted as `mm:ss /km`.  
Types: `easy`, `tempo`, `interval`, `long_run`, `race_pace`, `bonus`.  
Sessions with no actual pace excluded from average.

### Estimated Finish
Removed.

---

## Profile Page

### Pace reference
Editable fields for target pace per type: `easy`, `tempo`, `interval`, `long_run`, `race_pace`.  
Stored in `userProfile.paceZones` JSON blob (already exists).  
Format: `mm:ss /km`. Display only — not used in any calculation.

### Strava section
Unchanged — connect/disconnect, last sync time, manual sync button.

---

## Workouts Page

Two sections:

### Training Plan
Sessions from CSV grouped by week. Each session card shows:
- Session type badge (colour-coded)
- Date
- Planned km
- Actual km + actual pace (if synced or manually set)
- Status dot: grey = planned, green = completed, orange = partial

### Extra Runs
Bonus sessions listed chronologically below the plan.  
Each row shows: date, distance, pace.  
No planned targets displayed.

---

## README Update

README rewritten to reflect the simplified feature set:
- CSV plan upload (not generated plan)
- Binary completion (not quality scores)
- Extra runs section
- Remove references to Garmin FIT upload, periodization, makeup matching, quality scores

---

## Out of Scope

- Deleting individual sessions from the plan
- Re-uploading plan mid-race (allowed but replaces all planned sessions)
- Multi-race support (unchanged — one active race at a time)
- Strava webhook changes (unchanged)
