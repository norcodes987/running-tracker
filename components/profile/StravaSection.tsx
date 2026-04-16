// components/profile/StravaSection.tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  isConnected: boolean
  athleteName: string | null
  lastSyncAt:  Date | null
}

function formatSyncDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date).replace(',', ' ·')
}

export function StravaSection({ isConnected, athleteName, lastSyncAt }: Props) {
  const router  = useRouter()
  const [syncing,       setSyncing]       = useState(false)
  const [syncResult,    setSyncResult]    = useState<string | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res  = await fetch('/api/strava/sync', { method: 'POST' })
      const data = await res.json() as { synced: number; skipped: number }
      setSyncResult(data.synced === 0 ? 'Already up to date' : `Synced ${data.synced} run${data.synced === 1 ? '' : 's'}`)
    } catch {
      setSyncResult('Sync failed — try again')
    } finally {
      setSyncing(false)
      router.refresh()
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    await fetch('/api/strava/disconnect', { method: 'POST' })
    router.refresh()
  }

  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="text-[10px] uppercase tracking-widest text-muted mb-3">Strava</p>

      {!isConnected ? (
        <a
          href="/api/strava/auth"
          className="inline-block border border-accent text-accent text-xs px-4 py-2 rounded-sm hover:bg-accent hover:text-bg transition-colors"
        >
          Connect Strava
        </a>
      ) : (
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-sm text-text">
              <span className="text-accent mr-1">✓</span>
              Connected{athleteName ? ` as ${athleteName}` : ''}
            </p>
            {lastSyncAt && (
              <p className="text-xs text-muted mt-0.5">
                Last synced: {formatSyncDate(lastSyncAt)}
              </p>
            )}
            {!lastSyncAt && (
              <p className="text-xs text-muted mt-0.5">Never synced</p>
            )}
          </div>

          {syncResult && (
            <p className="text-xs text-accent">{syncResult}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSync}
              disabled={syncing}
              className="border border-accent text-accent text-xs px-4 py-2 rounded-sm hover:bg-accent hover:text-bg transition-colors disabled:opacity-50"
            >
              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="border border-border text-muted text-xs px-4 py-2 rounded-sm hover:border-danger hover:text-danger transition-colors disabled:opacity-50"
            >
              {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
