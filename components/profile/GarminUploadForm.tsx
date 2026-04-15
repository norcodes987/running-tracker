// components/profile/GarminUploadForm.tsx
'use client'

import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label }  from '@/components/ui/label'

type Props = { lastUpdated: Date | null }

export function GarminUploadForm({ lastUpdated }: Props) {
  const inputRef                   = useRef<HTMLInputElement>(null)
  const [uploading, setUploading]  = useState(false)
  const [message,   setMessage]    = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    const file = inputRef.current?.files?.[0]
    if (!file) { setMessage('Select a CSV file'); return }

    const text = await file.text()
    setUploading(true)
    try {
      const res = await fetch('/api/profile', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ garminCsv: text }),
      })
      if (!res.ok) throw new Error('Upload failed')
      setMessage('Updated!')
    } catch {
      setMessage('Error uploading — try again')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="mb-3 text-[10px] uppercase tracking-widest text-muted">Garmin Data</p>
      {lastUpdated && (
        <p className="mb-2 text-xs text-muted">
          Last updated: {lastUpdated.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
      )}
      <form onSubmit={handleSubmit} className="flex items-end gap-3">
        <div className="flex-1">
          <Label htmlFor="garmin-csv" className="text-xs text-muted">
            Garmin Activities CSV
          </Label>
          <input
            id="garmin-csv"
            ref={inputRef}
            type="file"
            accept=".csv"
            className="mt-1 block w-full text-sm text-muted file:mr-3 file:rounded file:border-0 file:bg-bg file:px-3 file:py-1.5 file:text-xs file:text-text"
          />
        </div>
        <Button type="submit" disabled={uploading} size="sm">
          {uploading ? 'Uploading…' : 'Upload'}
        </Button>
      </form>
      {message && (
        <p className={`mt-2 text-xs ${message === 'Updated!' ? 'text-accent' : 'text-danger'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
