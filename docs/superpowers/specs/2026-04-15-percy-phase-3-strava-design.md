# Percy the Pacer — Phase 3 Design Spec

**Date:** 2026-04-15
**Status:** Approved
**Phase:** 3 of 4 — Strava Integration

---

## 1. Overview

Phase 3 wires Strava activity data into Percy. When a user completes a run, Strava pushes an activity event to Percy's webhook. Percy fetches the activity detail, matches it to the nearest planned session, calculates a quality score, and writes the actuals to the DB. A "Sync now" button in the Profile tab provides a manual fallback and is the primary dev/testing path.

The adaptive plan orchestrator is **stubbed** — when a session scores below 85, Percy logs the trigger but takes no rescheduling action. Full orchestration is Phase 4.

---

## 2. Scope

**In scope:**
- Strava OAuth2 connect / disconnect
- Webhook subscription registration + verification
- Activity sync: session matching, quality score calculation, actuals write
- Profile tab Strava section (connection status, last sync, sync now, disconnect)
- Workouts tab quality score display (surfaces automatically — no component changes)
- Orchestrator stub
- Unit tests for sync logic + E2E for OAuth flow and sync

**Out of scope (Phase 4):**
- Adaptive plan orchestrator (Option A rules + Option B Gemini)
- PWA / service worker / offline caching
- Manual log run form

---

## 3. Architecture

Three layers added on top of the existing app:

```
┌─────────────────────────────────────────────────────┐
│  OAuth Layer                                        │
│  /api/strava/auth     → redirect to Strava OAuth    │
│  /api/strava/callback → exchange code, store tokens │
│  /api/strava/disconnect → revoke + null tokens      │
├─────────────────────────────────────────────────────┤
│  Webhook Handler                                    │
│  /api/strava/webhook  GET  → hub challenge          │
│                       POST → dispatch to sync       │
├─────────────────────────────────────────────────────┤
│  Sync Function (shared)                             │
│  lib/strava/sync-activity.ts                        │
│    ← called by webhook POST                         │
│    ← called by /api/strava/sync (manual trigger)    │
└─────────────────────────────────────────────────────┘
```

**New files:**
```
lib/strava/
  client.ts          ← Strava API wrapper (fetch activity, exchange + refresh token)
  sync-activity.ts   ← shared sync logic

app/api/strava/
  auth/route.ts      ← GET: redirect to Strava OAuth
  callback/route.ts  ← GET: exchange code, store tokens, register webhook
  disconnect/route.ts← POST: delete webhook subscription, null tokens
  webhook/route.ts   ← GET: hub challenge; POST: event dispatch
  sync/route.ts      ← POST: manual "Sync now" trigger

components/profile/
  StravaSection.tsx  ← new component slotted into existing profile page
```

---

## 4. Environment Variables

```
STRAVA_CLIENT_ID
STRAVA_CLIENT_SECRET
STRAVA_WEBHOOK_VERIFY_TOKEN   # random string for hub.challenge verification
AUTH_URL                      # already set — used to build callback + webhook URLs
```

---

## 5. Database Schema Changes

Four new nullable columns on `user_profile` (migration required):

```ts
stravaAthleteId:              integer('strava_athlete_id'),
stravaAthleteName:            text('strava_athlete_name'),
stravaWebhookSubscriptionId:  integer('strava_webhook_subscription_id'),
stravaLastSyncAt:             timestamp('strava_last_sync_at'),
```

`stravaAthleteId`, `stravaAthleteName`, and `stravaWebhookSubscriptionId` are written on OAuth callback. `stravaWebhookSubscriptionId` is needed to delete the subscription on disconnect. `stravaLastSyncAt` is updated by `syncStravaActivity()` (not `updatedAt`, which is also touched by Garmin re-upload). The three existing token columns (`stravaAccessToken`, `stravaRefreshToken`, `stravaTokenExpiry`) remain unchanged.

---

## 6. OAuth Flow

### Connect

1. Profile tab "Connect Strava" button → `GET /api/strava/auth`
2. Route builds Strava OAuth URL with scopes `activity:read_all` and redirects user
3. Strava redirects to `GET /api/strava/callback?code=...`
4. Callback handler:
   - Exchanges `code` for `access_token`, `refresh_token`, `expires_at` via Strava token endpoint
   - Fetches `GET /athlete` to get `id` and `firstname + lastname`
   - Writes tokens + athlete info to `user_profile`
   - Registers webhook subscription with Strava (`POST /push_subscriptions`) — callback URL: `{AUTH_URL}/api/strava/webhook`
   - Redirects to `/profile`

### Disconnect

1. "Disconnect" button → `POST /api/strava/disconnect`
2. Deletes webhook subscription from Strava (`DELETE /push_subscriptions/{id}`)
3. Nulls `stravaAccessToken`, `stravaRefreshToken`, `stravaTokenExpiry`, `stravaAthleteId`, `stravaAthleteName` on `user_profile`
4. Does **not** touch existing session actuals — already-synced data is kept
5. Redirects to `/profile`

---

## 7. Token Refresh

Inside `lib/strava/client.ts`, before every Strava API call:

- If `stravaTokenExpiry` is within 5 minutes of `Date.now()`, exchange refresh token for new tokens via Strava token endpoint
- Write new `stravaAccessToken`, `stravaRefreshToken`, `stravaTokenExpiry` back to `user_profile`
- Proceed with the original request using the new access token

---

## 8. Webhook Handler

**`app/api/strava/webhook/route.ts`**

