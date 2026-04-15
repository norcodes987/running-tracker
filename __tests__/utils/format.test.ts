// __tests__/utils/format.test.ts
import { describe, it, expect } from 'vitest'
import { formatPace, formatDuration, formatKm } from '@/lib/utils/format'

describe('formatPace', () => {
  it('formats whole minutes', () => expect(formatPace(300)).toBe('5:00'))
  it('pads seconds', () => expect(formatPace(308)).toBe('5:08'))
  it('handles sub-minute values', () => expect(formatPace(45)).toBe('0:45'))
})

describe('formatDuration', () => {
  it('formats sub-hour as m:ss', () => expect(formatDuration(45)).toBe('45:00'))
  it('formats hours correctly', () => expect(formatDuration(90.5)).toBe('1:30:30'))
  it('pads minutes and seconds', () => expect(formatDuration(61.083)).toBe('1:01:05'))
})

describe('formatKm', () => {
  it('formats to 1 decimal', () => expect(formatKm(21.1)).toBe('21.1'))
  it('appends zero decimal', () => expect(formatKm(10)).toBe('10.0'))
})
