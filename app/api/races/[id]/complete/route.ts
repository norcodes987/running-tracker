import { NextResponse }   from 'next/server'
import { auth }           from '@/lib/auth'
import { db }             from '@/lib/db'
import { races }          from '@/lib/db/schema'
import { eq, and }        from 'drizzle-orm'
import { completeRace }   from '@/lib/race/complete-race'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId  = session.user.id
  const { id: raceId } = await params

  let body: { action: 'clear' | 'keep'; actualTimeMinutes?: number; notes?: string }
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  if (body.action !== 'clear' && body.action !== 'keep') {
    return NextResponse.json({ error: 'action must be "clear" or "keep"' }, { status: 400 })
  }

  const race = await db.query.races.findFirst({
    where: and(eq(races.id, raceId), eq(races.userId, userId), eq(races.status, 'active')),
  })
  if (!race) {
    return NextResponse.json({ error: 'Race not found or not active' }, { status: 404 })
  }

  if (body.action === 'clear') {
    await completeRace({
      raceId,
      userId,
      actualTimeMinutes: body.actualTimeMinutes ?? 0,
      notes:             body.notes,
      deleteSessions:    true,
    })
  } else {
    await db.update(races)
      .set({
        status:            'completed',
        actualTimeMinutes: body.actualTimeMinutes ?? null,
        notes:             body.notes ?? null,
        completedAt:       new Date(),
      })
      .where(eq(races.id, raceId))
  }

  return NextResponse.json({ ok: true })
}
