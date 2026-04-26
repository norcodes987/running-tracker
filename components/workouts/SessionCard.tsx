// components/workouts/SessionCard.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatPace } from '@/lib/utils/format'
import type { RawSession } from '@/lib/sessions/queries'
import type { IntervalSplits } from '@/lib/types/splits'

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
    timeZone: 'Asia/Singapore',
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function parsePaceInput(value: string): number | null {
  const match = value.trim().match(/^(\d+):(\d{2})$/)
  if (!match) return null
  return parseInt(match[1]) * 60 + parseInt(match[2])
}

type SplitState = {
  warmupKm:      string
  warmupPace:    string
  reps:          string
  repKm:         string
  intervalPace:  string
  cooldownKm:    string
  cooldownPace:  string
}

function defaultSplitState(session: RawSession): SplitState {
  const sp = session.splits
  return {
    warmupKm:     sp?.warmup?.km?.toString()                          ?? '1',
    warmupPace:   sp?.warmup    ? formatPace(sp.warmup.paceSec)       : '6:05',
    reps:         sp?.intervals.reps?.toString()                      ?? '',
    repKm:        sp?.intervals.repKm?.toString()                     ?? '',
    intervalPace: sp?.intervals ? formatPace(sp.intervals.avgPaceSec) : '',
    cooldownKm:   sp?.cooldown?.km?.toString()                        ?? '1',
    cooldownPace: sp?.cooldown  ? formatPace(sp.cooldown.paceSec)     : '6:05',
  }
}

type Props = { session: RawSession; weekNumber: number; phaseName?: string }

