import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getActiveRace, getDaysToRace } from '@/lib/race/active-race'
import { RaceSetupModal } from '@/components/race-setup/RaceSetupModal'
import { AppNav } from '@/components/nav/AppNav'

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

      <AppNav />

      <main className="max-w-md mx-auto">
        {children}
      </main>

      {/* Race Setup Modal — shows when no active race */}
      <RaceSetupModal open={needsSetup} />
    </div>
  )
}
