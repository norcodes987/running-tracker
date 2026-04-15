// components/profile/GoalTimeForm.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'
import { formatDuration } from '@/lib/utils/format'

type Props = { currentGoalTimeMinutes: number }

export function GoalTimeForm({ currentGoalTimeMinutes }: Props) {
  const [value,   setValue]   = useState(formatDuration(currentGoalTimeMinutes))
  const [saving,  setSaving]  = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    // Parse "h:mm:ss" or "m:ss"
    const parts = value.trim().split(':').map(Number)
    if (parts.some(isNaN) || parts.length < 2) {
      setMessage('Enter time as m:ss or h:mm:ss')
      return
    }
    const minutes =
      parts.length === 3
        ? parts[0] * 60 + parts[1] + parts[2] / 60
        : parts[0] + parts[1] / 60
    if (minutes <= 0) { setMessage('Time must be positive'); return }

    setSaving(true)
    try {
      const res = await fetch('/api/profile', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ goalTimeMinutes: minutes }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setMessage('Saved!')
    } catch {
      setMessage('Error saving — try again')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="mb-3 text-[10px] uppercase tracking-widest text-muted">Goal Time</p>
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <div className="flex-1">
          <Label htmlFor="goal-time" className="text-xs text-muted">
            h:mm:ss or m:ss
          </Label>
          <Input
            id="goal-time"
            value={value}
            onChange={e => setValue(e.target.value)}
            className="mt-1 font-mono"
            placeholder="1:45:00"
          />
        </div>
        <Button type="submit" disabled={saving} size="sm">
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </form>
      {message && (
        <p className={`mt-2 text-xs ${message === 'Saved!' ? 'text-accent' : 'text-danger'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
