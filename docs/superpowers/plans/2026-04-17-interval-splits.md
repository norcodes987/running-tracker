# Interval Splits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow interval sessions to record warm-up, interval reps, and cool-down splits separately so that interval pace is measured from reps only, while total distance still counts towards weekly mileage.

**Architecture:** Add a `splits` JSONB column to `training_sessions`. The PATCH API accepts splits for interval sessions and derives `actualPaceSecPerKm` from the intervals section (not overall average). The `SessionCard` shows a 3-section edit form for interval type sessions. Strava sync is unchanged — it fills overall totals, and the existing `__manual__` guard prevents it from overwriting once splits are saved.

**Tech Stack:** Next.js 15, Drizzle ORM, Neon PostgreSQL, Vitest, React

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/types/splits.ts` | Create | `IntervalSplits` type definition |
| `lib/db/schema.ts` | Modify | Add `splits` jsonb column |
| `drizzle/0002_interval_splits.sql` | Create | Migration SQL |
| `lib/sessions/queries.ts` | Modify | Add `splits` to `RawSession`, select it |
| `app/api/sessions/[id]/route.ts` | Modify | Accept splits body, derive interval pace |
| `components/workouts/SessionCard.tsx` | Modify | 3-section edit UI for interval sessions |
| `docs/training-plan-1h40-curated.md` | Modify | Document splits concept |
| `docs/training-plan-1h40.csv` | Create | Upload-ready CSV with notes |
| `__tests__/sessions/grouping.test.ts` | Modify | Add `splits: null` to `makeSession` factory |
| `__tests__/training/parse-csv.test.ts` | Modify | Add test for `notes` column parsing |

---

### Task 1: Define the IntervalSplits type

**Files:**
- Create: `lib/types/splits.ts`

- [ ] **Step 1: Create the type file**

```typescript
// lib/types/splits.ts
export type IntervalSplits = {
  warmup:    { km: number; paceSec: number } | null
  intervals: { reps: number; repKm: number; avgPaceSec: number }
  cooldown:  { km: number; paceSec: number } | null
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/types/splits.ts
git commit -m "feat: add IntervalSplits type"
```

---

### Task 2: Add splits column to schema and migration

**Files:**
- Modify: `lib/db/schema.ts`
- Create: `drizzle/0002_interval_splits.sql`

- [ ] **Step 1: Add `splits` to schema**

In `lib/db/schema.ts`, add this import at the top alongside existing drizzle imports:
```typescript
import { pgTable, text, real, integer, timestamp, date, jsonb } from 'drizzle-orm/pg-core'
```
Then add the `splits` column inside `trainingSessions` after `notes`:
```typescript
  notes:              text('notes'),
  splits:             jsonb('splits').$type<import('@/lib/types/splits').IntervalSplits>(),
  rescheduledFrom:    text('rescheduled_from'),
```

- [ ] **Step 2: Write the migration SQL**

Create `drizzle/0002_interval_splits.sql`:
```sql
ALTER TABLE "training_sessions" ADD COLUMN "splits" jsonb;
```

- [ ] **Step 3: Run the migration against the dev database**

```bash
cd .worktrees/phase-3-strava
npx drizzle-kit migrate
```

Expected: migration applies cleanly with no errors.

- [ ] **Step 4: Commit**

```bash
git add lib/db/schema.ts drizzle/0002_interval_splits.sql
git commit -m "feat: add splits jsonb column to training_sessions"
```

---

### Task 3: Update RawSession type and queries

**Files:**
- Modify: `lib/sessions/queries.ts`

- [ ] **Step 1: Update the failing test first**

In `__tests__/sessions/grouping.test.ts`, update `makeSession` to include `splits: null`:
```typescript
import type { RawSession } from '@/lib/sessions/queries'

function makeSession(overrides: Partial<RawSession>): RawSession {
  return {
    id: 'x',
    date: '2026-04-14',
    type: 'easy',
    distanceKm: 8,
    targetPaceSecPerKm: 390,
    targetHrZone: null,
    status: 'planned',
    actualDistanceKm: null,
    actualPaceSecPerKm: null,
    actualAvgHr: null,
    distanceScore: null,
    paceScore: null,
    qualityScore: null,
    notes: null,
    splits: null,          // ← new
    rescheduledFrom: null,
    planChanges: [],
    ...overrides,
  }
}
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd .worktrees/phase-3-strava
npx vitest run __tests__/sessions/grouping.test.ts
```

Expected: TypeScript error — `splits` does not exist on `RawSession`.

- [ ] **Step 3: Add `splits` to `RawSession` in queries.ts**

In `lib/sessions/queries.ts`, add the import and update the type:
```typescript
import type { IntervalSplits } from '@/lib/types/splits'

export type RawSession = {
  id: string
  date: string
  type: string
  distanceKm: number
  targetPaceSecPerKm: number | null
  targetHrZone: string | null
  status: string
  actualDistanceKm: number | null
  actualPaceSecPerKm: number | null
  actualAvgHr: number | null
  distanceScore: number | null
  paceScore: number | null
  qualityScore: number | null
  notes: string | null
  splits: IntervalSplits | null      // ← new
  rescheduledFrom: string | null
  planChanges: PlanChange[]
}
```

- [ ] **Step 4: Add `splits` to the DB select and mapping in `getSessionsByWeek`**

In the `db.select({...})` block, add:
```typescript
        splits:             trainingSessions.splits,
```

In the `rawSessions` mapping, add:
```typescript
    splits:             s.splits as IntervalSplits | null,
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run __tests__/sessions/grouping.test.ts
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/sessions/queries.ts __tests__/sessions/grouping.test.ts
git commit -m "feat: add splits to RawSession type and query select"
```

---

### Task 4: Update PATCH /api/sessions/[id] to accept splits

**Files:**
- Modify: `app/api/sessions/[id]/route.ts`

The rule: when `splits` is provided for an `interval` session, `actualPaceSecPerKm` is set to `splits.intervals.avgPaceSec`. `actualDistanceKm` is computed from splits (warmup + reps + cooldown) if not separately provided. The `__manual__` guard fires as before.

- [ ] **Step 1: Replace the route body**

```typescript
// app/api/sessions/[id]/route.ts
import { NextResponse } from 'next/server'
import { auth }         from '@/lib/auth'
import { db }           from '@/lib/db'
import { trainingSessions } from '@/lib/db/schema'
import { eq, and }      from 'drizzle-orm'
import type { IntervalSplits } from '@/lib/types/splits'

type PatchBody = {
  actualDistanceKm?: unknown
  actualPaceSecPerKm?: unknown
  splits?: unknown
}

function isIntervalSplits(v: unknown): v is IntervalSplits {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  if (typeof s.intervals !== 'object' || s.intervals === null) return false
  const iv = s.intervals as Record<string, unknown>
  return (
    typeof iv.reps === 'number' &&
    typeof iv.repKm === 'number' &&
    typeof iv.avgPaceSec === 'number'
  )
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } },
) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  let body: PatchBody
  try { body = await request.json() }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const existing = await db.query.trainingSessions.findFirst({
    where: and(
      eq(trainingSessions.id, params.id),
      eq(trainingSessions.userId, userId),
    ),
  })
  if (!existing) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  // --- splits path (interval sessions) ---
  if (body.splits !== undefined) {
    if (!isIntervalSplits(body.splits)) {
      return NextResponse.json({ error: 'Invalid splits shape' }, { status: 400 })
    }
    const sp = body.splits
    const warmupKm   = sp.warmup?.km   ?? 0
    const cooldownKm = sp.cooldown?.km ?? 0
    const intervalKm = sp.intervals.reps * sp.intervals.repKm
    const totalKm    = warmupKm + intervalKm + cooldownKm

    const distanceScore = Math.min(100, Math.round((totalKm / existing.distanceKm) * 100))
    const status = totalKm >= existing.distanceKm ? 'completed' : 'partial'
    const prevNotes = existing.notes?.replace(/^__manual__/, '') ?? ''

    await db
      .update(trainingSessions)
      .set({
        actualDistanceKm:   totalKm,
        actualPaceSecPerKm: sp.intervals.avgPaceSec,
        distanceScore,
        status,
        splits:             sp,
        notes:              '__manual__' + prevNotes,
      })
      .where(eq(trainingSessions.id, params.id))

    return NextResponse.json({ ok: true })
  }

  // --- simple actuals path (non-interval sessions) ---
  if (typeof body.actualDistanceKm !== 'number' || typeof body.actualPaceSecPerKm !== 'number') {
    return NextResponse.json(
      { error: 'Provide splits for interval sessions, or actualDistanceKm + actualPaceSecPerKm for others' },
      { status: 400 },
    )
  }

  const { actualDistanceKm, actualPaceSecPerKm } = body as { actualDistanceKm: number; actualPaceSecPerKm: number }
  const status = existing.type === 'bonus' || actualDistanceKm >= existing.distanceKm
    ? 'completed'
    : 'partial'
  const distanceScore = existing.type === 'bonus'
    ? 100
    : Math.min(100, Math.round((actualDistanceKm / existing.distanceKm) * 100))
  const prevNotes = existing.notes?.replace(/^__manual__/, '') ?? ''

  await db
    .update(trainingSessions)
    .set({
      actualDistanceKm,
      actualPaceSecPerKm,
      distanceScore,
      status,
      notes: '__manual__' + prevNotes,
    })
    .where(eq(trainingSessions.id, params.id))

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/sessions/[id]/route.ts
git commit -m "feat: PATCH /api/sessions/[id] accepts splits for interval sessions"
```

---

### Task 5: Update SessionCard for interval splits UI

**Files:**
- Modify: `components/workouts/SessionCard.tsx`

When a session is type `interval`, the edit form shows three sections: Warm-up, Intervals, Cool-down. The displayed pace in the collapsed row and expanded detail uses the interval avg pace from `splits` if available, falling back to `actualPaceSecPerKm`.

- [ ] **Step 1: Replace SessionCard.tsx**

```tsx
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
    warmupKm:     sp?.warmup?.km?.toString()                      ?? '1',
    warmupPace:   sp?.warmup   ? formatPace(sp.warmup.paceSec)    : '6:05',
    reps:         sp?.intervals.reps?.toString()                  ?? '',
    repKm:        sp?.intervals.repKm?.toString()                 ?? '',
    intervalPace: sp?.intervals ? formatPace(sp.intervals.avgPaceSec) : '',
    cooldownKm:   sp?.cooldown?.km?.toString()                    ?? '1',
    cooldownPace: sp?.cooldown  ? formatPace(sp.cooldown.paceSec) : '6:05',
  }
}

