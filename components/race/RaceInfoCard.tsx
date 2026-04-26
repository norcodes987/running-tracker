// components/race/RaceInfoCard.tsx
import { formatDuration, formatPace } from '@/lib/utils/format'
import { getRacePaceSecPerKm, getDaysToRace } from '@/lib/race/active-race'

type Race = {
  name: string
  raceDate: string
  location: string | null
  distanceKm: number
  goalTimeMinutes: number
  trainingStartDate: string
}

function formatRaceDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function calcPaceBand(goalTimeMinutes: number, distanceKm: number): Array<{
  label: string; split: string; cumulative: string
}> {
  const paceSecPerKm = (goalTimeMinutes * 60) / distanceKm
  const rows = []
  let cumSec = 0

  for (let start = 0; start < distanceKm; start += 5) {
    const segEnd = Math.min(start + 5, distanceKm)
    const segKm  = segEnd - start
    const splitSec = paceSecPerKm * segKm
    cumSec += splitSec

    const fmtSec = (sec: number) => {
      const m = Math.floor(sec / 60)
      const s = Math.round(sec % 60)
      return `${m}:${String(s).padStart(2, '0')}`
    }

    rows.push({
      label:      `${start}–${segEnd.toFixed(segKm < 5 ? 1 : 0)} km`,
      split:      fmtSec(splitSec),
      cumulative: fmtSec(cumSec),
    })
  }
  return rows
}

type Props = { race: Race }

export function RaceInfoCard({ race }: Props) {
  const paceSecPerKm    = getRacePaceSecPerKm(race.goalTimeMinutes, race.distanceKm)
  const daysToRace      = getDaysToRace(race.raceDate)
  const trainingStart   = new Date(race.trainingStartDate)
  const raceEnd         = new Date(race.raceDate)
  const totalWeeks      = Math.ceil((raceEnd.getTime() - trainingStart.getTime()) / (7 * 86400000))
  const nowSGT          = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const todaySGT        = Date.UTC(nowSGT.getUTCFullYear(), nowSGT.getUTCMonth(), nowSGT.getUTCDate())
  const weeksRemaining  = Math.max(0, Math.ceil((raceEnd.getTime() - todaySGT) / (7 * 86400000)))
  const paceBand        = calcPaceBand(race.goalTimeMinutes, race.distanceKm)

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* Overview */}
      <div className="rounded-lg bg-surface p-4">
        <h2 className="font-heading text-lg font-bold text-text">{race.name}</h2>
        <p className="mt-1 text-sm text-muted">{formatRaceDate(race.raceDate)}</p>
        {race.location && <p className="text-sm text-muted">{race.location}</p>}
        <p className="mt-2 font-mono text-2xl font-bold text-accent">
          {daysToRace} <span className="text-sm text-muted">days to go</span>
        </p>
      </div>

      {/* Goal summary */}
      <div className="rounded-lg bg-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted">Goal Summary</p>
        <div className="mt-2 grid grid-cols-3 gap-2 text-center">
          <div>
            <p className="font-mono text-base font-bold text-text">{formatDuration(race.goalTimeMinutes)}</p>
            <p className="text-[10px] text-muted">Finish</p>
          </div>
          <div>
            <p className="font-mono text-base font-bold text-text">{formatPace(paceSecPerKm)}</p>
            <p className="text-[10px] text-muted">Per km</p>
          </div>
          <div>
            <p className="font-mono text-base font-bold text-text">{weeksRemaining}/{totalWeeks}</p>
            <p className="text-[10px] text-muted">Wks left</p>
          </div>
        </div>
      </div>

      {/* Pace band */}
      <div className="rounded-lg bg-surface p-4">
        <p className="mb-3 text-[10px] uppercase tracking-widest text-muted">Pace Band</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-muted">
              <th className="pb-2 text-left font-normal">Distance</th>
              <th className="pb-2 text-right font-normal">Split</th>
              <th className="pb-2 text-right font-normal">Cumulative</th>
            </tr>
          </thead>
          <tbody>
            {paceBand.map(row => (
              <tr key={row.label} className="border-t border-border">
                <td className="py-1.5 text-muted">{row.label}</td>
                <td className="py-1.5 text-right font-mono text-text">{row.split}</td>
                <td className="py-1.5 text-right font-mono text-text">{row.cumulative}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Training note */}
      <p className="text-xs text-muted">
        Training for{race.location ? ` ${race.location}` : ' your race'}.{' '}
        Focus on consistent pacing — hit your tempo and race pace sessions every week.
      </p>
    </div>
  )
}