### GET — Hub challenge verification
```
query: hub.mode = "subscribe"
       hub.verify_token = STRAVA_WEBHOOK_VERIFY_TOKEN
       hub.challenge = <random string>
response: { "hub.challenge": "<echo back>" }
```
Returns `400` if `hub.verify_token` does not match.

### POST — Activity event
```json
{
  "object_type": "activity",
  "aspect_type": "create",
  "owner_id": 12345,
  "object_id": 987654
}
```
- Only processes `object_type = "activity"` + `aspect_type = "create"`
- All other combinations (updates, deletes, athlete events) return `200` immediately
- Looks up `user_profile` by `stravaAthleteId = owner_id` to resolve `userId`
- If no matching user → return `200` (ignore)
- Calls `syncStravaActivity(userId, stravaActivityId)`
- Responds `200` immediately (Strava requires a fast response — sync runs synchronously but is fast)

---

## 9. Sync Function

**`lib/strava/sync-activity.ts`**

```ts
export async function syncStravaActivity(userId: string, stravaActivityId: number): Promise<void>
```

Steps:

1. **Fetch activity** — `GET /activities/{stravaActivityId}` via `lib/strava/client.ts`
   - Extract: `distance` (metres → km), `moving_time` (sec), `average_heartrate`, `average_speed` (m/s → sec/km), `start_date`

2. **Dedup guard** — check if any session for this user already has `stravaActivityId` set to this value. If found → return early (prevents webhook + manual sync racing)

3. **Session match** — find the nearest `planned` session within ±36h of `start_date`, belonging to the user's active race
   - If no match → log `console.log('[sync] no matching session for activity', stravaActivityId)` and return

4. **Quality score** — call `calculateQualityScore()` from `lib/training/quality-score.ts` with:
   - `type`, `plannedKm` (session `distanceKm`), `targetPaceSecPerKm` from the matched session
   - `actualKm`, `actualPaceSecPerKm`, `actualAvgHr` from the Strava activity

5. **Write actuals** — `db.update(trainingSessions)` on the matched session:
   ```ts
   {
     actualDistanceKm:   activityKm,
     actualPaceSecPerKm: activityPaceSec,
     actualAvgHr:        activity.average_heartrate ?? null,
     distanceScore:      result.distanceScore,
     paceScore:          result.paceScore,
     qualityScore:       result.qualityScore,
     status:             result.status,     // 'completed' | 'partial' | 'failed'
     stravaActivityId:   String(stravaActivityId),
   }
   ```

6. **Update last sync** — `db.update(userProfile).set({ stravaLastSyncAt: new Date() })`

7. **Orchestrator stub** — if `result.qualityScore < 85`:
   ```ts
   console.log('[orchestrator] stub — would trigger for session', sessionId, 'quality:', result.qualityScore)
   ```

---

## 10. Manual Sync Route

**`app/api/strava/sync/route.ts`** — `POST`, auth-gated

1. Fetches last 10 Strava activities via `GET /athlete/activities?per_page=10`
2. Calls `syncStravaActivity(userId, activity.id)` for each
3. The dedup guard inside `syncStravaActivity` silently skips already-synced activities
4. Returns `{ synced: N, skipped: M }`

---

## 11. Profile Tab — Strava Section

New component: `components/profile/StravaSection.tsx`
Slotted into existing `app/(app)/profile/page.tsx`.

### Disconnected state
```
[ Connect Strava ]   ← links to /api/strava/auth
```

### Connected state
```
✓ Connected as [stravaAthleteName]
Last synced: [userProfile.stravaLastSyncAt formatted as "15 Apr 2026 · 14:32"]

[ Sync now ]    [ Disconnect ]
```

- "Sync now" → POST `/api/strava/sync` → shows spinner on button → on success: shadcn toast `"Synced N runs"` (or `"Already up to date"` if N=0)
- "Disconnect" → POST `/api/strava/disconnect` → redirects to `/profile`

---

## 12. Workouts Tab — Quality Score Display

No component changes required. `SessionCard` already renders the quality score ring, distance/pace score bars, and actuals section, hidden when `status = 'planned'` and `actualDistanceKm` is null. These surface automatically once Strava populates actuals — Phase 2 was designed for this.

---

## 13. File Map

| File | Status | Purpose |
|---|---|---|
| `lib/strava/client.ts` | Create | Strava API wrapper — fetch activity, exchange token, refresh token |
| `lib/strava/sync-activity.ts` | Create | Shared sync logic — match, score, write, stub |
| `app/api/strava/auth/route.ts` | Create | GET: redirect to Strava OAuth |
| `app/api/strava/callback/route.ts` | Create | GET: exchange code, store tokens, register webhook |
| `app/api/strava/disconnect/route.ts` | Create | POST: delete webhook subscription, null tokens |
| `app/api/strava/webhook/route.ts` | Create | GET: hub challenge; POST: event dispatch |
| `app/api/strava/sync/route.ts` | Create | POST: manual sync trigger |
| `components/profile/StravaSection.tsx` | Create | Connection status, sync now, disconnect |
| `app/(app)/profile/page.tsx` | Modify | Slot in StravaSection |
| `lib/db/schema.ts` | Modify | Add `stravaAthleteId`, `stravaAthleteName` to `user_profile` |
| `drizzle/` | Migrate | Generate + run migration for schema change |
| `__tests__/strava/sync-activity.test.ts` | Create | Unit tests for sync logic |
| `e2e/strava.spec.ts` | Create | OAuth connect flow (mocked), sync now, actuals in session card |

---

## 14. Out of Scope for Phase 3

- Adaptive plan orchestrator — Option A (rule-based) and Option B (Gemini AI)
- PWA / service worker / offline caching
- Manual log run form