type Props = { session: RawSession; weekNumber: number; phaseName?: string }

export function SessionCard({ session, weekNumber, phaseName }: Props) {
  const [expanded, setExpanded]   = useState(false)
  const [editing, setEditing]     = useState(false)
  const [distInput, setDistInput] = useState(session.actualDistanceKm?.toFixed(1) ?? '')
  const [paceInput, setPaceInput] = useState(
    session.actualPaceSecPerKm ? formatPace(session.actualPaceSecPerKm) : '',
  )
  const [splitState, setSplitState] = useState<SplitState>(() => defaultSplitState(session))
  const [saving, setSaving]         = useState(false)
  const [saveError, setSaveError]   = useState<string | null>(null)
  const router = useRouter()

  const color    = TYPE_COLORS[session.type] ?? '#888'
  const isManual = session.notes?.startsWith('__manual__') ?? false
  const isInterval = session.type === 'interval'

  // Interval pace from splits (preferred) or fallback to overall pace
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

    if (isNaN(reps) || reps <= 0)      { setSaveError('Enter number of reps'); return }
    if (isNaN(repKm) || repKm <= 0)    { setSaveError('Enter rep distance'); return }
    if (!avgPac)                        { setSaveError('Enter interval pace as mm:ss'); return }

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
            /* ── Interval split edit form ── */
            <div className="mt-3 flex flex-col gap-3">
              {/* Warm-up */}
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

              {/* Intervals */}
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

              {/* Cool-down */}
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
            /* ── Simple actuals form (non-interval) ── */
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
```

- [ ] **Step 2: Commit**

```bash
git add components/workouts/SessionCard.tsx
git commit -m "feat: interval sessions show 3-section split edit form in SessionCard"
```

---

### Task 6: Update parse-csv tests for notes column

**Files:**
- Modify: `__tests__/training/parse-csv.test.ts`

- [ ] **Step 1: Read the existing parse-csv tests**

```bash
cat __tests__/training/parse-csv.test.ts
```

- [ ] **Step 2: Add a test for notes column parsing**

In the existing test file, add:
```typescript
  it('parses optional notes column when present', () => {
    const csv = [
      'date,type,km,target_pace,notes',
      '2026-04-22,interval,8,4:20,1km WU + 6x800m @ 4:20 (90s rec) + 1km CD',
      '2026-04-24,easy,8,6:05,',
    ].join('\n')
    const result = parsePlanCsv(csv, 2026)
    expect(result[0].notes).toBe('1km WU + 6x800m @ 4:20 (90s rec) + 1km CD')
    expect(result[1].notes).toBeNull()
  })

  it('sets notes to null when notes column is absent', () => {
    const csv = [
      'date,type,km,target_pace',
      '2026-04-22,interval,8,4:20',
    ].join('\n')
    const result = parsePlanCsv(csv, 2026)
    expect(result[0].notes).toBeNull()
  })
```

- [ ] **Step 3: Run the tests**

```bash
npx vitest run __tests__/training/parse-csv.test.ts
```

Expected: new tests pass (the notes parsing was already implemented earlier in this session).

- [ ] **Step 4: Commit**

```bash
git add __tests__/training/parse-csv.test.ts
git commit -m "test: add notes column parsing tests for parse-csv"
```

---

### Task 7: Write the training plan CSV

**Files:**
- Create: `docs/training-plan-1h40.csv`

- [ ] **Step 1: Create the CSV**

Interval distances use 1 km warm-up + reps + recovery jogs + 1 km cool-down. Tempo distances match the plan's explicit warm-up/cool-down breakdown. The `notes` column gives the session structure for the UI hint.

```
date,type,km,target_pace,notes
2026-04-20,easy,10,6:05,
2026-04-22,interval,8,4:20,1km WU + 6×800m @ 4:20 (90s rec) + 1km CD
2026-04-24,easy,8,6:05,
2026-04-26,long_run,17,5:55,
2026-04-27,tempo,8,5:05,2km WU + 5km tempo + 1km CD
2026-04-29,easy,9,6:05,
2026-05-01,interval,8.5,4:25,1km WU + 5×1000m @ 4:25 (2min rec) + 1km CD
2026-05-03,long_run,18,5:55,
2026-05-05,race_pace,10,4:44,2km easy + 6km @ 4:44 + 2km easy
2026-05-07,easy,9,6:05,
2026-05-09,tempo,9,5:05,2km WU + 6km tempo + 1km CD
2026-05-11,long_run,19,5:55,
2026-05-12,interval,10,4:20,1km WU + 8×800m @ 4:20 (90s rec) + 1km CD
2026-05-14,easy,10,6:05,
2026-05-16,race_pace,12,4:44,2km easy + 8km @ 4:44 + 2km easy
2026-05-18,long_run,20,5:50,
2026-05-19,tempo,11,5:05,2km WU + 8km tempo + 1km CD
2026-05-21,easy,10,6:05,
2026-05-23,race_pace,14,4:44,2km easy + 10km @ 4:44 + 2km easy
2026-05-25,long_run,21,5:50,First time beyond 20km — stay easy
2026-05-26,interval,9.5,4:20,1km WU + 5×1200m @ 4:20 (2min rec) + 1km CD
2026-05-28,easy,11,6:05,
2026-05-30,race_pace,16,4:44,2km easy + 12km @ 4:44 + 2km easy
2026-06-01,long_run,22,5:50,
2026-06-02,tempo,12,5:05,2km WU + 9km tempo + 1km CD
2026-06-04,easy,11,6:05,
2026-06-06,race_pace,17,4:44,2km easy + 13km @ 4:44 + 2km easy
2026-06-08,long_run,22,5:45,
2026-06-09,interval,11,4:20,1km WU + 6×1200m @ 4:20 (2min rec) + 1km CD
2026-06-11,easy,12,6:05,
2026-06-13,race_pace,19,4:44,2km easy + 15km @ 4:44 + 2km easy
2026-06-15,long_run,23,5:45,Peak long run
2026-06-16,tempo,13,5:05,2km WU + 10km tempo + 1km CD
2026-06-18,easy,12,6:05,
2026-06-20,race_pace,21,4:44,2km easy + 17km @ 4:44 + 2km easy
2026-06-22,long_run,22,5:45,
2026-06-23,interval,12,4:20,1km WU + 5×1600m @ 4:20 (2.5min rec) + 1km CD
2026-06-25,easy,11,6:05,
2026-06-27,race_pace,19,4:44,2km easy + 15km @ 4:44 + 2km easy
2026-06-29,long_run,21,5:50,
2026-06-30,tempo,12,5:05,2km WU + 9km tempo + 1km CD
2026-07-02,easy,10,6:05,
2026-07-04,race_pace,14,4:44,2km easy + 10km @ 4:44 + 2km easy
2026-07-06,long_run,18,5:55,Backing off — trust the work done
2026-07-07,easy,9,6:05,
2026-07-09,interval,6,4:20,1km WU + 4×800m @ 4:20 (90s rec) + 1km CD
2026-07-11,race_pace,8,4:44,Feel the pace — should feel easy by now
2026-07-13,easy,13,6:00,Final long run — comfortable
2026-07-14,easy,6,6:10,Stay loose
2026-07-16,easy,5,6:05,3km easy + 4×100m strides @ race effort
2026-07-17,easy,4,6:15,Last tune-up
2026-07-18,easy,3,6:15,Shakeout — optional
2026-07-19,race_pace,21.1,4:44,Goal: 1:40:00
```

- [ ] **Step 2: Commit**

```bash
git add docs/training-plan-1h40.csv
git commit -m "docs: add upload-ready CSV for 1:40 half marathon plan"
```

---

### Task 8: Update training plan markdown doc

**Files:**
- Modify: `docs/training-plan-1h40-curated.md`

- [ ] **Step 1: Add an "Uploading to Percy" section after the Volume Progression table**

Insert after the `## Volume Progression` section and before `## Key Notes`:

```markdown
## Uploading to Percy

The file `docs/training-plan-1h40.csv` is ready to upload via the **Workouts → Upload Plan** button.

**CSV columns:** `date`, `type`, `km`, `target_pace`, `notes`

**Interval session distances** include 1 km warm-up + hard reps + recovery jogs + 1 km cool-down. The `target_pace` column is the **interval rep pace**, not the overall session average.

**After completing an interval session**, expand the session card in the Workouts view and tap **Add actuals**. You will see three sections:
- **Warm-up** — distance and pace for the easy opener
- **Intervals** — number of reps, rep distance, and average rep pace
- **Cool-down** — distance and pace for the easy finisher

Percy records total distance (WU + reps + CD) for weekly mileage, and uses the interval rep pace for pace tracking.
```

- [ ] **Step 2: Commit**

```bash
git add docs/training-plan-1h40-curated.md
git commit -m "docs: document splits upload flow in training plan"
```

---

## Self-Review

**Spec coverage:**
- ✅ Splits stored as JSONB — Task 2
- ✅ Total distance (WU + intervals + CD) used for weekly mileage — Task 4 (totalKm computed from splits)
- ✅ Interval pace derived from intervals section only — Task 4 (actualPaceSecPerKm = avgPaceSec)
- ✅ Strava sync unchanged, __manual__ guard prevents overwrite — existing code, no task needed
- ✅ 3-section edit form in SessionCard — Task 5
- ✅ Notes shown as session hint in expanded view — Task 5
- ✅ CSV with notes column — Task 7
- ✅ Markdown docs updated — Task 8

**Placeholder scan:** No TBDs, no "handle edge cases" without code, no "similar to task N".

**Type consistency:** `IntervalSplits` defined in Task 1, imported in Tasks 2, 4, 5. `RawSession.splits` added in Task 3, used in Task 5 (`session.splits`). `defaultSplitState` references `session.splits` which matches the updated `RawSession` type. ✅
