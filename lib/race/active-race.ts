import { cache } from 'react'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { races } from '@/lib/db/schema'
import { auth } from '@/lib/auth'

export const getActiveRace = cache(async () => {
  const session = await auth()
  if (!session?.user?.id) return null

  return db.query.races.findFirst({
    where: and(
      eq(races.userId, session.user.id),
      eq(races.status, 'active')
    ),
  })
})

export function getRacePaceSecPerKm(goalTimeMinutes: number, distanceKm: number): number {
  return Math.round((goalTimeMinutes * 60) / distanceKm)
}

export function getDaysToRace(raceDate: Date | string): number {
  const date = typeof raceDate === 'string' ? new Date(raceDate) : raceDate
  return Math.ceil((date.getTime() - Date.now()) / 86400000)
}
