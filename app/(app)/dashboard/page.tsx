// app/(app)/dashboard/page.tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getActiveRace, getRacePaceSecPerKm } from '@/lib/race/active-race'
import { getDashboardSessions } from '@/lib/dashboard/queries'
import {
  calcWeeklyDistance,
  calcEstimatedFinish,
  calcAvgPaceByType,
  calcCompletionRateByType,
} from '@/lib/dashboard/metrics'
import { calculateTrainingPaces } from '@/lib/training/pace-calculator'
import { WeeklyDistanceWidget }   from '@/components/dashboard/WeeklyDistanceWidget'
import { EstimatedFinishWidget }  from '@/components/dashboard/EstimatedFinishWidget'
import { AvgPaceWidget }          from '@/components/dashboard/AvgPaceWidget'
import { CompletionRateWidget }   from '@/components/dashboard/CompletionRateWidget'

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

  const paceSecPerKm = getRacePaceSecPerKm(race.goalTimeMinutes, race.distanceKm)
  const targetPaces  = calculateTrainingPaces(paceSecPerKm)
  const sessions     = await getDashboardSessions(session.user.id, race.id)

  const weeklyDist    = calcWeeklyDistance(sessions)
  const estFinish     = calcEstimatedFinish(sessions, race.distanceKm, race.goalTimeMinutes, targetPaces)
  const avgPace       = calcAvgPaceByType(sessions, targetPaces)
  const completionRate = calcCompletionRateByType(sessions)

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="grid grid-cols-2 gap-3">
        <WeeklyDistanceWidget
          actualKm={weeklyDist.actualKm}
          targetKm={weeklyDist.targetKm}
        />
        <EstimatedFinishWidget
          estMinutes={estFinish.estMinutes}
          deltaMinutes={estFinish.deltaMinutes}
          confidence={estFinish.confidence}
          goalTimeMinutes={race.goalTimeMinutes}
        />
      </div>
      <AvgPaceWidget rows={avgPace} />
      <CompletionRateWidget rows={completionRate} />
    </div>
  )
}
