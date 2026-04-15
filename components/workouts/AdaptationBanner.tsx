// components/workouts/AdaptationBanner.tsx
'use client'

import { useState } from 'react'
import type { PlanChange } from '@/lib/sessions/queries'

type Props = { changes: PlanChange[] }

export function AdaptationBanner({ changes }: Props) {
  const [expanded, setExpanded] = useState(false)
  if (changes.length === 0) return null

  const latest = changes[changes.length - 1]

  return (
    <button
      type="button"
      className="mt-2 w-full cursor-pointer rounded border-l-2 border-accent bg-transparent px-3 py-2 text-left"
      onClick={(e) => { e.stopPropagation(); setExpanded(v => !v) }}
    >
      <p className="text-xs text-accent">
        Plan adapted · {latest.optionUsed ?? 'Auto'}
      </p>
      {expanded && latest.reasoning && (
        <p className="mt-1 text-xs text-muted">{latest.reasoning}</p>
      )}
    </button>
  )
}
