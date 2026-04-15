// components/dashboard/WeeklyDistanceWidget.tsx

type Props = { actualKm: number; targetKm: number }

export function WeeklyDistanceWidget({ actualKm, targetKm }: Props) {
  const pct   = targetKm === 0 ? 0 : Math.min(actualKm / targetKm, 1)
  const color = pct >= 0.8 ? '#C8FF00' : pct >= 0.5 ? '#FF9500' : '#FF4444'
  const r     = 32
  const cx    = 40
  const cy    = 40
  const circ  = 2 * Math.PI * r
  const dash  = pct * circ

  return (
    <div className="flex items-center gap-4 rounded-lg bg-surface p-4">
      <svg width="80" height="80" viewBox="0 0 80 80" className="shrink-0">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1a1a1a" strokeWidth="6" />
        <circle
          cx={cx} cy={cy} r={r} fill="none"
          stroke={color} strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform={`rotate(-90 ${cx} ${cy})`}
        />
      </svg>
      <div>
        <p className="text-[10px] uppercase tracking-widest text-muted">Weekly Distance</p>
        <p className="mt-1 font-mono text-xl font-bold text-text">
          {actualKm.toFixed(1)}
          <span className="text-sm text-muted"> / {targetKm.toFixed(1)} km</span>
        </p>
      </div>
    </div>
  )
}
