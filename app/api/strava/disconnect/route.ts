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
