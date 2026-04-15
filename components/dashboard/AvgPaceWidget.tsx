// components/dashboard/AvgPaceWidget.tsx
import { formatPace } from '@/lib/utils/format'
import type { AvgPaceRow } from '@/lib/dashboard/metrics'

type Props = { rows: AvgPaceRow[] }

const TYPE_LABELS: Record<string, string> = {
  long_run:  'Long',
  race_pace: 'Race',
  tempo:     'Tempo',
  interval:  'Interval',
  easy:      'Easy',
}

export function AvgPaceWidget({ rows }: Props) {
  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="mb-3 text-[10px] uppercase tracking-widest text-muted">Avg Pace / Type</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-[10px] uppercase tracking-widest text-muted">
            <th className="pb-2 text-left font-normal">Type</th>
            <th className="pb-2 text-right font-normal">Actual</th>
            <th className="pb-2 text-right font-normal">Target</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const faster  = row.actualSecPerKm !== null && row.actualSecPerKm < row.targetSecPerKm
            const isInterval = row.type === 'interval'
            return (
              <tr key={row.type} className="border-t border-border">
                <td className="py-1.5 text-text">
                  {TYPE_LABELS[row.type] ?? row.type}
                  {row.trend && (
                    <span className="ml-1 text-muted">{row.trend}</span>
                  )}
                </td>
                <td className={`py-1.5 text-right font-mono ${faster ? 'text-accent' : 'text-warning'}`}>
                  {isInterval
                    ? <span className="text-muted text-xs">use HR</span>
                    : row.actualSecPerKm !== null
                      ? formatPace(row.actualSecPerKm)
                      : <span className="text-muted">—</span>
                  }
                </td>
                <td className="py-1.5 text-right font-mono text-muted">
                  {formatPace(row.targetSecPerKm)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
