import { describe, it, expect } from 'vitest'
import { generatePlan, getPeakWeekKm, getPhaseForWeek } from '@/lib/training/periodization'

describe('getPeakWeekKm', () => {
  it('returns correct km for fitness level and distance', () => {
    expect(getPeakWeekKm('beginner',  21.0975)).toBe(35)
    expect(getPeakWeekKm('building',  21.0975)).toBe(50)
    expect(getPeakWeekKm('ready',     21.0975)).toBe(65)
    expect(getPeakWeekKm('beginner',  42.195)).toBe(55)
    expect(getPeakWeekKm('building',  42.195)).toBe(75)
    expect(getPeakWeekKm('ready',     42.195)).toBe(95)
    expect(getPeakWeekKm('beginner',  5.0)).toBe(25)
    expect(getPeakWeekKm('building',  10.0)).toBe(42)
  })
})

describe('getPhaseForWeek', () => {
  it('returns correct phase for a 13-week plan', () => {
    // weeks counted from 1 (week 1 = first week of training, week 13 = race week)
    expect(getPhaseForWeek(13, 13)).toBe('taper') // last 2 weeks
    expect(getPhaseForWeek(12, 13)).toBe('taper')
    expect(getPhaseForWeek(11, 13)).toBe('peak')
    expect(getPhaseForWeek(10, 13)).toBe('peak')
    expect(getPhaseForWeek(9, 13)).toBe('build')
    expect(getPhaseForWeek(5, 13)).toBe('build')
    expect(getPhaseForWeek(1, 13)).toBe('base')
    expect(getPhaseForWeek(4, 13)).toBe('base')
  })
})

describe('generatePlan', () => {
  const baseInput = {
    raceId:            'race-1',
    userId:            'user-1',
    raceDate:          '2026-08-01',
    trainingStartDate: '2026-05-04', // ~13 weeks before
    distanceKm:        21.0975,
    goalTimeMinutes:   100,
    fitnessLevel:      'building' as const,
    maxHr:             185,
  }

  it('generates sessions for every week', () => {
    const sessions = generatePlan(baseInput)
    expect(sessions.length).toBeGreaterThan(0)
  })

  it('includes interval and tempo every week', () => {
    const sessions = generatePlan(baseInput)
    const weeks = new Map<string, string[]>()

    for (const s of sessions) {
      if (s.status === 'planned') {
        const key = getISOWeek(new Date(s.date))
        if (!weeks.has(key)) weeks.set(key, [])
        weeks.get(key)!.push(s.type)
      }
    }

    for (const [, types] of weeks) {
      if (types.includes('rest')) { // skip pure rest weeks
        expect(types).toContain('interval')
        expect(types).toContain('tempo')
      }
    }
  })

  it('never schedules sessions after race date', () => {
    const sessions = generatePlan(baseInput)
    for (const s of sessions) {
      expect(new Date(s.date) <= new Date(baseInput.raceDate)).toBe(true)
    }
  })

  it('taper weeks have reduced volume', () => {
    const sessions = generatePlan(baseInput)
    const raceDate = new Date(baseInput.raceDate)

    const taperSessions = sessions.filter(s => {
      const d = new Date(s.date)
      const daysToRace = Math.ceil((raceDate.getTime() - d.getTime()) / 86400000)
      return daysToRace <= 14
    })

    const peakSessions = sessions.filter(s => {
      const d = new Date(s.date)
      const daysToRace = Math.ceil((raceDate.getTime() - d.getTime()) / 86400000)
      return daysToRace > 14 && daysToRace <= 28
    })

    const taperKm = taperSessions.reduce((sum, s) => sum + s.distanceKm, 0)
    const peakKm  = peakSessions.reduce((sum, s) => sum + s.distanceKm, 0)

    expect(taperKm).toBeLessThan(peakKm)
  })
})

function getISOWeek(date: Date): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 4 - (d.getDay() || 7))
  const yearStart = new Date(d.getFullYear(), 0, 1)
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return `${d.getFullYear()}-W${weekNo}`
}
