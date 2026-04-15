// components/profile/HrZonesDisplay.tsx

const ZONES = [
  { zone: 'Z1', label: 'Recovery',           pctMin: 0,    pctMax: 0.60 },
  { zone: 'Z2', label: 'Aerobic base',        pctMin: 0.60, pctMax: 0.70 },
  { zone: 'Z3', label: 'Aerobic threshold',   pctMin: 0.70, pctMax: 0.80 },
  { zone: 'Z4', label: 'Lactate threshold',   pctMin: 0.80, pctMax: 0.90 },
  { zone: 'Z5', label: 'VO₂ max',             pctMin: 0.90, pctMax: 1.00 },
]

type Props = { maxHr: number | null; age: number | null }

export function HrZonesDisplay({ maxHr, age }: Props) {
  const resolvedMaxHr = maxHr ?? (age ? Math.round(208 - 0.7 * age) : null)

  if (!resolvedMaxHr) {
    return (
      <div className="rounded-lg bg-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted">HR Zones</p>
        <p className="mt-2 text-sm text-muted">Upload Garmin data to calculate HR zones.</p>
      </div>
    )
  }

  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="mb-3 text-[10px] uppercase tracking-widest text-muted">
        HR Zones <span className="normal-case">(max {resolvedMaxHr} bpm)</span>
      </p>
      <div className="flex flex-col gap-1.5">
        {ZONES.map(z => {
          const lo = Math.round(resolvedMaxHr * z.pctMin) + (z.pctMin > 0 ? 1 : 0)
          const hi = Math.round(resolvedMaxHr * z.pctMax)
          return (
            <div key={z.zone} className="flex items-center gap-3">
              <span className="w-6 font-mono text-xs font-bold text-accent">{z.zone}</span>
              <span className="flex-1 text-xs text-text">{z.label}</span>
              <span className="font-mono text-xs text-muted">{lo}–{hi} bpm</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
