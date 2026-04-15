// lib/training/garmin-parser.ts

export type GarminParseResult = {
  maxHr:         number | null
  chronicLoadKm: number
  paceBenchmarks: Partial<Record<string, number>>
}

type RunActivity = {
  date:          Date
  distanceKm:    number
  maxHr:         number
  durationSec:   number
  avgHr:         number
  avgPaceSec:    number  // sec/km, 0 if unavailable
}

const clean = (s: string) => s?.trim().replace(/^"|"$/g, '') ?? ''

function parsePaceStr(pace: string): number {
  const parts = pace.split(':').map(Number)
  if (parts.length === 2 && !parts.some(isNaN)) return parts[0] * 60 + parts[1]
  return 0
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2
}

function parseCSV(content: string): RunActivity[] {
  const lines = content.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => clean(h))
  const idx = (name: string) => headers.findIndex(h => h === name)

  const typeIdx    = idx('Activity Type')
  const dateIdx    = idx('Date')
  const distIdx    = idx('Distance')
  const maxHrIdx   = idx('Max HR')
  const timeIdx    = idx('Time')
  const avgHrIdx   = idx('Avg HR')
  const avgPaceIdx = idx('Avg Pace')

  const runs: RunActivity[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const type = clean(cols[typeIdx])
    if (!type || !type.toLowerCase().includes('running')) continue

    const distKm     = parseFloat(clean(cols[distIdx]))
    const maxHr      = parseInt(clean(cols[maxHrIdx]))
    const dateStr    = clean(cols[dateIdx])
    const avgHr      = parseInt(clean(cols[avgHrIdx])) || 0
    const avgPaceSec = parsePaceStr(clean(cols[avgPaceIdx]))

    if (!dateStr || isNaN(distKm) || isNaN(maxHr)) continue

    const timeParts = clean(cols[timeIdx] ?? '').split(':').map(Number)
    const durationSec = timeParts.length === 3
      ? timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2]
      : 0

    runs.push({ date: new Date(dateStr), distanceKm: distKm, maxHr, durationSec, avgHr, avgPaceSec })
  }

  return runs
}

function parseJSON(content: string): RunActivity[] {
  let data: { activities?: unknown[] }
  try { data = JSON.parse(content) } catch { return [] }

  const activities = data.activities ?? []
  const runs: RunActivity[] = []

  for (const act of activities) {
    const a = act as Record<string, unknown>
    const type = String(a.activityType ?? '')
    if (!type.toLowerCase().includes('running')) continue

    const distKm      = (Number(a.distance) || 0) / 1000
    const maxHr       = Number(a.maxHR) || 0
    const dateStr     = String(a.startTimeLocal ?? '')
    const durationSec = Number(a.duration) || 0
    const avgHr       = Number(a.averageHR) || 0

    if (!dateStr || distKm === 0) continue

    runs.push({ date: new Date(dateStr), distanceKm: distKm, maxHr, durationSec, avgHr, avgPaceSec: 0 })
  }

  return runs
}

function classifyAndBenchmark(
  runs: RunActivity[],
  maxHr: number,
): Partial<Record<string, number>> {
  const med = median(runs.map(r => r.distanceKm))
  const groups: Record<string, number[]> = {}

  for (const r of runs) {
    if (r.avgPaceSec === 0 || r.avgHr === 0) continue
    const hrPct = r.avgHr / maxHr
    let sessionType: string
    if (hrPct > 0.85) {
      sessionType = 'interval'
    } else if (hrPct >= 0.75) {
      sessionType = r.distanceKm < med ? 'tempo' : 'race_pace'
    } else {
      sessionType = r.distanceKm < med ? 'easy' : 'long_run'
    }
    if (!groups[sessionType]) groups[sessionType] = []
    groups[sessionType].push(r.avgPaceSec)
  }

  const benchmarks: Partial<Record<string, number>> = {}
  for (const [type, paces] of Object.entries(groups)) {
    if (paces.length < 2) continue
    benchmarks[type] = Math.floor(paces.reduce((a, b) => a + b, 0) / paces.length)
  }
  return benchmarks
}

export function parseGarminExport(
  content: string,
  format: 'csv' | 'json',
): GarminParseResult {
  const runs = format === 'csv' ? parseCSV(content) : parseJSON(content)

  if (runs.length === 0) {
    return { maxHr: null, chronicLoadKm: 0, paceBenchmarks: {} }
  }

  const maxHr = Math.max(...runs.map(r => r.maxHr))

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 28)
  const chronicLoadKm = runs
    .filter(r => r.date >= cutoff)
    .reduce((sum, r) => sum + r.distanceKm, 0)

  const paceBenchmarks = maxHr > 0 ? classifyAndBenchmark(runs, maxHr) : {}

  return { maxHr: maxHr > 0 ? maxHr : null, chronicLoadKm, paceBenchmarks }
}