export function SessionCard({ session, weekNumber, phaseName }: Props) {
  const [expanded, setExpanded]     = useState(false)
  const [editing, setEditing]       = useState(false)
  const [distInput, setDistInput]   = useState(session.actualDistanceKm?.toFixed(1) ?? '')
  const [paceInput, setPaceInput]   = useState(
    session.actualPaceSecPerKm ? formatPace(session.actualPaceSecPerKm) : '',
  )
  const [splitState, setSplitState] = useState<SplitState>(() => defaultSplitState(session))
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)
  const router = useRouter()

  const color      = TYPE_COLORS[session.type] ?? '#888'
  const isManual   = session.notes?.startsWith('__manual__') ?? false
  const isInterval = session.type === 'interval'

  // Interval sessions: show interval avg pace from splits (preferred) or fall back to overall
  const displayPaceSec = isInterval && session.splits
    ? session.splits.intervals.avgPaceSec
    : session.actualPaceSecPerKm

  function setSplit(field: keyof SplitState, value: string) {
    setSplitState(prev => ({ ...prev, [field]: value }))
  }

  async function handleSaveInterval() {
    const reps   = parseInt(splitState.reps)
    const repKm  = parseFloat(splitState.repKm)
    const avgPac = parsePaceInput(splitState.intervalPace)
    const wuKm   = parseFloat(splitState.warmupKm)
    const wuPac  = parsePaceInput(splitState.warmupPace)
    const cdKm   = parseFloat(splitState.cooldownKm)
    const cdPac  = parsePaceInput(splitState.cooldownPace)

    if (isNaN(reps) || reps <= 0)   { setSaveError('Enter number of reps'); return }
    if (isNaN(repKm) || repKm <= 0) { setSaveError('Enter rep distance'); return }
    if (!avgPac)                     { setSaveError('Enter interval pace as mm:ss'); return }
    if (!isNaN(wuKm) && wuKm > 0 && !wuPac)  { setSaveError('Enter warm-up pace as mm:ss'); return }
    if (!isNaN(cdKm) && cdKm > 0 && !cdPac)  { setSaveError('Enter cool-down pace as mm:ss'); return }

    const splits: IntervalSplits = {
      warmup:    (!isNaN(wuKm) && wuKm > 0 && wuPac) ? { km: wuKm, paceSec: wuPac } : null,
      intervals: { reps, repKm, avgPaceSec: avgPac },
      cooldown:  (!isNaN(cdKm) && cdKm > 0 && cdPac) ? { km: cdKm, paceSec: cdPac } : null,
    }

    setSaving(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ splits }),
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

  async function handleSaveSimple() {
    const dist = parseFloat(distInput)
    const pace = parsePaceInput(paceInput)
    if (isNaN(dist) || dist <= 0) { setSaveError('Enter a valid distance'); return }
    if (pace === null)             { setSaveError('Enter pace as mm:ss'); return }

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
              {displayPaceSec && (
                <span className="ml-2 font-mono text-xs text-muted">
                  {formatPace(displayPaceSec)} /km{isInterval && session.splits ? ' intervals' : ''}
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
              Target: {formatPace(session.targetPaceSecPerKm)} /km{isInterval ? ' (intervals)' : ''}
              {' '}· {session.distanceKm.toFixed(1)} km
            </p>
          )}
          {session.notes && !session.notes.startsWith('__manual__') && (
            <p className="mt-1 text-xs text-muted italic">{session.notes}</p>
          )}
          {isInterval && session.splits && (
            <div className="mt-2 text-xs text-muted space-y-0.5">
              {session.splits.warmup && (
                <p>WU: {session.splits.warmup.km} km @ {formatPace(session.splits.warmup.paceSec)} /km</p>
              )}
              <p>
                {session.splits.intervals.reps} × {session.splits.intervals.repKm} km
                @ {formatPace(session.splits.intervals.avgPaceSec)} /km
              </p>
              {session.splits.cooldown && (
                <p>CD: {session.splits.cooldown.km} km @ {formatPace(session.splits.cooldown.paceSec)} /km</p>
              )}
            </div>
          )}

          {!editing ? (
            <button
              className="mt-3 border border-border text-muted text-xs px-3 py-1.5 rounded-sm hover:border-accent hover:text-accent transition-colors"
              onClick={() => {
                if (!isInterval) {
                  setDistInput(session.actualDistanceKm?.toFixed(1) ?? '')
                  setPaceInput(session.actualPaceSecPerKm ? formatPace(session.actualPaceSecPerKm) : '')
                } else {
                  setSplitState(defaultSplitState(session))
                }
                setSaveError(null)
                setEditing(true)
              }}
            >
              {session.actualDistanceKm !== null ? 'Edit actuals' : 'Add actuals'}
            </button>
          ) : isInterval ? (
            /* Interval split edit form */
            <div className="mt-3 flex flex-col gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">Warm-up</p>
                <div className="flex gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted">Distance (km)</label>
                    <input type="number" step="0.5" min="0" value={splitState.warmupKm}
                      onChange={e => setSplit('warmupKm', e.target.value)}
                      className="w-20 rounded border border-border bg-bg px-2 py-1 text-sm text-text font-mono" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted">Pace (mm:ss)</label>
                    <input type="text" placeholder="6:05" value={splitState.warmupPace}
                      onChange={e => setSplit('warmupPace', e.target.value)}
                      className="w-20 rounded border border-border bg-bg px-2 py-1 text-sm text-text font-mono" />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">Intervals</p>
                <div className="flex gap-2 flex-wrap">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted">Reps</label>
                    <input type="number" min="1" value={splitState.reps}
                      onChange={e => setSplit('reps', e.target.value)}
                      className="w-16 rounded border border-border bg-bg px-2 py-1 text-sm text-text font-mono" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted">Rep dist (km)</label>
                    <input type="number" step="0.1" min="0" value={splitState.repKm}
                      onChange={e => setSplit('repKm', e.target.value)}
                      className="w-20 rounded border border-border bg-bg px-2 py-1 text-sm text-text font-mono" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted">Avg pace (mm:ss)</label>
                    <input type="text" placeholder="4:20" value={splitState.intervalPace}
                      onChange={e => setSplit('intervalPace', e.target.value)}
                      className="w-20 rounded border border-border bg-bg px-2 py-1 text-sm text-text font-mono" />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted mb-1.5">Cool-down</p>
                <div className="flex gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted">Distance (km)</label>
                    <input type="number" step="0.5" min="0" value={splitState.cooldownKm}
                      onChange={e => setSplit('cooldownKm', e.target.value)}
                      className="w-20 rounded border border-border bg-bg px-2 py-1 text-sm text-text font-mono" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] text-muted">Pace (mm:ss)</label>
                    <input type="text" placeholder="6:05" value={splitState.cooldownPace}
                      onChange={e => setSplit('cooldownPace', e.target.value)}
                      className="w-20 rounded border border-border bg-bg px-2 py-1 text-sm text-text font-mono" />
                  </div>
                </div>
              </div>

              {saveError && <p className="text-xs text-danger">{saveError}</p>}
              <div className="flex gap-2">
                <button onClick={handleSaveInterval} disabled={saving}
                  className="border border-accent text-accent text-xs px-3 py-1.5 rounded-sm hover:bg-accent hover:text-bg transition-colors disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditing(false)}
                  className="border border-border text-muted text-xs px-3 py-1.5 rounded-sm hover:border-danger hover:text-danger transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* Simple actuals form (non-interval sessions) */
            <div className="mt-3 flex flex-col gap-2">
              <div className="flex gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted uppercase tracking-wide">Distance (km)</label>
                  <input type="number" step="0.1" min="0" value={distInput}
                    onChange={e => setDistInput(e.target.value)}
                    className="w-24 rounded border border-border bg-bg px-2 py-1 text-sm text-text font-mono" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted uppercase tracking-wide">Avg Pace (mm:ss)</label>
                  <input type="text" placeholder="5:30" value={paceInput}
                    onChange={e => setPaceInput(e.target.value)}
                    className="w-24 rounded border border-border bg-bg px-2 py-1 text-sm text-text font-mono" />
                </div>
              </div>
              {saveError && <p className="text-xs text-danger">{saveError}</p>}
              <div className="flex gap-2">
                <button onClick={handleSaveSimple} disabled={saving}
                  className="border border-accent text-accent text-xs px-3 py-1.5 rounded-sm hover:bg-accent hover:text-bg transition-colors disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setEditing(false)}
                  className="border border-border text-muted text-xs px-3 py-1.5 rounded-sm hover:border-danger hover:text-danger transition-colors">
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
