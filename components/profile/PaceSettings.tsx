// components/profile/PaceSettings.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatPace } from '@/lib/utils/format'

const PACE_TYPES = [
  { key: 'easy',      label: 'Easy' },
  { key: 'tempo',     label: 'Tempo' },
  { key: 'interval',  label: 'Interval' },
  { key: 'long_run',  label: 'Long Run' },
  { key: 'race_pace', label: 'Race Pace' },
] as const

type PaceZones = Partial<Record<string, number>>

// Seconds → "mm:ss"
function secToStr(sec: number | undefined): string {
  if (!sec) return ''
  return formatPace(sec)
}

// "mm:ss" → seconds | null
function strToSec(s: string): number | null {
  const match = s.trim().match(/^(\d+):(\d{2})$/)
  if (!match) return null
  return parseInt(match[1]) * 60 + parseInt(match[2])
}

type Props = { paceZones: PaceZones }

export function PaceSettings({ paceZones }: Props) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(PACE_TYPES.map(({ key }) => [key, secToStr(paceZones[key])])),
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)
  const [error, setError]   = useState<string | null>(null)
  const router = useRouter()

  async function handleSave() {
    const zones: Record<string, number> = {}
    for (const { key } of PACE_TYPES) {
      const sec = strToSec(values[key])
      if (values[key] && sec === null) {
        setError(`Invalid pace for ${key} — use mm:ss format`)
        return
      }
      if (sec !== null) zones[key] = sec
    }

    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paceZones: zones }),
      })
      if (!res.ok) throw new Error('Save failed')
      setSaved(true)
      router.refresh()
    } catch {
      setError('Save failed — try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="mb-3 text-[10px] uppercase tracking-widest text-muted">Target Paces</p>
      <div className="flex flex-col gap-3">
        {PACE_TYPES.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between gap-3">
            <label className="text-sm text-text w-24">{label}</label>
            <input
              type="text"
              placeholder="mm:ss"
              value={values[key]}
              onChange={e => setValues(v => ({ ...v, [key]: e.target.value }))}
              className="w-24 rounded border border-border bg-bg px-2 py-1 text-sm font-mono text-text text-right"
            />
          </div>
        ))}
      </div>
      {error  && <p className="mt-2 text-xs text-danger">{error}</p>}
      {saved  && <p className="mt-2 text-xs text-accent">Saved</p>}
      <button
        onClick={handleSave}
        disabled={saving}
        className="mt-4 border border-accent text-accent text-xs px-4 py-2 rounded-sm hover:bg-accent hover:text-bg transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save paces'}
      </button>
    </div>
  )
}
