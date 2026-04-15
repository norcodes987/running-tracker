import { Suspense } from 'react';
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getActiveRace, getDaysToRace } from '@/lib/race/active-race';
import { RaceSetupModal } from '@/components/race-setup/RaceSetupModal';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className='min-h-screen bg-bg'>
      {/* 1. Static Header Shell */}
      <div className='flex justify-between items-center px-4 py-2.5 border-b border-border'>
        <span
          className='text-accent text-lg tracking-widest'
          style={{ fontFamily: 'var(--font-barlow)' }}
        >
          PERCY
        </span>
        <Suspense
          fallback={
            <div className='h-4 w-24 animate-pulse bg-muted/20 rounded' />
          }
        >
          <HeaderRaceInfo />
        </Suspense>
      </div>

      {/* 2. Static Nav Shell*/}
      <nav className='sticky top-0 z-50 flex border-b border-border bg-bg'>
        {['Dashboard', 'Workouts', 'Race', 'Profile'].map((tab) => (
          <div
            key={tab}
            className='flex-1 py-3 text-center text-xs uppercase tracking-widest text-muted'
          >
            {tab}
          </div>
        ))}
      </nav>

      <Suspense
        fallback={
          <div className='p-8 text-center text-xs text-muted'>Loading...</div>
        }
      >
        <AuthAndRaceGuard>
          <main className='max-w-md mx-auto'>{children}</main>
        </AuthAndRaceGuard>
      </Suspense>
    </div>
  );
}

/**
 * Handles Auth, Data Fetching, and the Setup Modal
 */
async function AuthAndRaceGuard({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const activeRace = await getActiveRace();
  const needsSetup = !activeRace;

  return (
    <>
      {children}
      <RaceSetupModal open={needsSetup} />
    </>
  );
}

/**
 * Handles the dynamic race info in the header
 */
async function HeaderRaceInfo() {
  const activeRace = await getActiveRace();
  const daysToRace = activeRace ? getDaysToRace(activeRace.raceDate) : null;

  if (!activeRace || daysToRace === null) return null;

  return (
    <span
      className='text-xs text-muted'
      style={{ fontFamily: 'var(--font-dm-mono)' }}
    >
      <span className='text-text'>{daysToRace}</span> days · {activeRace.name}
    </span>
  );
}
