// components/workouts/BonusRunsList.tsx
import { formatPace } from '@/lib/utils/format'
import type { BonusSession } from '@/lib/sessions/queries'

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

type Props = { sessions: BonusSession[] }

export function BonusRunsList({ sessions }: Props) {
  if (sessions.length === 0) return null

  return (
    <div className="mt-6">
      <p className="mb-3 px-1 text-[10px] uppercase tracking-widest text-muted">Extra Runs</p>
      <div className="flex flex-col gap-2">
        {sessions.map(s => (
          <div key={s.id} className="rounded-lg bg-surface p-3 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted">{formatDate(s.date)}</p>
              <p className="text-sm text-text">
                {s.actualDistanceKm?.toFixed(1) ?? '—'} km
              </p>
            </div>
            <p className="font-mono text-sm text-muted">
              {s.actualPaceSecPerKm ? formatPace(s.actualPaceSecPerKm) + ' /km' : '—'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
