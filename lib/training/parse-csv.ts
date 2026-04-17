export type ParsedSession = {
  date:               string  // YYYY-MM-DD
  type:               string
  distanceKm:         number
  targetPaceSecPerKm: number
}

const VALID_TYPES = new Set(['easy', 'tempo', 'interval', 'long_run', 'race_pace'])

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

function parsePace(paceStr: string): number {
  const clean = paceStr.trim().replace(/\s*\/km\s*/i, '')
  const [min, sec] = clean.split(':').map(Number)
  if (isNaN(min) || isNaN(sec)) throw new Error(`Invalid pace: "${paceStr}"`)
  return min * 60 + sec
}

function parseDate(dateStr: string, year: number): string {
  const clean = dateStr.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean

  // Parse "16 Apr" or "16 Apr 2026"
  const parts = clean.split(/\s+/)
  const day = parseInt(parts[0])
  const monthKey = parts[1]?.toLowerCase().slice(0, 3)
  const monthIdx = monthKey !== undefined ? MONTHS[monthKey] : undefined

  if (isNaN(day) || monthIdx === undefined) {
    throw new Error(`Invalid date: "${dateStr}"`)
  }

  const d = new Date(Date.UTC(year, monthIdx, day))
  return d.toISOString().slice(0, 10)
}

export function parsePlanCsv(csvText: string, year: number): ParsedSession[] {
  const lines = csvText.trim().split(/\r?\n/)
  if (lines.length < 2) throw new Error('CSV must have a header and at least one data row')

  const header = lines[0].toLowerCase().split(',').map(h => h.trim())
  const dateIdx = header.indexOf('date')
  const typeIdx = header.indexOf('type')
  const kmIdx   = header.findIndex(h => h === 'km' || h === 'distance_km' || h === 'distance')
  const paceIdx = header.findIndex(h => h === 'target_pace' || h === 'pace')

  if ([dateIdx, typeIdx, kmIdx, paceIdx].some(i => i === -1)) {
    throw new Error('CSV must have columns: date, type, km, target_pace')
  }

  return lines
    .slice(1)
    .filter(line => line.trim() !== '')
    .map((line, i) => {
      const cols = line.split(',').map(c => c.trim())
      const type = cols[typeIdx].toLowerCase()
      if (!VALID_TYPES.has(type)) {
        throw new Error(`Row ${i + 2}: unknown type "${cols[typeIdx]}". Valid: ${[...VALID_TYPES].join(', ')}`)
      }
      const distanceKm = parseFloat(cols[kmIdx])
      if (isNaN(distanceKm)) throw new Error(`Row ${i + 2}: invalid distance "${cols[kmIdx]}"`)
      return {
        date:               parseDate(cols[dateIdx], year),
        type,
        distanceKm,
        targetPaceSecPerKm: parsePace(cols[paceIdx]),
      }
    })
}
