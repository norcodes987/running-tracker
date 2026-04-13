import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getActiveRace, getDaysToRace } from '@/lib/race/active-race'
import { RaceSetupModal } from '@/components/race-setup/RaceSetupModal'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const activeRace = await getActiveRace()
  const needsSetup = !activeRace

  const daysToRace = activeRace
    ? getDaysToRace(activeRace.raceDate)
    : null

  return (
    <div className="min-h-screen bg-bg">
      {/* Slim header */}
      <div className="flex justify-between items-center px-4 py-2.5 border-b border-border">
        <span
          className="text-accent text-lg tracking-widest"
          style={{ fontFamily: 'var(--font-barlow)' }}
        >
          PERCY
        </span>
        {activeRace && daysToRace !== null && (
          <span
            className="text-xs text-muted"
            style={{ fontFamily: 'var(--font-dm-mono)' }}
          >
            <span className="text-text">{daysToRace}</span> days · {activeRace.name}
          </span>
        )}
      </div>

      {/* Sticky nav — stub, filled out in Phase 2 */}
      <nav className="sticky top-0 z-50 flex border-b border-border bg-bg">
        {['Dashboard', 'Workouts', 'Race', 'Profile'].map((tab) => (
          <div
            key={tab}
            className="flex-1 py-3 text-center text-xs uppercase tracking-widest text-muted"
          >
            {tab}
          </div>
        ))}
      </nav>

      <main className="max-w-md mx-auto">
        {children}
      </main>

      {/* Race Setup Modal — shows when no active race */}
      <RaceSetupModal open={needsSetup} />
    </div>
  )
}
