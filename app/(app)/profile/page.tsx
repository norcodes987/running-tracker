// app/(app)/profile/page.tsx
import { auth }          from '@/lib/auth'
import { redirect }      from 'next/navigation'
import { getActiveRace } from '@/lib/race/active-race'
import { db }            from '@/lib/db'
import { users, userProfile, trainingSessions } from '@/lib/db/schema'
import { eq, and }       from 'drizzle-orm'
import { GoalTimeForm }  from '@/components/profile/GoalTimeForm'
import { EndRaceSection } from '@/components/profile/EndRaceSection'
import { StravaSection } from '@/components/profile/StravaSection'
import { TrainingSummary } from '@/components/profile/TrainingSummary'
import { PaceSettings }  from '@/components/profile/PaceSettings'

export default async function ProfilePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const [user, profile, race] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    db.query.userProfile.findFirst({ where: eq(userProfile.userId, userId) }),
    getActiveRace(),
  ])

  let weeksCompleted = 0
  let totalKmLogged  = 0
  let sessionsHit    = 0
  let sessionsMissed = 0

  if (race) {
    const sessions = await db
      .select()
      .from(trainingSessions)
      .where(and(eq(trainingSessions.userId, userId), eq(trainingSessions.raceId, race.id)))

    const withActuals = sessions.filter(
      s => s.status !== 'planned' && s.actualDistanceKm !== null,
    )
    const weekSet = new Set(withActuals.map(s => {
      const d = new Date(s.date)
      d.setUTCDate(d.getUTCDate() - (d.getUTCDay() === 0 ? 6 : d.getUTCDay() - 1))
      return d.toISOString().slice(0, 10)
    }))
    weeksCompleted = weekSet.size
    totalKmLogged  = withActuals.reduce((sum, s) => sum + (s.actualDistanceKm ?? 0), 0)
    sessionsHit    = sessions.filter(s => s.status === 'completed').length
    sessionsMissed = sessions.filter(
      s => s.status === 'planned' && s.date < new Date().toISOString().slice(0, 10),
    ).length
  }

  const joinedDate = user?.createdAt
    ? new Date(user.createdAt).toLocaleDateString('en-GB', {
        day: 'numeric', month: 'long', year: 'numeric',
      })
    : '—'

  const paceZones = (profile?.paceZones ?? {}) as Record<string, number>

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="rounded-lg bg-surface p-4">
        <p className="text-[10px] uppercase tracking-widest text-muted">Account</p>
        <p className="mt-2 text-sm text-text">{user?.email}</p>
        <p className="text-xs text-muted">Joined {joinedDate}</p>
      </div>

      {race && <GoalTimeForm currentGoalTimeMinutes={race.goalTimeMinutes} />}

      <PaceSettings paceZones={paceZones} />

      <StravaSection
        isConnected={!!profile?.stravaAccessToken}
        athleteName={profile?.stravaAthleteName ?? null}
        lastSyncAt={profile?.stravaLastSyncAt ?? null}
      />

      <TrainingSummary
        weeksCompleted={weeksCompleted}
        totalKmLogged={totalKmLogged}
        sessionsHit={sessionsHit}
        sessionsMissed={sessionsMissed}
      />

      {race && <EndRaceSection raceId={race.id} raceName={race.name} />}
    </div>
  )
}
