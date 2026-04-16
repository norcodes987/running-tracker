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

const WINDOW_MS          = 36 * 60 * 60 * 1000 // ±36 hours in milliseconds
const FALLBACK_WINDOW_MS =  7 * 24 * 60 * 60 * 1000 // 7-day makeup window

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

  // 7b. If no ±36h match, look back up to 7 days for a missed planned session
  let matched: (typeof allSessions)[0] | undefined

  if (candidates.length > 0) {
    // Pick nearest session within the ±36h window
    matched = candidates.reduce((nearest, s) => {
      const sDiff = Math.abs(new Date(s.date + 'T00:00:00Z').getTime() - activityTime)
      const nDiff = Math.abs(new Date(nearest.date + 'T00:00:00Z').getTime() - activityTime)
      return sDiff < nDiff ? s : nearest
    })
  } else {
    // Fallback: most recent planned session in the past 7 days (makeup run)
    const activityDayStart = new Date(activity.start_date.slice(0, 10) + 'T00:00:00Z')
    const sevenDaysAgo = new Date(activityDayStart.getTime() - FALLBACK_WINDOW_MS)

    const fallbackCandidates = allSessions
      .filter((s) => {
        const sessionDate = new Date(s.date + 'T00:00:00Z').getTime()
        return sessionDate < activityDayStart.getTime() && sessionDate >= sevenDaysAgo.getTime()
      })
      .sort(
        (a, b) =>
          new Date(b.date + 'T00:00:00Z').getTime() - new Date(a.date + 'T00:00:00Z').getTime(),
      )

    matched = fallbackCandidates[0]
  }

  if (!matched) {
    console.warn('[sync] no matching session for activity', stravaActivityId)
    return
  }

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
}
