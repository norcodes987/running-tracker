// components/workouts/PlanUploadButton.tsx
'use client'

import { useRef, useState } from 'react'
import { useRouter }        from 'next/navigation'

type Props = { raceId: string }

export function PlanUploadButton({ raceId }: Props) {
  const inputRef             = useRef<HTMLInputElement>(null)
  const [status, setStatus]  = useState<'idle' | 'uploading' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const router               = useRouter()

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setStatus('uploading')
    setMessage(null)

    const form = new FormData()
    form.append('file', file)

    try {
      const res = await fetch(`/api/races/${raceId}/plan`, { method: 'POST', body: form })
      const data = await res.json() as { inserted?: number; error?: string }
      if (!res.ok) {
        setStatus('error')
        setMessage(data.error ?? 'Upload failed')
      } else {
        setStatus('done')
        setMessage(`Loaded ${data.inserted} sessions`)
        router.refresh()
      }
    } catch {
      setStatus('error')
      setMessage('Upload failed — check your connection')
    } finally {
      // Reset input so the same file can be re-uploaded
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="flex items-center gap-3">
      <input
        ref={inputRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFile}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={status === 'uploading'}
        className="border border-border text-muted text-xs px-4 py-2 rounded-sm hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
      >
        {status === 'uploading' ? 'Uploading…' : 'Upload Plan'}
      </button>
      {message && (
        <p className={`text-xs ${status === 'error' ? 'text-danger' : 'text-accent'}`}>
          {message}
        </p>
      )}
    </div>
  )
}
