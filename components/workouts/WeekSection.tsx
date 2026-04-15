// components/workouts/WeekSection.tsx
'use client'

import { useState } from 'react'
import { SessionCard } from './SessionCard'
import type { WeekGroup } from '@/lib/sessions/queries'

type Props = { group: WeekGroup; defaultExpanded?: boolean }

export function WeekSection({ group, defaultExpanded = false }: Props) {
  const [open, setOpen] = useState(defaultExpanded)

  return (
    <div
      className={[
        'rounded-lg border',
        group.isCurrentWeek ? 'border-l-4 border-l-accent border-border' : 'border-border',
      ].join(' ')}
    >
      <button
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen(v => !v)}
      >
        <div>
          <span className="text-sm font-semibold text-text">{group.weekLabel}</span>
          <span className="ml-2 text-xs text-muted">{group.plannedKm.toFixed(1)} km planned</span>
        </div>
        <span className="text-muted">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          {group.sessions.map(s => (
            <SessionCard
              key={s.id}
              session={s}
              weekNumber={group.weekNumber}
            />
          ))}
        </div>
      )}
    </div>
  )
}
