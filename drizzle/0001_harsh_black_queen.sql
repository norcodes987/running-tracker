ALTER TABLE "user_profile" ADD COLUMN "strava_athlete_id" integer;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "strava_athlete_name" text;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "strava_webhook_subscription_id" integer;--> statement-breakpoint
ALTER TABLE "user_profile" ADD COLUMN "strava_last_sync_at" timestamp;