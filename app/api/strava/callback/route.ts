import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { userProfile } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import {
  exchangeCode,
  fetchStravaAthlete,
  registerStravaWebhook,
} from '@/lib/strava/client'

export async function GET(request: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', process.env.AUTH_URL!))
  }
  const userId = session.user.id

  const code = request.nextUrl.searchParams.get('code')
  if (!code) {
    return NextResponse.redirect(
      new URL('/profile?error=strava_denied', process.env.AUTH_URL!),
    )
  }

  // Exchange code for tokens
  const tokens = await exchangeCode(code)

  // Fetch athlete name
  const athlete = await fetchStravaAthlete(tokens.access_token)
  const athleteName = `${athlete.firstname} ${athlete.lastname}`.trim()

  // Register webhook subscription
  const callbackUrl = `${process.env.AUTH_URL}/api/strava/webhook`
  let subscriptionId: number | null = null
  try {
    subscriptionId = await registerStravaWebhook(
      callbackUrl,
      process.env.STRAVA_WEBHOOK_VERIFY_TOKEN!,
    )
  } catch (err) {
    // Non-fatal: webhook registration can fail if already registered
    console.warn('[strava] webhook registration failed:', err)
  }

  // Store everything on user_profile
  await db
    .update(userProfile)
    .set({
      stravaAccessToken:           tokens.access_token,
      stravaRefreshToken:          tokens.refresh_token,
      stravaTokenExpiry:           new Date(tokens.expires_at * 1000),
      stravaAthleteId:             athlete.id,
      stravaAthleteName:           athleteName,
      stravaWebhookSubscriptionId: subscriptionId,
    })
    .where(eq(userProfile.userId, userId))

  return NextResponse.redirect(new URL('/profile', process.env.AUTH_URL!))
}
