// app/api/profile/route.ts
import { NextResponse } from 'next/server'
import { auth }         from '@/lib/auth'
import { db }           from '@/lib/db'
import { races, userProfile } from '@/lib/db/schema'
import { eq, and }      from 'drizzle-orm'

export async function PATCH(request: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  let body: { goalTimeMinutes?: unknown; paceZones?: unknown }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (body.goalTimeMinutes !== undefined) {
    if (typeof body.goalTimeMinutes !== 'number' || body.goalTimeMinutes <= 0) {
      return NextResponse.json({ error: 'goalTimeMinutes must be a positive number' }, { status: 400 })
    }
    const activeRace = await db.query.races.findFirst({
      where: and(eq(races.userId, userId), eq(races.status, 'active')),
    })
    if (!activeRace) {
      return NextResponse.json({ error: 'No active race' }, { status: 404 })
    }
    await db.update(races)
      .set({ goalTimeMinutes: body.goalTimeMinutes })
      .where(eq(races.id, activeRace.id))
  }

  if (body.paceZones !== undefined) {
    if (typeof body.paceZones !== 'object' || body.paceZones === null) {
      return NextResponse.json({ error: 'paceZones must be an object' }, { status: 400 })
    }
    await db
      .insert(userProfile)
      .values({ userId, paceZones: body.paceZones })
      .onConflictDoUpdate({
        target: userProfile.userId,
        set: { paceZones: body.paceZones, updatedAt: new Date() },
      })
  }

  const profile = await db.query.userProfile.findFirst({
    where: eq(userProfile.userId, userId),
  })

  return NextResponse.json({ ok: true, profile })
}
