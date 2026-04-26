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
  // Anchor "today" to SGT (UTC+8) midnight so the countdown reflects the local calendar date
  const nowSGT = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const todaySGT = Date.UTC(nowSGT.getUTCFullYear(), nowSGT.getUTCMonth(), nowSGT.getUTCDate())
  return Math.ceil((date.getTime() - todaySGT) / 86400000)
}
