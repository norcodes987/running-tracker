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

// Add these to the bottom of the file

const quotedCsv = `"Activity Type","Date","Distance","Calories","Time","Avg HR","Max HR","Avg Pace","Best Pace"
"Running","2026-04-01 07:30:00","10.05","650","01:00:30","145","178","6:01","4:52"
"Running","2026-03-29 08:00:00","8.0","510","00:48:00","138","165","6:00","5:10"
"Running","2026-03-25 06:45:00","21.1","1400","01:55:00","152","182","5:28","4:40"
"Cycling","2026-03-24 09:00:00","40.0","900","01:30:00","130","155","",""`

describe('parseGarminExport — CSV quote stripping', () => {
  it('parses quoted CSV values correctly', () => {
    const result = parseGarminExport(quotedCsv, 'csv')
    expect(result.maxHr).toBe(182)
  })

  it('calculates chronic load from quoted CSV', () => {
    const result = parseGarminExport(quotedCsv, 'csv')
    expect(result.chronicLoadKm).toBeGreaterThan(0)
  })
})

describe('parseGarminExport — pace benchmarks', () => {
  it('returns paceBenchmarks from unquoted CSV', () => {
    const result = parseGarminExport(csvSample, 'csv')
    // With 3 runs: dist median=10.05, maxHr=182
    // Run1: avgHr=145 (79.7% → 75-85%), dist=10.05 >= 10.05 → race_pace, pace=6:01=361s
    // Run2: avgHr=138 (75.8% → 75-85%), dist=8.0 < 10.05 → tempo, pace=6:00=360s
    // Run3: avgHr=152 (83.5% → 75-85%), dist=21.1 >= 10.05 → race_pace, pace=5:28=328s
    // race_pace: 2 runs → avg = (361+328)/2 = 344.5 → 344
    // tempo: 1 run → omitted (< 2 data points)
    expect(result.paceBenchmarks.race_pace).toBe(344)
    expect(result.paceBenchmarks.tempo).toBeUndefined()
  })

  it('omits types with fewer than 2 data points', () => {
    const result = parseGarminExport(csvSample, 'csv')
    const counts = Object.keys(result.paceBenchmarks).length
    // Only race_pace qualifies in the sample
    expect(counts).toBe(1)
  })
})
