// app/api/strava/webhook/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { userProfile } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { syncStravaActivity } from '@/lib/strava/sync-activity'

// GET — Strava hub challenge verification
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const mode        = searchParams.get('hub.mode')
  const verifyToken = searchParams.get('hub.verify_token')
  const challenge   = searchParams.get('hub.challenge')

  if (
    mode !== 'subscribe' ||
    verifyToken !== process.env.STRAVA_WEBHOOK_VERIFY_TOKEN ||
    !challenge
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 400 })
  }

  return NextResponse.json({ 'hub.challenge': challenge })
}

// POST — Strava activity event
export async function POST(request: NextRequest) {
  let body: { object_type?: string; aspect_type?: string; owner_id?: unknown; object_id?: number }
  try {
    body = await request.json()
  } catch {
    // Malformed body — ack and discard
    return NextResponse.json({ ok: true })
  }

  const { object_type, aspect_type, owner_id, object_id } = body

  // Only process new run activity events
  if (object_type !== 'activity' || aspect_type !== 'create') {
    return NextResponse.json({ ok: true })
  }

  // Resolve userId from stravaAthleteId (coerce owner_id to number — Strava may send string)
  const athleteId = Number(owner_id)
  if (!Number.isFinite(athleteId)) {
    return NextResponse.json({ ok: true })
  }

  if (!object_id || typeof object_id !== 'number') {
    return NextResponse.json({ ok: true })
  }

  const profile = await db.query.userProfile.findFirst({
    where: eq(userProfile.stravaAthleteId, athleteId),
  })
  if (!profile) {
    return NextResponse.json({ ok: true })
  }

  // Sync (errors caught so Strava always gets 200)
  try {
    await syncStravaActivity(profile.userId, object_id)
  } catch (err) {
    console.error('[webhook] sync error:', err)
  }

  return NextResponse.json({ ok: true })
}
