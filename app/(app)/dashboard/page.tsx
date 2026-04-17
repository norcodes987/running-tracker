// app/(app)/dashboard/page.tsx
import { auth }              from '@/lib/auth'
import { redirect }          from 'next/navigation'
import { getActiveRace }     from '@/lib/race/active-race'
import { getDashboardSessions } from '@/lib/dashboard/queries'
import {
  calcWeeklyDistance,
  calcAvgPaceByType,
  calcCompletionRateByType,
} from '@/lib/dashboard/metrics'
import { db }                from '@/lib/db'
import { userProfile }       from '@/lib/db/schema'
import { eq }                from 'drizzle-orm'
import { WeeklyDistanceWidget }  from '@/components/dashboard/WeeklyDistanceWidget'
import { AvgPaceWidget }         from '@/components/dashboard/AvgPaceWidget'
import { CompletionRateWidget }  from '@/components/dashboard/CompletionRateWidget'

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const race = await getActiveRace()
  if (!race) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted">No active race — setup modal should be open.</p>
      </div>
    )
  }

  const [sessions, profile] = await Promise.all([
    getDashboardSessions(session.user.id, race.id),
    db.query.userProfile.findFirst({ where: eq(userProfile.userId, session.user.id) }),
  ])

  const paceZones   = (profile?.paceZones ?? {}) as Record<string, number>
  const weeklyDist  = calcWeeklyDistance(sessions)
  const avgPace     = calcAvgPaceByType(sessions, paceZones)
  const completion  = calcCompletionRateByType(sessions)

  return (
    <div className="flex flex-col gap-3 p-4">
      <WeeklyDistanceWidget
        actualKm={weeklyDist.actualKm}
        targetKm={weeklyDist.targetKm}
      />
      <AvgPaceWidget rows={avgPace} />
      <CompletionRateWidget rows={completion} />
    </div>
  )
}
