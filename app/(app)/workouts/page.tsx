// app/(app)/workouts/page.tsx
import { auth }              from '@/lib/auth'
import { redirect }          from 'next/navigation'
import { getActiveRace }     from '@/lib/race/active-race'
import { getSessionsByWeek, getBonusSessions } from '@/lib/sessions/queries'
import { WeekSection }       from '@/components/workouts/WeekSection'
import { BonusRunsList }     from '@/components/workouts/BonusRunsList'
import { PlanUploadButton }  from '@/components/workouts/PlanUploadButton'

export default async function WorkoutsPage() {
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

  const [groups, bonusSessions] = await Promise.all([
    getSessionsByWeek(session.user.id, race.id, race.trainingStartDate),
    getBonusSessions(session.user.id, race.id),
  ])

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-widest text-muted">Training Plan</p>
        <PlanUploadButton raceId={race.id} />
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-muted px-1">No sessions yet — upload a CSV plan to get started.</p>
      ) : (
        groups.map(group => (
          <WeekSection
            key={group.weekNumber}
            group={group}
            defaultExpanded={group.isCurrentWeek}
          />
        ))
      )}

      <BonusRunsList sessions={bonusSessions} />
    </div>
  )
}
