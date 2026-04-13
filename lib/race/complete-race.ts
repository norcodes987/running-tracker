import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { races, trainingSessions, planChanges } from '@/lib/db/schema'

type CompleteRaceOptions = {
  raceId:            string
  userId:            string
  actualTimeMinutes: number
  notes?:            string
  deleteSessions:    boolean  // false = "Keep data for now"
}

export async function completeRace(opts: CompleteRaceOptions): Promise<void> {
  const { raceId, userId, actualTimeMinutes, notes, deleteSessions } = opts

  await db.transaction(async (tx) => {
    if (deleteSessions) {
      // Delete plan changes first (FK dependency)
      await tx.delete(planChanges).where(
        and(eq(planChanges.raceId, raceId), eq(planChanges.userId, userId))
      )
      // Delete all training sessions
      await tx.delete(trainingSessions).where(
        and(eq(trainingSessions.raceId, raceId), eq(trainingSessions.userId, userId))
      )
    }

    // Mark race completed (row becomes the permanent result record)
    await tx
      .update(races)
      .set({ status: 'completed', actualTimeMinutes, notes, completedAt: new Date() })
      .where(and(eq(races.id, raceId), eq(races.userId, userId)))
  })
}
