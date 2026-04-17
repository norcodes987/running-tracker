// lib/sessions/queries.ts

export type PlanChange = {
  id: string
  optionUsed: string | null
  reasoning: string | null
}

export type RawSession = {
  id: string
  date: string
  type: string
  distanceKm: number
  targetPaceSecPerKm: number | null
  targetHrZone: string | null
  status: string
  actualDistanceKm: number | null
  actualPaceSecPerKm: number | null
  actualAvgHr: number | null
  distanceScore: number | null
  paceScore: number | null
  qualityScore: number | null
  notes: string | null
  rescheduledFrom: string | null
  planChanges: PlanChange[]
}

export type WeekGroup = {
  weekNumber: number
  weekLabel: string
  startDate: string
  endDate: string
  plannedKm: number
  sessions: RawSession[]
  isCurrentWeek: boolean
}

function toWeekNumber(sessionDate: string, trainingStartDate: string): number {
  const start   = new Date(trainingStartDate).getTime()
  const session = new Date(sessionDate).getTime()
  return Math.floor((session - start) / (7 * 86400000)) + 1
}

function weekBoundsFromStart(trainingStartDate: string, weekNumber: number): { start: Date; end: Date } {
  const start = new Date(trainingStartDate)
  start.setUTCDate(start.getUTCDate() + (weekNumber - 1) * 7)
  const end = new Date(start)
  end.setUTCDate(start.getUTCDate() + 6)
  return { start, end }
}

function formatWeekLabel(weekNumber: number, start: Date, end: Date): string {
  const startStr = start.toLocaleDateString('en-GB', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  const endStr   = end.toLocaleDateString('en-GB', { day: 'numeric', timeZone: 'UTC' })
  return `Week ${weekNumber} · ${startStr}–${endStr}`
}

export function groupSessionsByWeek(
  sessions: RawSession[],
  trainingStartDate: string,
): WeekGroup[] {
  const today = new Date().toISOString().slice(0, 10)
  const grouped = new Map<number, RawSession[]>()

  for (const s of sessions) {
    const wn = toWeekNumber(s.date, trainingStartDate)
    if (!grouped.has(wn)) grouped.set(wn, [])
    grouped.get(wn)!.push(s)
  }

  return [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([weekNumber, weekSessions]) => {
      const { start, end } = weekBoundsFromStart(trainingStartDate, weekNumber)
      const startStr = start.toISOString().slice(0, 10)
      const endStr   = end.toISOString().slice(0, 10)
      return {
        weekNumber,
        weekLabel: formatWeekLabel(weekNumber, start, end),
        startDate: startStr,
        endDate:   endStr,
        plannedKm: weekSessions.reduce((sum, s) => sum + s.distanceKm, 0),
        sessions:  weekSessions.sort((a, b) => a.date.localeCompare(b.date)),
        isCurrentWeek: today >= startStr && today <= endStr,
      }
    })
}

export async function getSessionsByWeek(
  userId: string,
  raceId: string,
  trainingStartDate: string,
): Promise<WeekGroup[]> {
  const { eq, and, ne } = await import('drizzle-orm')
  const { db } = await import('@/lib/db')
  const { trainingSessions, planChanges } = await import('@/lib/db/schema')

  const [sessionRows, changeRows] = await Promise.all([
    db
      .select({
        id:                 trainingSessions.id,
        date:               trainingSessions.date,
        type:               trainingSessions.type,
        distanceKm:         trainingSessions.distanceKm,
        targetPaceSecPerKm: trainingSessions.targetPaceSecPerKm,
        targetHrZone:       trainingSessions.targetHrZone,
        status:             trainingSessions.status,
        actualDistanceKm:   trainingSessions.actualDistanceKm,
        actualPaceSecPerKm: trainingSessions.actualPaceSecPerKm,
        actualAvgHr:        trainingSessions.actualAvgHr,
        distanceScore:      trainingSessions.distanceScore,
        paceScore:          trainingSessions.paceScore,
        qualityScore:       trainingSessions.qualityScore,
        notes:              trainingSessions.notes,
        rescheduledFrom:    trainingSessions.rescheduledFrom,
      })
      .from(trainingSessions)
      .where(
        and(
          eq(trainingSessions.userId, userId),
          eq(trainingSessions.raceId, raceId),
          ne(trainingSessions.type, 'bonus'),
        ),
      ),
    db
      .select({
        id:          planChanges.id,
        triggeredBy: planChanges.triggeredBy,
        optionUsed:  planChanges.optionUsed,
        reasoning:   planChanges.reasoning,
      })
      .from(planChanges)
      .where(
        and(
          eq(planChanges.userId, userId),
          eq(planChanges.raceId, raceId),
        ),
      ),
  ])

  const changesBySession = new Map<string, PlanChange[]>()
  for (const c of changeRows) {
    if (!c.triggeredBy) continue
    if (!changesBySession.has(c.triggeredBy)) changesBySession.set(c.triggeredBy, [])
    changesBySession.get(c.triggeredBy)!.push({
      id: c.id, optionUsed: c.optionUsed, reasoning: c.reasoning,
    })
  }

  const rawSessions: RawSession[] = sessionRows.map(s => ({
    id:                 s.id,
    date:               s.date,
    type:               s.type,
    distanceKm:         s.distanceKm,
    targetPaceSecPerKm: s.targetPaceSecPerKm,
    targetHrZone:       s.targetHrZone,
    status:             s.status,
    actualDistanceKm:   s.actualDistanceKm,
    actualPaceSecPerKm: s.actualPaceSecPerKm,
    actualAvgHr:        s.actualAvgHr,
    distanceScore:      s.distanceScore,
    paceScore:          s.paceScore,
    qualityScore:       s.qualityScore,
    notes:              s.notes,
    rescheduledFrom:    s.rescheduledFrom,
    planChanges:        changesBySession.get(s.id) ?? [],
  }))

  return groupSessionsByWeek(rawSessions, trainingStartDate)
}

export type BonusSession = {
  id:                 string
  date:               string
  actualDistanceKm:   number | null
  actualPaceSecPerKm: number | null
  actualAvgHr:        number | null
  stravaActivityId:   string | null
}

export async function getBonusSessions(
  userId: string,
  raceId: string,
): Promise<BonusSession[]> {
  const { eq, and } = await import('drizzle-orm')
  const { db } = await import('@/lib/db')
  const { trainingSessions } = await import('@/lib/db/schema')

  const rows = await db
    .select({
      id:                 trainingSessions.id,
      date:               trainingSessions.date,
      actualDistanceKm:   trainingSessions.actualDistanceKm,
      actualPaceSecPerKm: trainingSessions.actualPaceSecPerKm,
      actualAvgHr:        trainingSessions.actualAvgHr,
      stravaActivityId:   trainingSessions.stravaActivityId,
    })
    .from(trainingSessions)
    .where(
      and(
        eq(trainingSessions.userId, userId),
        eq(trainingSessions.raceId, raceId),
        eq(trainingSessions.type, 'bonus'),
      ),
    )

  return rows.sort((a, b) => b.date.localeCompare(a.date))
}
