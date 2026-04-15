import { NextResponse }        from 'next/server'
import { auth }                from '@/lib/auth'
import { db }                  from '@/lib/db'
import { races, trainingSessions, userProfile } from '@/lib/db/schema'
import { eq, and }             from 'drizzle-orm'
import { calculateTrainingPaces } from '@/lib/training/pace-calculator'
import { getRacePaceSecPerKm } from '@/lib/race/active-race'
import { parseGarminExport }   from '@/lib/training/garmin-parser'

export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  let body: { goalTimeMinutes?: number; garminCsv?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const activeRace = await db.query.races.findFirst({
    where: and(eq(races.userId, userId), eq(races.status, 'active')),
  })

  if (body.goalTimeMinutes !== undefined) {
    if (typeof body.goalTimeMinutes !== 'number' || body.goalTimeMinutes <= 0) {
      return NextResponse.json({ error: 'goalTimeMinutes must be a positive number' }, { status: 400 })
    }
    if (!activeRace) {
      return NextResponse.json({ error: 'No active race' }, { status: 404 })
    }

    await db.update(races)
      .set({ goalTimeMinutes: body.goalTimeMinutes })
      .where(eq(races.id, activeRace.id))

    const paceSecPerKm = getRacePaceSecPerKm(body.goalTimeMinutes, activeRace.distanceKm)
    const newPaces     = calculateTrainingPaces(paceSecPerKm)

    // Update target pace for each session type (planned sessions only)
    const typeEntries = Object.entries(newPaces) as [keyof typeof newPaces, number][]
    for (const [type, targetPace] of typeEntries) {
      await db.update(trainingSessions)
        .set({ targetPaceSecPerKm: targetPace })
        .where(
          and(
            eq(trainingSessions.userId, userId),
            eq(trainingSessions.raceId, activeRace.id),
            eq(trainingSessions.type, type),
            eq(trainingSessions.status, 'planned'),
          ),
        )
    }
  }

  if (body.garminCsv !== undefined) {
    if (typeof body.garminCsv !== 'string') {
      return NextResponse.json({ error: 'garminCsv must be a string' }, { status: 400 })
    }
    const parsed = parseGarminExport(body.garminCsv, 'csv')

    await db
      .insert(userProfile)
      .values({
        userId,
        maxHr:        parsed.maxHr,
        acwrBaseline: parsed.chronicLoadKm,
        paceZones:    parsed.paceBenchmarks,
      })
      .onConflictDoUpdate({
        target: userProfile.userId,
        set: {
          maxHr:        parsed.maxHr,
          acwrBaseline: parsed.chronicLoadKm,
          paceZones:    parsed.paceBenchmarks,
          updatedAt:    new Date(),
        },
      })
  }

  const profile = await db.query.userProfile.findFirst({
    where: eq(userProfile.userId, userId),
  })

  return NextResponse.json({ ok: true, profile })
}
