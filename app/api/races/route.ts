import { NextResponse } from 'next/server'
import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { races, trainingSessions, userProfile } from '@/lib/db/schema'
import { generatePlan } from '@/lib/training/periodization'
import { parseGarminExport } from '@/lib/training/garmin-parser'

const createRaceSchema = z.object({
  name:              z.string().min(1),
  raceDate:          z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  distanceKm:        z.number().positive(),
  location:          z.string().optional(),
  trainingStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  goalTimeMinutes:   z.number().positive(),
  fitnessLevel:      z.enum(['beginner', 'building', 'ready']),
  // Physiological data
  age:               z.number().int().min(10).max(100).optional(),
  maxHr:             z.number().int().min(100).max(250).optional(),
  garminData:        z.string().optional(),  // raw CSV or JSON string
  garminFormat:      z.enum(['csv', 'json']).optional(),
})

export async function POST(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const body = await request.json()
  const parsed = createRaceSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const data = parsed.data

  // Enforce one active race at a time
  const existingActive = await db.query.races.findFirst({
    where: and(eq(races.userId, userId), eq(races.status, 'active')),
  })

  if (existingActive) {
    return NextResponse.json(
      { error: 'You already have an active race. Complete it before starting a new one.' },
      { status: 409 }
    )
  }

  // Parse Garmin data if provided
  let garminResult = null
  if (data.garminData && data.garminFormat) {
    garminResult = parseGarminExport(data.garminData, data.garminFormat)
  }

  // Compute max HR
  const tanakaMhr = data.age ? Math.round(208 - 0.7 * data.age) : null
  const maxHr = data.maxHr ?? garminResult?.maxHr ?? tanakaMhr ?? 180

  // Update user profile
  await db
    .update(userProfile)
    .set({
      age:          data.age,
      maxHr,
      hrZones: {
        z1: { max: Math.round(maxHr * 0.60) },
        z2: { min: Math.round(maxHr * 0.60), max: Math.round(maxHr * 0.70) },
        z3: { min: Math.round(maxHr * 0.70), max: Math.round(maxHr * 0.80) },
        z4: { min: Math.round(maxHr * 0.80), max: Math.round(maxHr * 0.90) },
        z5: { min: Math.round(maxHr * 0.90) },
      },
      acwrBaseline: garminResult?.chronicLoadKm
        ? garminResult.chronicLoadKm / 4  // weekly avg
        : null,
      updatedAt: new Date(),
    })
    .where(eq(userProfile.userId, userId))

  // Create race
  const [race] = await db.insert(races).values({
    userId,
    name:              data.name,
    raceDate:          data.raceDate,
    location:          data.location,
    distanceKm:        data.distanceKm,
    goalTimeMinutes:   data.goalTimeMinutes,
    trainingStartDate: data.trainingStartDate,
    fitnessLevel:      data.fitnessLevel,
  }).returning()

  // Generate training plan
  const sessions = generatePlan({
    raceId:            race.id,
    userId,
    raceDate:          data.raceDate,
    trainingStartDate: data.trainingStartDate,
    distanceKm:        data.distanceKm,
    goalTimeMinutes:   data.goalTimeMinutes,
    fitnessLevel:      data.fitnessLevel,
    maxHr,
    garminChronicLoadKm: garminResult?.chronicLoadKm,
  })

  // Insert all sessions in one batch
  if (sessions.length > 0) {
    await db.insert(trainingSessions).values(sessions)
  }

  return NextResponse.json({ raceId: race.id, sessionCount: sessions.length }, { status: 201 })
}
