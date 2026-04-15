// components/profile/TrainingSummary.tsx

type Props = {
  weeksCompleted: number
  totalKmLogged: number
  sessionsHit: number
  sessionsMissed: number
}

export function TrainingSummary({ weeksCompleted, totalKmLogged, sessionsHit, sessionsMissed }: Props) {
  return (
    <div className="rounded-lg bg-surface p-4">
      <p className="mb-3 text-[10px] uppercase tracking-widest text-muted">Training Summary</p>
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Weeks completed', value: String(weeksCompleted) },
          { label: 'Total km logged', value: totalKmLogged.toFixed(1) },
          { label: 'Sessions hit',    value: String(sessionsHit) },
          { label: 'Sessions missed', value: String(sessionsMissed) },
        ].map(({ label, value }) => (
          <div key={label} className="rounded bg-bg p-3">
            <p className="font-mono text-lg font-bold text-text">{value}</p>
            <p className="text-[10px] text-muted">{label}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
