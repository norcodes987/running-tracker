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
  const startStr = start.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })
  const endStr   = end.toLocaleDateString('en-GB', { day: 'numeric' })
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
  const { eq, and } = await import('drizzle-orm')
  const { db } = await import('@/lib/db')
  const { trainingSessions, planChanges } = await import('@/lib/db/schema')

  const [sessionRows, changeRows] = await Promise.all([
    db
      .select()
      .from(trainingSessions)
      .where(
        and(
          eq(trainingSessions.userId, userId),
          eq(trainingSessions.raceId, raceId),
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
    ...s,
    planChanges: changesBySession.get(s.id) ?? [],
  }))

  return groupSessionsByWeek(rawSessions, trainingStartDate)
}
