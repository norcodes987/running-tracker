export type GarminParseResult = {
  maxHr:         number | null
  chronicLoadKm: number   // 28-day total km for ACWR seeding
  paceBenchmarks: Partial<Record<string, number>> // session type → avg sec/km
}

type RunActivity = {
  date:        Date
  distanceKm:  number
  maxHr:       number
  durationSec: number
}

function parseCSV(content: string): RunActivity[] {
  const lines = content.trim().split('\n')
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim())
  const idx = (name: string) => headers.findIndex(h => h === name)

  const typeIdx    = idx('Activity Type')
  const dateIdx    = idx('Date')
  const distIdx    = idx('Distance')
  const maxHrIdx   = idx('Max HR')
  const timeIdx    = idx('Time')

  const runs: RunActivity[] = []

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    const type = cols[typeIdx]?.trim()
    if (!type || !type.toLowerCase().includes('running')) continue

    const distKm  = parseFloat(cols[distIdx])
    const maxHr   = parseInt(cols[maxHrIdx])
    const dateStr = cols[dateIdx]?.trim()

    if (!dateStr || isNaN(distKm) || isNaN(maxHr)) continue

    // Parse duration "HH:MM:SS"
    const timeParts = (cols[timeIdx] ?? '').trim().split(':').map(Number)
    const durationSec = timeParts.length === 3
      ? timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2]
      : 0

    runs.push({ date: new Date(dateStr), distanceKm: distKm, maxHr, durationSec })
  }

  return runs
}

function parseJSON(content: string): RunActivity[] {
  let data: { activities?: unknown[] }
  try {
    data = JSON.parse(content)
  } catch {
    return []
  }

  const activities = data.activities ?? []
  const runs: RunActivity[] = []

  for (const act of activities) {
    const a = act as Record<string, unknown>
    const type = String(a.activityType ?? '')
    if (!type.toLowerCase().includes('running')) continue

    const distKm     = (Number(a.distance) || 0) / 1000
    const maxHr      = Number(a.maxHR) || 0
    const dateStr    = String(a.startTimeLocal ?? '')
    const durationSec = Number(a.duration) || 0

    if (!dateStr || distKm === 0) continue

    runs.push({ date: new Date(dateStr), distanceKm: distKm, maxHr, durationSec })
  }

  return runs
}

export function parseGarminExport(
  content: string,
  format: 'csv' | 'json'
): GarminParseResult {
  const runs = format === 'csv' ? parseCSV(content) : parseJSON(content)

  if (runs.length === 0) {
    return { maxHr: null, chronicLoadKm: 0, paceBenchmarks: {} }
  }

  // Max HR across all runs
  const maxHr = Math.max(...runs.map(r => r.maxHr))

  // 28-day chronic load
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 28)
  const chronicLoadKm = runs
    .filter(r => r.date >= cutoff)
    .reduce((sum, r) => sum + r.distanceKm, 0)

  return {
    maxHr: maxHr > 0 ? maxHr : null,
    chronicLoadKm,
    paceBenchmarks: {}, // future: classify runs by effort level
  }
}
