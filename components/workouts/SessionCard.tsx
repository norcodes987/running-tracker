// components/workouts/SessionCard.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatPace } from '@/lib/utils/format'
import type { RawSession } from '@/lib/sessions/queries'

const TYPE_COLORS: Record<string, string> = {
  long_run:  '#C8FF00',
  race_pace: '#FACC15',
  interval:  '#FB923C',
  tempo:     '#60A5FA',
  easy:      '#4ADE80',
  bonus:     '#A78BFA',
}

const TYPE_LABELS: Record<string, string> = {
  long_run:  'Long Run',
  race_pace: 'Race Pace',
  interval:  'Interval',
  tempo:     'Tempo',
  easy:      'Easy',
  bonus:     'Extra',
}

const STATUS_COLORS: Record<string, string> = {
  completed: '#C8FF00',
  partial:   '#FF9500',
  planned:   '#444',
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

// Parse "mm:ss" string → seconds
function parsePaceInput(value: string): number | null {
  const match = value.trim().match(/^(\d+):(\d{2})$/)
  if (!match) return null
  return parseInt(match[1]) * 60 + parseInt(match[2])
}

type Props = { session: RawSession; weekNumber: number; phaseName?: string }

export function SessionCard({ session, weekNumber, phaseName }: Props) {
  const [expanded, setExpanded]   = useState(false)
  const [editing, setEditing]     = useState(false)
  const [distInput, setDistInput] = useState(session.actualDistanceKm?.toFixed(1) ?? '')
  const [paceInput, setPaceInput] = useState(
    session.actualPaceSecPerKm ? formatPace(session.actualPaceSecPerKm) : '',
  )
  const [saving, setSaving]       = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const router = useRouter()

  const color = TYPE_COLORS[session.type] ?? '#888'
  const isManual = session.notes?.startsWith('__manual__') ?? false

  async function handleSave() {
    const dist = parseFloat(distInput)
    const pace = parsePaceInput(paceInput)
    if (isNaN(dist) || dist <= 0) { setSaveError('Enter a valid distance'); return }
    if (pace === null) { setSaveError('Enter pace as mm:ss'); return }

    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ actualDistanceKm: dist, actualPaceSecPerKm: pace }),
      })
      if (!res.ok) throw new Error('Save failed')
      setEditing(false)
      router.refresh()
    } catch {
      setSaveError('Save failed — try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      data-testid="session-card"
      role="button"
      tabIndex={0}
      className="cursor-pointer rounded-lg bg-surface p-3"
      onClick={() => !editing && setExpanded(v => !v)}
      onKeyDown={(e) => { if (!editing && (e.key === 'Enter' || e.key === ' ')) setExpanded(v => !v) }}
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
          <p className="text-xs text-muted">{formatDate(session.date)}</p>
          {session.actualDistanceKm !== null ? (
            <p className="text-sm text-text">
              {session.actualDistanceKm.toFixed(1)} km
              {session.actualPaceSecPerKm && (
                <span className="ml-2 font-mono text-xs text-muted">
                  {formatPace(session.actualPaceSecPerKm)} /km
                </span>
              )}
              {isManual && <span className="ml-1 text-[10px] text-muted">✎</span>}
            </p>
          ) : (
            <p className="text-xs text-muted">{session.distanceKm.toFixed(1)} km planned</p>
          )}
        </div>
        <span
          className="h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: STATUS_COLORS[session.status] ?? '#444' }}
        />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          className="mt-3 border-t border-border pt-3"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
        >
          {phaseName && (
            <p className="text-xs text-muted">{phaseName} · Week {weekNumber}</p>
          )}
          {session.targetPaceSecPerKm && (
            <p className="mt-1 text-xs text-muted">
              Target: {formatPace(session.targetPaceSecPerKm)} /km · {session.distanceKm.toFixed(1)} km
            </p>
          )}

          {!editing ? (
            <button
              className="mt-3 border border-border text-muted text-xs px-3 py-1.5 rounded-sm hover:border-accent hover:text-accent transition-colors"
              onClick={() => {
                setDistInput(session.actualDistanceKm?.toFixed(1) ?? '')
                setPaceInput(session.actualPaceSecPerKm ? formatPace(session.actualPaceSecPerKm) : '')
                setSaveError(null)
                setEditing(true)
              }}
            >
              {session.actualDistanceKm !== null ? 'Edit actuals' : 'Add actuals'}
            </button>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted uppercase tracking-wide">Distance (km)</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    value={distInput}
                    onChange={e => setDistInput(e.target.value)}
                    className="w-24 rounded border border-border bg-bg px-2 py-1 text-sm text-text font-mono"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted uppercase tracking-wide">Avg Pace (mm:ss)</label>
                  <input
                    type="text"
                    placeholder="5:30"
                    value={paceInput}
                    onChange={e => setPaceInput(e.target.value)}
                    className="w-24 rounded border border-border bg-bg px-2 py-1 text-sm text-text font-mono"
                  />
                </div>
              </div>
              {saveError && <p className="text-xs text-danger">{saveError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="border border-accent text-accent text-xs px-3 py-1.5 rounded-sm hover:bg-accent hover:text-bg transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  className="border border-border text-muted text-xs px-3 py-1.5 rounded-sm hover:border-danger hover:text-danger transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
