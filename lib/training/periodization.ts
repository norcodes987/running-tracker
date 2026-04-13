import { calculateTrainingPaces } from './pace-calculator'
import type { SessionType } from './quality-score'

export type FitnessLevel = 'beginner' | 'building' | 'ready'
export type Phase = 'base' | 'build' | 'peak' | 'taper'

type PlanInput = {
  raceId:            string
  userId:            string
  raceDate:          string  // YYYY-MM-DD
  trainingStartDate: string  // YYYY-MM-DD
  distanceKm:        number
  goalTimeMinutes:   number
  fitnessLevel:      FitnessLevel
  maxHr:             number
  /** If present, overrides fitness-level volume */
  garminChronicLoadKm?: number
}

type PlannedSession = {
  raceId:             string
  userId:             string
  date:               string
  type:               SessionType
  distanceKm:         number
  targetPaceSecPerKm: number
  targetHrZone:       string
  status:             'planned'
}

// Peak week volume table: [beginner, building, ready] per distance bracket
const PEAK_VOLUME: Array<{ maxKm: number; values: [number, number, number] }> = [
  { maxKm: 5,       values: [25, 35, 45] },
  { maxKm: 10,      values: [30, 42, 55] },
  { maxKm: 21.0975, values: [35, 50, 65] },
  { maxKm: 42.195,  values: [55, 75, 95] },
  { maxKm: Infinity, values: [65, 90, 110] }, // ultra / custom > marathon
]

const FITNESS_INDEX: Record<FitnessLevel, 0 | 1 | 2> = {
  beginner: 0,
  building: 1,
  ready: 2,
}

export function getPeakWeekKm(fitnessLevel: FitnessLevel, distanceKm: number): number {
  const bracket = PEAK_VOLUME.find(b => distanceKm <= b.maxKm) ?? PEAK_VOLUME[PEAK_VOLUME.length - 1]
  return bracket.values[FITNESS_INDEX[fitnessLevel]]
}

// Phase boundaries (from end of plan, in weeks)
export function getPhaseForWeek(weekNumber: number, totalWeeks: number): Phase {
  const fromEnd = totalWeeks - weekNumber + 1
  if (fromEnd <= 2) return 'taper'
  if (fromEnd <= 4) return 'peak'
  if (fromEnd <= 9) return 'build'
  return 'base'
}

// Monday of the ISO week containing `date`
function getMondayOf(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay() || 7
  d.setDate(d.getDate() - day + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10)
}

// HR zone label from intensity
function hrZoneForType(type: SessionType): string {
  const zones: Record<SessionType, string> = {
    rest:       'z1',
    easy:       'z2',
    long_run:   'z2',
    tempo:      'z3',
    race_pace:  'z4',
    interval:   'z5',
  }
  return zones[type]
}

// Session pattern: day offsets 0–6 = Mon–Sun
// Returns [dayOffset, sessionType]
const WEEK_PATTERN: Array<[number, SessionType]> = [
  [0, 'rest'],
  [1, 'interval'],
  [2, 'easy'],
  [3, 'tempo'],
  [4, 'rest'],
  [5, 'long_run'],
  [6, 'easy'], // overridden to race_pace in build/peak
]

// Volume multipliers by phase
function phaseVolumeMultiplier(phase: Phase, weekInBuild: number): number {
  if (phase === 'taper') return 0 // handled separately
  if (phase === 'peak')  return 1.0
  if (phase === 'build') return 0.60 + weekInBuild * 0.10
  return 0.60 // base
}

