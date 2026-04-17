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

  let tokens, athlete, subscriptionId: number | null = null

  try {
    tokens = await exchangeCode(code)
    athlete = await fetchStravaAthlete(tokens.access_token)
  } catch (err) {
    console.error('[strava] callback error:', err)
    return NextResponse.redirect(
      new URL('/profile?error=strava_error', process.env.AUTH_URL!),
    )
  }

  const athleteName = `${athlete!.firstname} ${athlete!.lastname}`.trim()

  // Register webhook subscription
  const callbackUrl = `${process.env.AUTH_URL}/api/strava/webhook`
  try {
    subscriptionId = await registerStravaWebhook(
      callbackUrl,
      process.env.STRAVA_WEBHOOK_VERIFY_TOKEN!,
    )
  } catch (err) {
    console.warn('[strava] webhook registration failed:', err)
  }

  // Store everything on user_profile
  await db
    .update(userProfile)
    .set({
      stravaAccessToken:           tokens!.access_token,
      stravaRefreshToken:          tokens!.refresh_token,
      stravaTokenExpiry:           new Date(tokens!.expires_at * 1000),
      stravaAthleteId:             athlete!.id,
      stravaAthleteName:           athleteName,
      stravaWebhookSubscriptionId: subscriptionId,
    })
    .where(eq(userProfile.userId, userId))

  return NextResponse.redirect(new URL('/profile', process.env.AUTH_URL!))
}
