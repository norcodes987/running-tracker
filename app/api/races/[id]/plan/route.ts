import { NextResponse }      from 'next/server'
import { auth }              from '@/lib/auth'
import { db }                from '@/lib/db'
import { races, trainingSessions } from '@/lib/db/schema'
import { eq, and }           from 'drizzle-orm'
import { parsePlanCsv }      from '@/lib/training/parse-csv'

type Params = { params: Promise<{ id: string }> }

export async function POST(request: Request, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id
  const { id: raceId } = await params

  // Verify race belongs to user
  const race = await db.query.races.findFirst({
    where: and(eq(races.id, raceId), eq(races.userId, userId)),
  })
  if (!race) {
    return NextResponse.json({ error: 'Race not found' }, { status: 404 })
  }

  // Parse multipart form
  let csvText: string
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // File size limit (DoS protection)
    const MAX_CSV_BYTES = 500_000 // 500 KB
    if ((file as File).size > MAX_CSV_BYTES) {
      return NextResponse.json({ error: 'File too large (max 500 KB)' }, { status: 413 })
    }

    csvText = await (file as File).text()
  } catch {
    return NextResponse.json({ error: 'Failed to read file' }, { status: 400 })
  }

  // Parse CSV
  let parsed: ReturnType<typeof parsePlanCsv>
  try {
    const raceYear = new Date(race.raceDate).getUTCFullYear()
    parsed = parsePlanCsv(csvText, raceYear)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid CSV' },
      { status: 422 },
    )
  }

  // Row count cap
  if (parsed.length > 500) {
    return NextResponse.json({ error: 'CSV exceeds maximum of 500 rows' }, { status: 422 })
  }

  // Delete existing planned sessions then insert new ones
  await db
    .delete(trainingSessions)
    .where(
      and(
        eq(trainingSessions.raceId, raceId),
        eq(trainingSessions.userId, userId),
        eq(trainingSessions.status, 'planned'),
      ),
    )

  if (parsed.length > 0) {
    await db.insert(trainingSessions).values(
      parsed.map(s => ({
        userId,
        raceId,
        date:               s.date,
        type:               s.type,
        distanceKm:         s.distanceKm,
        targetPaceSecPerKm: s.targetPaceSecPerKm,
        notes:              s.notes,
        status:             'planned' as const,
      })),
    )
  }

  return NextResponse.json({ inserted: parsed.length })
}
