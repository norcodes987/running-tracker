// app/(app)/workouts/page.tsx
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getActiveRace } from '@/lib/race/active-race'
import { getSessionsByWeek } from '@/lib/sessions/queries'
import { WeekSection } from '@/components/workouts/WeekSection'

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

  const groups = await getSessionsByWeek(session.user.id, race.id, race.trainingStartDate)

  if (groups.length === 0) {
    return (
      <div className="p-4">
        <p className="text-sm text-muted">No sessions generated yet.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2 p-4">
      {groups.map(group => (
        <WeekSection
          key={group.weekNumber}
          group={group}
          defaultExpanded={group.isCurrentWeek}
        />
      ))}
    </div>
  )
}
