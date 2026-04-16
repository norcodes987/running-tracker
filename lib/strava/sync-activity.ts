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
