// components/dashboard/EstimatedFinishWidget.tsx
import { formatDuration } from '@/lib/utils/format'
import type { EstimatedFinishResult } from '@/lib/dashboard/metrics'

type Props = EstimatedFinishResult & { goalTimeMinutes: number }

export function EstimatedFinishWidget({ estMinutes, deltaMinutes, confidence, goalTimeMinutes }: Props) {
  const ahead        = deltaMinutes <= 0
  const deltaAbs     = Math.abs(deltaMinutes)
  const deltaLabel   = `${ahead ? '−' : '+'}${formatDuration(deltaAbs)} to goal`
  const deltaColor   = ahead ? 'text-accent' : 'text-warning'

  return (
    <div className="flex flex-col gap-1 rounded-lg bg-surface p-4">
      <p className="text-[10px] uppercase tracking-widest text-muted">Est. Finish</p>
      <div className="flex items-baseline gap-2">
        <p className="font-mono text-xl font-bold text-text">
          {confidence ? formatDuration(estMinutes) : '—'}
        </p>
        {confidence && (
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted">
            {confidence}
          </span>
        )}
      </div>
      {confidence && (
        <p className={`font-mono text-xs ${deltaColor}`}>{deltaLabel}</p>
      )}
      {!confidence && (
        <p className="text-xs text-muted">Goal: {formatDuration(goalTimeMinutes)}</p>
      )}
    </div>
  )
}
