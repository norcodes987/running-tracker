// app/api/sessions/[id]/route.ts
import { NextResponse } from 'next/server'
import { auth }         from '@/lib/auth'
import { db }           from '@/lib/db'
import { trainingSessions } from '@/lib/db/schema'
import { eq, and }      from 'drizzle-orm'
import type { IntervalSplits } from '@/lib/types/splits'

type PatchBody = {
  actualDistanceKm?: unknown
  actualPaceSecPerKm?: unknown
  splits?: unknown
}

function isValidSection(v: unknown): v is { km: number; paceSec: number } {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  return typeof s.km === 'number' && typeof s.paceSec === 'number'
}

function isIntervalSplits(v: unknown): v is IntervalSplits {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  if (typeof s.intervals !== 'object' || s.intervals === null) return false
  const iv = s.intervals as Record<string, unknown>
  if (
    typeof iv.reps !== 'number' ||
    typeof iv.repKm !== 'number' ||
    typeof iv.avgPaceSec !== 'number'
  ) return false
  if (s.warmup !== null && s.warmup !== undefined && !isValidSection(s.warmup)) return false
  if (s.cooldown !== null && s.cooldown !== undefined && !isValidSection(s.cooldown)) return false
  return true
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  let body: PatchBody
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { id } = await params

  const existing = await db.query.trainingSessions.findFirst({
    where: and(
      eq(trainingSessions.id, id),
      eq(trainingSessions.userId, userId),
    ),
  })
  if (!existing) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // --- splits path (interval sessions) ---
  if (body.splits !== undefined) {
    if (!isIntervalSplits(body.splits)) {
      return NextResponse.json({ error: 'Invalid splits shape' }, { status: 400 })
    }
    const sp = body.splits
    const warmupKm   = sp.warmup?.km   ?? 0
    const cooldownKm = sp.cooldown?.km ?? 0
    const intervalKm = sp.intervals.reps * sp.intervals.repKm
    const totalKm    = warmupKm + intervalKm + cooldownKm

    const distanceScore = Math.min(100, Math.round((totalKm / existing.distanceKm) * 100))
    const status = totalKm >= existing.distanceKm ? 'completed' : 'partial'
    const prevNotes = existing.notes?.replace(/^__manual__/, '') ?? ''

    await db
      .update(trainingSessions)
      .set({
        actualDistanceKm:   totalKm,
        actualPaceSecPerKm: sp.intervals.avgPaceSec,
        distanceScore,
        status,
        splits:             sp,
        notes:              '__manual__' + prevNotes,
      })
      .where(eq(trainingSessions.id, id))

    return NextResponse.json({ ok: true })
  }

  // --- simple actuals path (non-interval sessions) ---
  if (typeof body.actualDistanceKm !== 'number' || typeof body.actualPaceSecPerKm !== 'number') {
    return NextResponse.json(
      { error: 'Provide splits for interval sessions, or actualDistanceKm + actualPaceSecPerKm for others' },
      { status: 400 },
    )
  }

  const { actualDistanceKm, actualPaceSecPerKm } = body as { actualDistanceKm: number; actualPaceSecPerKm: number }
  const status = existing.type === 'bonus' || actualDistanceKm >= existing.distanceKm
    ? 'completed'
    : 'partial'
  const distanceScore = existing.type === 'bonus'
    ? 100
    : Math.min(100, Math.round((actualDistanceKm / existing.distanceKm) * 100))
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
