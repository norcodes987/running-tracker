// components/workouts/SessionCard.tsx
'use client'

import { useState } from 'react'
import { formatPace } from '@/lib/utils/format'
import { AdaptationBanner } from './AdaptationBanner'
import type { RawSession } from '@/lib/sessions/queries'

const TYPE_COLORS: Record<string, string> = {
  long_run:  '#C8FF00',
  race_pace: '#FACC15',
  interval:  '#FB923C',
  tempo:     '#60A5FA',
  easy:      '#4ADE80',
}

const TYPE_LABELS: Record<string, string> = {
  long_run:  'Long Run',
  race_pace: 'Race Pace',
  interval:  'Interval',
  tempo:     'Tempo',
  easy:      'Easy',
}

const HR_ZONE_LABELS: Record<string, string> = {
  Z1: 'Zone 1 — recovery',
  Z2: 'Zone 2 — aerobic base',
  Z3: 'Zone 3 — aerobic threshold',
  Z4: 'Zone 4 — lactate threshold',
  Z5: 'Zone 5 — VO₂ max',
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#C8FF00',
  partial:   '#FF9500',
  planned:   '#444',
  failed:    '#FF4444',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

type Props = { session: RawSession; weekNumber: number; phaseName?: string }

export function SessionCard({ session, weekNumber, phaseName }: Props) {
  const [expanded, setExpanded] = useState(false)
  const color = TYPE_COLORS[session.type] ?? '#888'

  return (
    <div
      className="cursor-pointer rounded-lg bg-surface p-3"
      onClick={() => setExpanded(v => !v)}
    >
      {/* Collapsed row */}
      <div className="flex items-center gap-3">
        <span
          className="rounded border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
          style={{ borderColor: color, color }}
        >
          {TYPE_LABELS[session.type] ?? session.type}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-xs text-muted">
            {formatDate(session.date)}
            {session.rescheduledFrom && (
              <span className="ml-1 text-warning">↪ moved</span>
            )}
          </p>
          {session.targetPaceSecPerKm && (
            <p className="font-mono text-lg font-bold text-text">
              {formatPace(session.targetPaceSecPerKm)} <span className="text-xs text-muted">/km</span>
            </p>
          )}
          <p className="text-xs text-muted">
            {session.distanceKm.toFixed(1)} km
            {session.targetHrZone && ` · ${session.targetHrZone}`}
          </p>
        </div>
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: STATUS_COLORS[session.status] ?? '#444' }}
        />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="mt-3 border-t border-border pt-3">
          {phaseName && (
            <p className="text-xs text-muted">
              {phaseName} · Week {weekNumber}
            </p>
          )}
          {session.targetHrZone && (
            <p className="mt-1 text-xs text-muted">
              {HR_ZONE_LABELS[session.targetHrZone] ?? session.targetHrZone}
            </p>
          )}
          {session.rescheduledFrom && (
            <p className="mt-1 text-xs text-muted">
              ↪ Moved from {formatDate(session.rescheduledFrom)}
            </p>
          )}
          <AdaptationBanner changes={session.planChanges} />
        </div>
      )}
    </div>
  )
}
