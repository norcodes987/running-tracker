// lib/dashboard/metrics.ts

export type DashboardSession = {
  id:                 string
  date:               string
  type:               string
  distanceKm:         number
  targetPaceSecPerKm: number | null
  status:             string
  actualDistanceKm:   number | null
  actualPaceSecPerKm: number | null
}

export type WeeklyDistanceResult = { actualKm: number; targetKm: number }

export type AvgPaceRow = {
  type:           string
  actualSecPerKm: number | null
  targetSecPerKm: number | null
  trend:          '↑' | '↓' | '→' | null
}

export type CompletionRateRow = {
  type:                    string
  rate:                    number | null
  consecutiveWeeksBelow70: number
}

// SGT = UTC+8
function getSgtWeekBounds(): { start: string; end: string } {
  const sgtNow = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const dow = sgtNow.getUTCDay()
  const diffToMonday = dow === 0 ? 6 : dow - 1
  const monday = new Date(sgtNow)
  monday.setUTCDate(sgtNow.getUTCDate() - diffToMonday)
  const sunday = new Date(monday)
  sunday.setUTCDate(monday.getUTCDate() + 6)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  return { start: fmt(monday), end: fmt(sunday) }
}

export function calcWeeklyDistance(sessions: DashboardSession[]): WeeklyDistanceResult {
  const { start, end } = getSgtWeekBounds()
  const inWeek = sessions.filter(s => s.date >= start && s.date <= end)
  const targetKm = inWeek
    .filter(s => s.type !== 'rest' && s.type !== 'bonus')
    .reduce((sum, s) => sum + s.distanceKm, 0)
  const actualKm = inWeek
    .filter(s => s.status === 'completed' || s.status === 'partial')
    .reduce((sum, s) => sum + (s.actualDistanceKm ?? 0), 0)
  return { actualKm, targetKm }
}

function sessionsInLast28Days(sessions: DashboardSession[]): DashboardSession[] {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 28)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  return sessions.filter(s => s.date >= cutoffStr)
}

const AVG_PACE_TYPES = ['long_run', 'race_pace', 'tempo', 'interval', 'easy', 'bonus'] as const

export function calcAvgPaceByType(
  sessions: DashboardSession[],
  paceZones: Record<string, number>,
): AvgPaceRow[] {
  const recent = sessionsInLast28Days(sessions)
  const now = new Date()
  const twoWeeksAgoStr  = new Date(now.getTime() - 14 * 86400000).toISOString().slice(0, 10)
  const fourWeeksAgoStr = new Date(now.getTime() - 28 * 86400000).toISOString().slice(0, 10)

  return AVG_PACE_TYPES.map(type => {
    const forType = recent.filter(
      s => s.type === type && s.actualPaceSecPerKm !== null &&
        (s.status === 'completed' || s.status === 'partial'),
    )
    const actualSecPerKm = forType.length > 0
      ? Math.round(forType.reduce((sum, s) => sum + s.actualPaceSecPerKm!, 0) / forType.length)
      : null

    const targetSecPerKm = paceZones[type] ?? null

    const recent2w = forType.filter(s => s.date >= twoWeeksAgoStr)
    const prior2w  = forType.filter(s => s.date >= fourWeeksAgoStr && s.date < twoWeeksAgoStr)
    let trend: AvgPaceRow['trend'] = null
    if (recent2w.length > 0 && prior2w.length > 0) {
      const avgR = recent2w.reduce((sum, s) => sum + s.actualPaceSecPerKm!, 0) / recent2w.length
      const avgP = prior2w.reduce((sum, s) => sum + s.actualPaceSecPerKm!, 0) / prior2w.length
      const diff = avgP - avgR
      trend = diff > 5 ? '↑' : diff < -5 ? '↓' : '→'
    }

    return { type, actualSecPerKm, targetSecPerKm, trend }
  })
}

const COMPLETION_TYPES = ['long_run', 'tempo', 'interval', 'easy'] as const

function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  const dow = d.getUTCDay()
  const toMonday = dow === 0 ? 6 : dow - 1
  const mon = new Date(d)
  mon.setUTCDate(d.getUTCDate() - toMonday)
  return mon.toISOString().slice(0, 10)
}

export function calcCompletionRateByType(sessions: DashboardSession[]): CompletionRateRow[] {
  const today = new Date().toISOString().slice(0, 10)
  return COMPLETION_TYPES.map(type => {
    const past = sessions.filter(s => s.type === type && s.date <= today)
    if (past.length === 0) return { type, rate: null, consecutiveWeeksBelow70: 0 }

    const done = past.filter(s => s.status === 'completed' || s.status === 'partial')
    const rate = Math.round((done.length / past.length) * 100)

    const byWeek = new Map<string, { total: number; done: number }>()
    for (const s of past) {
      const wk = isoWeekKey(s.date)
      const e = byWeek.get(wk) ?? { total: 0, done: 0 }
      e.total++
      if (s.status === 'completed' || s.status === 'partial') e.done++
      byWeek.set(wk, e)
    }
    const weeks = [...byWeek.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    let consecutiveWeeksBelow70 = 0
    for (const [, { total, done: d }] of weeks) {
      if ((d / total) * 100 < 70) consecutiveWeeksBelow70++
      else break
    }

    return { type, rate, consecutiveWeeksBelow70 }
  })
}
