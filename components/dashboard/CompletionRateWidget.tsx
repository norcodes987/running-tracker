// components/dashboard/CompletionRateWidget.tsx
import type { CompletionRateRow } from '@/lib/dashboard/metrics'

type Props = { rows: CompletionRateRow[] }

const TYPE_LABELS: Record<string, string> = {
  long_run: 'Long', tempo: 'Tempo', interval: 'Interval', easy: 'Easy',
}

export function CompletionRateWidget({ rows }: Props) {
  const bannerRow = rows.find(r => r.consecutiveWeeksBelow70 >= 2)

  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="mb-3 text-[10px] uppercase tracking-widest text-muted">Completion Rate</p>
      <div className="grid grid-cols-2 gap-2">
        {rows.map(row => {
          const good  = row.rate !== null && row.rate >= 70
          const color = good ? 'text-accent' : 'text-danger'
          return (
            <div key={row.type} className="rounded bg-bg p-3">
              <p className="text-[10px] uppercase tracking-widest text-muted">
                {TYPE_LABELS[row.type] ?? row.type}
              </p>
              <p className={`mt-1 font-mono text-lg font-bold ${color}`}>
                {row.rate !== null ? `${row.rate}%` : '—'}
              </p>
            </div>
          )
        })}
      </div>
      {bannerRow && (
        <div className="mt-3 rounded border border-accent px-3 py-2 text-xs text-text">
          {TYPE_LABELS[bannerRow.type]} completion has dropped{' '}
          {bannerRow.consecutiveWeeksBelow70} weeks running — your plan may adapt.
        </div>
      )}
    </div>
  )
}
