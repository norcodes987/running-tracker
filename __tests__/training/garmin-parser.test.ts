import { describe, it, expect } from 'vitest'
import { parseGarminExport } from '@/lib/training/garmin-parser'

const csvSample = `Activity Type,Date,Distance,Calories,Time,Avg HR,Max HR,Avg Pace,Best Pace
Running,2026-04-01 07:30:00,10.05,650,01:00:30,145,178,6:01,4:52
Running,2026-03-29 08:00:00,8.0,510,00:48:00,138,165,6:00,5:10
Running,2026-03-25 06:45:00,21.1,1400,01:55:00,152,182,5:28,4:40
Cycling,2026-03-24 09:00:00,40.0,900,01:30:00,130,155,,`

const jsonSample = JSON.stringify({
  activities: [
    { activityType: 'running', startTimeLocal: '2026-04-01 07:30:00', distance: 10050, averageHR: 145, maxHR: 178, duration: 3630 },
    { activityType: 'running', startTimeLocal: '2026-03-25 06:45:00', distance: 21100, averageHR: 152, maxHR: 182, duration: 6900 },
    { activityType: 'cycling', startTimeLocal: '2026-03-24 09:00:00', distance: 40000, averageHR: 130, maxHR: 155, duration: 5400 },
  ]
})

describe('parseGarminExport — CSV', () => {
  it('extracts max HR from running activities', () => {
    const result = parseGarminExport(csvSample, 'csv')
    expect(result.maxHr).toBe(182) // highest across runs
  })

  it('ignores non-running activities', () => {
    const result = parseGarminExport(csvSample, 'csv')
    // cycling maxHR (155) should not influence result
    expect(result.maxHr).toBe(182)
  })

  it('calculates 28-day chronic load baseline', () => {
    const result = parseGarminExport(csvSample, 'csv')
    expect(result.chronicLoadKm).toBeGreaterThan(0)
  })
})

describe('parseGarminExport — JSON', () => {
  it('extracts max HR from running activities', () => {
    const result = parseGarminExport(jsonSample, 'json')
    expect(result.maxHr).toBe(182)
  })

  it('ignores non-running activities', () => {
    const result = parseGarminExport(jsonSample, 'json')
    expect(result.maxHr).toBe(182)
  })
})

describe('parseGarminExport — fallback', () => {
  it('returns null maxHr for empty data', () => {
    const result = parseGarminExport('', 'csv')
    expect(result.maxHr).toBeNull()
  })
})
