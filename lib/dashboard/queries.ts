// lib/dashboard/queries.ts
import { eq, and } from 'drizzle-orm'
import { db } from '@/lib/db'
import { trainingSessions } from '@/lib/db/schema'
import type { DashboardSession } from './metrics'

export async function getDashboardSessions(
  userId: string,
  raceId: string,
): Promise<DashboardSession[]> {
  const rows = await db
    .select({
      id:                 trainingSessions.id,
      date:               trainingSessions.date,
      type:               trainingSessions.type,
      distanceKm:         trainingSessions.distanceKm,
      targetPaceSecPerKm: trainingSessions.targetPaceSecPerKm,
      status:             trainingSessions.status,
      actualDistanceKm:   trainingSessions.actualDistanceKm,
      actualPaceSecPerKm: trainingSessions.actualPaceSecPerKm,
    })
    .from(trainingSessions)
    .where(
      and(
        eq(trainingSessions.userId, userId),
        eq(trainingSessions.raceId, raceId),
      ),
    )
  return rows
}
