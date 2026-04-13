import { describe, it, expect } from 'vitest'
import {
  calculateTrainingPaces,
  formatPace,
  parsePaceInput,
  goalTimeToMinutes,
} from '@/lib/training/pace-calculator'

describe('calculateTrainingPaces', () => {
  it('derives all pace zones from race pace', () => {
    // 1:40:00 HM = 100 min / 21.0975 km = 284 sec/km race pace
    const racePace = Math.round((100 * 60) / 21.0975) // 284
    const paces = calculateTrainingPaces(racePace)

    expect(paces.race_pace).toBe(284)
    expect(paces.tempo).toBe(Math.round(284 * 1.12))    // 318
    expect(paces.long_run).toBe(Math.round(284 * 1.25)) // 355
    expect(paces.easy).toBe(Math.round(284 * 1.30))     // 369
    expect(paces.interval).toBe(Math.round(284 * 0.93)) // 264
    expect(paces.recovery).toBe(Math.round(284 * 1.45)) // 412
  })
})

describe('formatPace', () => {
  it('formats seconds per km as m:ss', () => {
    expect(formatPace(284)).toBe('4:44')
    expect(formatPace(369)).toBe('6:09')
    expect(formatPace(60)).toBe('1:00')
    expect(formatPace(305)).toBe('5:05')
  })
})

describe('parsePaceInput', () => {
  it('parses m:ss string to seconds', () => {
    expect(parsePaceInput('4:44')).toBe(284)
    expect(parsePaceInput('1:40:00')).toBe(6000) // treats as h:mm:ss
    expect(parsePaceInput('6:09')).toBe(369)
  })

  it('returns null for invalid input', () => {
    expect(parsePaceInput('abc')).toBeNull()
    expect(parsePaceInput('')).toBeNull()
  })
})

describe('goalTimeToMinutes', () => {
  it('parses h:mm:ss goal time string to minutes', () => {
    expect(goalTimeToMinutes('1:40:00')).toBe(100)
    expect(goalTimeToMinutes('2:00:00')).toBe(120)
    expect(goalTimeToMinutes('0:45:00')).toBe(45)
  })
})
