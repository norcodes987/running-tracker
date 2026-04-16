import { describe, it, expect } from 'vitest'
import { parsePlanCsv } from '@/lib/training/parse-csv'

const VALID_CSV = `date,type,km,target_pace
16 Apr,tempo,7.0,5:18
18 Apr,long_run,13.7,5:55
19 Apr,easy,2.9,6:09
21 Apr,interval,4.7,4:24
24 May,race_pace,7.8,4:44`

describe('parsePlanCsv', () => {
  it('parses valid CSV into session objects', () => {
    const result = parsePlanCsv(VALID_CSV, 2026)
    expect(result).toHaveLength(5)
    expect(result[0]).toEqual({
      date: '2026-04-16',
      type: 'tempo',
      distanceKm: 7.0,
      targetPaceSecPerKm: 318, // 5*60+18
    })
  })

  it('parses YYYY-MM-DD dates without year param', () => {
    const csv = `date,type,km,target_pace\n2026-04-16,easy,8.0,6:05`
    const result = parsePlanCsv(csv, 2026)
    expect(result[0].date).toBe('2026-04-16')
  })

  it('converts target_pace mm:ss to seconds', () => {
    const csv = `date,type,km,target_pace\n16 Apr,easy,8.0,6:09`
    const result = parsePlanCsv(csv, 2026)
    expect(result[0].targetPaceSecPerKm).toBe(369) // 6*60+9
  })

  it('throws on unknown session type', () => {
    const csv = `date,type,km,target_pace\n16 Apr,swim,8.0,5:00`
    expect(() => parsePlanCsv(csv, 2026)).toThrow('unknown type')
  })

  it('throws on missing required column', () => {
    const csv = `date,type,km\n16 Apr,easy,8.0`
    expect(() => parsePlanCsv(csv, 2026)).toThrow('columns')
  })

  it('throws when CSV has only a header row', () => {
    const csv = `date,type,km,target_pace`
    expect(() => parsePlanCsv(csv, 2026)).toThrow('at least one data row')
  })

  it('skips blank lines', () => {
    const csv = `date,type,km,target_pace\n16 Apr,easy,8.0,6:09\n\n18 Apr,tempo,7.0,5:18`
    const result = parsePlanCsv(csv, 2026)
    expect(result).toHaveLength(2)
  })

  it('handles target_pace with /km suffix', () => {
    const csv = `date,type,km,target_pace\n16 Apr,easy,8.0,6:09 /km`
    const result = parsePlanCsv(csv, 2026)
    expect(result[0].targetPaceSecPerKm).toBe(369)
  })
})
