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
      await syncStravaActivity(userId, activity.id)
      synced++
    } catch {
      skipped++
    }
  }

  await db
    .update(userProfile)
    .set({ stravaLastSyncAt: new Date() })
    .where(eq(userProfile.userId, userId))

  return NextResponse.json({ synced, skipped })
}
