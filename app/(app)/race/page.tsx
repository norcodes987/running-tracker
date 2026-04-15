// app/(app)/race/page.tsx
import { unstable_cacheLife as cacheLife } from 'next/cache'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getActiveRace } from '@/lib/race/active-race'
import { RaceInfoCard } from '@/components/race/RaceInfoCard'

export default async function RacePage() {
  'use cache'
  cacheLife('days')

  const session = await auth()
  if (!session?.user?.id) redirect('/login')

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
