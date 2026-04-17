// app/(app)/race/page.tsx
import { getActiveRace } from '@/lib/race/active-race'
import { RaceInfoCard } from '@/components/race/RaceInfoCard'

export default async function RacePage() {
  const race = await getActiveRace()
  if (!race) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted">No active race.</p>
      </div>
    )
  }

  return <RaceInfoCard race={race} />
}
