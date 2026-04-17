import {
  pgTable, text, integer, real,
  timestamp, date, jsonb, primaryKey,
} from 'drizzle-orm/pg-core'
import type { AdapterAccountType } from 'next-auth/adapters'

// ── Auth tables (NextAuth v5 DrizzleAdapter compatible) ──

export const users = pgTable('users', {
  id:            text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name:          text('name'),
  email:         text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image:         text('image'),
  passwordHash:  text('password_hash'),
  createdAt:     timestamp('created_at').defaultNow(),
})

export const accounts = pgTable('accounts', {
  userId:            text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type:              text('type').$type<AdapterAccountType>().notNull(),
  provider:          text('provider').notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  refresh_token:     text('refresh_token'),
  access_token:      text('access_token'),
  expires_at:        integer('expires_at'),
  token_type:        text('token_type'),
  scope:             text('scope'),
  id_token:          text('id_token'),
  session_state:     text('session_state'),
}, (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })])

export const sessionsAuth = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId:       text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expires:      timestamp('expires', { mode: 'date' }).notNull(),
})

export const verificationTokens = pgTable('verification_tokens', {
  identifier: text('identifier').notNull(),
  token:      text('token').notNull(),
  expires:    timestamp('expires', { mode: 'date' }).notNull(),
}, (t) => [primaryKey({ columns: [t.identifier, t.token] })])

// ── User physiological profile (persists across races) ──

export const userProfile = pgTable('user_profile', {
  id:                          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:                      text('user_id').notNull().references(() => users.id).unique(),
  maxHr:                       integer('max_hr'),
  age:                         integer('age'),
  thresholdPaceSecPerKm:       integer('threshold_pace_sec_per_km'),
  paceZones:                   jsonb('pace_zones'),
  hrZones:                     jsonb('hr_zones'),
  acwrBaseline:                real('acwr_baseline'),
  stravaAccessToken:           text('strava_access_token'),
  stravaRefreshToken:          text('strava_refresh_token'),
  stravaTokenExpiry:           timestamp('strava_token_expiry'),
  stravaAthleteId:             integer('strava_athlete_id'),
  stravaAthleteName:           text('strava_athlete_name'),
  stravaWebhookSubscriptionId: integer('strava_webhook_subscription_id'),
  stravaLastSyncAt:            timestamp('strava_last_sync_at'),
  updatedAt:                   timestamp('updated_at').defaultNow(),
})

// ── Races (one active at a time; completed rows = historical record) ──

export const races = pgTable('races', {
  id:                text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:            text('user_id').notNull().references(() => users.id),
  name:              text('name').notNull(),
  raceDate:          date('race_date').notNull(),
  location:          text('location'),
  distanceKm:        real('distance_km').notNull(),
  goalTimeMinutes:   real('goal_time_minutes').notNull(),
  trainingStartDate: date('training_start_date').notNull(),
  fitnessLevel:      text('fitness_level').notNull(), // 'beginner' | 'building' | 'ready'
  status:            text('status').notNull().default('active'), // 'active' | 'completed'
  actualTimeMinutes: real('actual_time_minutes'),
  notes:             text('notes'),
  completedAt:       timestamp('completed_at'),
  createdAt:         timestamp('created_at').defaultNow(),
})

// ── Training sessions (deleted on race completion) ──

export const trainingSessions = pgTable('training_sessions', {
  id:                 text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:             text('user_id').notNull().references(() => users.id),
  raceId:             text('race_id').notNull().references(() => races.id),
  date:               date('date').notNull(),
  type:               text('type').notNull(),
  distanceKm:         real('distance_km').notNull(),
  targetPaceSecPerKm: integer('target_pace_sec_per_km'),
  targetHrZone:       text('target_hr_zone'),
  status:             text('status').notNull().default('planned'),
  actualDistanceKm:   real('actual_distance_km'),
  actualPaceSecPerKm: integer('actual_pace_sec_per_km'),
  actualAvgHr:        integer('actual_avg_hr'),
  distanceScore:      integer('distance_score'),
  paceScore:          integer('pace_score'),
  qualityScore:       integer('quality_score'),
  stravaActivityId:   text('strava_activity_id'),
  notes:              text('notes'),
  splits:             jsonb('splits').$type<import('@/lib/types/splits').IntervalSplits>(),
  rescheduledFrom:    text('rescheduled_from'),
  createdAt:          timestamp('created_at').defaultNow(),
})

// ── Plan adaptation audit log (deleted on race completion) ──

export const planChanges = pgTable('plan_changes', {
  id:          text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId:      text('user_id').notNull().references(() => users.id),
  raceId:      text('race_id').notNull().references(() => races.id),
  triggeredBy: text('triggered_by').references(() => trainingSessions.id),
  optionUsed:  text('option_used'),
  changes:     jsonb('changes'),
  reasoning:   text('reasoning'),
  createdAt:   timestamp('created_at').defaultNow(),
})
