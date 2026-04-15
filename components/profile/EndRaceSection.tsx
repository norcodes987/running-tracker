// components/profile/EndRaceSection.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { Label }  from '@/components/ui/label'

type Props = { raceId: string; raceName: string }

export function EndRaceSection({ raceId, raceName }: Props) {
  const router               = useRouter()
  const [time,   setTime]    = useState('')
  const [notes,  setNotes]   = useState('')
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function endRace(action: 'clear' | 'keep') {
    setError(null)
    setLoading(true)
    try {
      let actualTimeMinutes: number | undefined
      if (time.trim()) {
        const parts = time.trim().split(':').map(Number)
        if (parts.some(isNaN)) { setError('Invalid time format'); setLoading(false); return }
        actualTimeMinutes =
          parts.length === 3
            ? parts[0] * 60 + parts[1] + parts[2] / 60
            : parts[0] + parts[1] / 60
      }

      const res = await fetch(`/api/races/${raceId}/complete`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ action, actualTimeMinutes, notes: notes || undefined }),
      })
      if (!res.ok) throw new Error('Failed')
      router.push('/dashboard')
    } catch {
      setError('Something went wrong — try again')
      setLoading(false)
    }
  }

  return (
    <div className="rounded-lg border border-danger p-4">
      <p className="mb-1 text-[10px] uppercase tracking-widest text-danger">Danger Zone</p>
      <p className="mb-3 text-sm text-muted">End training for {raceName}.</p>

      <AlertDialog>
        <AlertDialogTrigger
          render={<Button variant="outline" className="border-danger text-danger hover:bg-danger/10" />}
        >
          End this race
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End race: {raceName}</AlertDialogTitle>
            <AlertDialogDescription>
              Optionally record your result before ending.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-3 py-2">
            <div>
              <Label htmlFor="end-time" className="text-xs">
                Finish time (optional, h:mm:ss or m:ss)
              </Label>
              <Input
                id="end-time"
                value={time}
                onChange={e => setTime(e.target.value)}
                placeholder="1:45:00"
                className="mt-1 font-mono"
              />
            </div>
            <div>
              <Label htmlFor="end-notes" className="text-xs">Notes (optional)</Label>
              <Input
                id="end-notes"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="How did it go?"
                className="mt-1"
              />
            </div>
            {error && <p className="text-xs text-danger">{error}</p>}
          </div>

          <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
            <AlertDialogAction
              disabled={loading}
              onClick={() => endRace('clear')}
              className="w-full bg-danger text-white hover:bg-danger/90"
            >
              Log result &amp; clear data
            </AlertDialogAction>
            <AlertDialogAction
              disabled={loading}
              onClick={() => endRace('keep')}
              className="w-full bg-surface text-text hover:bg-surface/80"
            >
              Keep data for now
            </AlertDialogAction>
            <AlertDialogCancel className="w-full">Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
