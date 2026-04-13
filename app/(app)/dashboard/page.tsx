import { getActiveRace } from '@/lib/race/active-race'

export default async function DashboardPage() {
  const race = await getActiveRace()

  return (
    <div className="p-4">
      <p className="text-muted text-sm">
        {race
          ? `Training for ${race.name} · Dashboard coming in Phase 2`
          : 'No active race — setup modal should be open'
        }
      </p>
    </div>
  )
}
