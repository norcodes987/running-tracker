// app/api/sessions/[id]/route.ts
import { NextResponse } from 'next/server'
import { auth }         from '@/lib/auth'
import { db }           from '@/lib/db'
import { trainingSessions } from '@/lib/db/schema'
import { eq, and }      from 'drizzle-orm'

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  let body: { actualDistanceKm?: unknown; actualPaceSecPerKm?: unknown }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (typeof body.actualDistanceKm !== 'number' || typeof body.actualPaceSecPerKm !== 'number') {
    return NextResponse.json(
      { error: 'actualDistanceKm and actualPaceSecPerKm must be numbers' },
      { status: 400 },
    )
  }

  const existing = await db.query.trainingSessions.findFirst({
    where: and(
      eq(trainingSessions.id, params.id),
      eq(trainingSessions.userId, userId),
    ),
  })
  if (!existing) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  const { actualDistanceKm, actualPaceSecPerKm } = body as { actualDistanceKm: number; actualPaceSecPerKm: number }

  // Binary completion (bonus sessions always stay completed)
  const status = existing.type === 'bonus' || actualDistanceKm >= existing.distanceKm
    ? 'completed'
    : 'partial'

  const distanceScore = existing.type === 'bonus'
    ? 100
    : Math.min(100, Math.round((actualDistanceKm / existing.distanceKm) * 100))

  // Preserve existing notes beyond the __manual__ prefix
  const prevNotes = existing.notes?.replace(/^__manual__/, '') ?? ''

  await db
    .update(trainingSessions)
    .set({
      actualDistanceKm,
      actualPaceSecPerKm,
      distanceScore,
      status,
      notes: '__manual__' + prevNotes,
    })
    .where(eq(trainingSessions.id, params.id))

  return NextResponse.json({ ok: true })
}