// Distribute weekly km across session types
function distributeVolume(
  weeklyKm: number,
  pattern: Array<[number, SessionType]>
): Map<SessionType, number> {
  // Proportions per session type within a week
  const proportions: Partial<Record<SessionType, number>> = {
    long_run:  0.35,
    race_pace: 0.20,
    tempo:     0.18,
    interval:  0.12,
    easy:      0.15, // split across 2 easy sessions (0.075 each if two)
  }

  const dist = new Map<SessionType, number>()
  const runSessions = pattern.filter(([, t]) => t !== 'rest')

  // Count easy sessions
  const easySessions = runSessions.filter(([, t]) => t === 'easy').length

  for (const [, type] of runSessions) {
    if (type === 'rest') continue
    let prop = proportions[type] ?? 0.10
    if (type === 'easy') prop = (proportions.easy ?? 0.15) / easySessions
    dist.set(type, Math.max(1, Math.round(weeklyKm * prop * 10) / 10))
  }

  return dist
}

export function generatePlan(input: PlanInput): PlannedSession[] {
  const {
    raceId, userId, raceDate, trainingStartDate,
    distanceKm, goalTimeMinutes, fitnessLevel, maxHr: _maxHr,
    garminChronicLoadKm,
  } = input

  const startDate   = new Date(trainingStartDate)
  const endDate     = new Date(raceDate)
  const startMonday = getMondayOf(startDate)

  // Count total weeks
  const msPerWeek   = 7 * 24 * 60 * 60 * 1000
  const totalWeeks  = Math.ceil((endDate.getTime() - startMonday.getTime()) / msPerWeek)

  // Peak volume
  const basePeak = getPeakWeekKm(fitnessLevel, distanceKm)
  const peakKm   = garminChronicLoadKm
    ? Math.round(garminChronicLoadKm * 1.20)
    : basePeak

  // Taper long_run cap = 50% of race distance
  const taperLongRunCap = distanceKm * 0.5

  // Paces
  const racePaceSecPerKm = Math.round((goalTimeMinutes * 60) / distanceKm)
  const paces = calculateTrainingPaces(racePaceSecPerKm)

  const sessions: PlannedSession[] = []

  for (let week = 1; week <= totalWeeks; week++) {
    const phase = getPhaseForWeek(week, totalWeeks)
    const weekMonday = addDays(startMonday, (week - 1) * 7)

    // Build phase progression: week 1 of build = first week after base
    const buildStartWeek = Array.from({ length: totalWeeks }, (_, i) => i + 1)
      .find(w => getPhaseForWeek(w, totalWeeks) === 'build') ?? 1
    const weekInBuild = Math.max(0, week - buildStartWeek)

    // Weekly km
    let weeklyKm: number
    if (phase === 'taper') {
      const taperWeek = week === totalWeeks ? 2 : 1 // 1 = first taper, 2 = race week
      weeklyKm = taperWeek === 1
        ? Math.round(peakKm * 0.60)
        : Math.round(peakKm * 0.40)
    } else {
      weeklyKm = Math.round(peakKm * phaseVolumeMultiplier(phase, weekInBuild))
    }

    // Determine actual week pattern (Sun = race_pace in build/peak, else easy)
    const weekPattern: Array<[number, SessionType]> = WEEK_PATTERN.map(([day, type]) => {
      if (day === 6 && (phase === 'build' || phase === 'peak')) {
        return [day, 'race_pace']
      }
      return [day, type]
    })

    const volDist = distributeVolume(weeklyKm, weekPattern)

    for (const [dayOffset, type] of weekPattern) {
      if (type === 'rest') continue

      const sessionDate = addDays(weekMonday, dayOffset)

      // Don't schedule past race date
      if (sessionDate >= endDate) continue
      // Don't schedule before training start
      if (sessionDate < startDate) continue

      let km = volDist.get(type) ?? 5

      // Cap taper long run
      if (phase === 'taper' && type === 'long_run') {
        km = Math.min(km, taperLongRunCap)
      }

      const paceKey = type as keyof typeof paces
      const targetPace = paces[paceKey] ?? paces.easy

      sessions.push({
        raceId,
        userId,
        date:               toDateString(sessionDate),
        type,
        distanceKm:         km,
        targetPaceSecPerKm: targetPace,
        targetHrZone:       hrZoneForType(type),
        status:             'planned',
      })
    }
  }

  return sessions
}
