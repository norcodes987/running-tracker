# Percy the Pacer

Mobile-first PWA for half-marathon runners. Upload your training plan as a CSV, sync runs from Strava, and track completion and pace trends across session types.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript strict |
| Database | Neon DB (serverless Postgres) via Drizzle ORM |
| Auth | NextAuth v5 — Credentials + DB sessions |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Testing | Vitest (unit) + Playwright (E2E) |

## Getting Started

```bash
cp .env.example .env.local   # fill in DATABASE_URL, AUTH_SECRET, Strava keys
npm install
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Key Features

- **Race setup** — set race date and goal time
- **CSV plan upload** — upload your training plan once: `date, type, km, target_pace`
- **Strava sync** — OAuth2 connect, webhook push, manual "Sync now"
- **Binary completion** — a session is completed when actual distance ≥ planned distance
- **Manual override** — edit actual distance and pace on any session; overrides Strava data
- **Extra runs** — Strava runs with no matching planned session appear as "Extra Runs"
- **Dashboard** — weekly distance, completion rate by type, average pace by type (last 28 days)
- **Target paces** — set reference paces per type (easy, tempo, interval, long run, race pace) on your profile

## Environment Variables

```
DATABASE_URL
AUTH_SECRET
AUTH_URL
STRAVA_CLIENT_ID
STRAVA_CLIENT_SECRET
STRAVA_WEBHOOK_VERIFY_TOKEN
```

## Project Structure

```
app/
  (auth)/        ← login, register
  (app)/         ← dashboard, workouts, race, profile
  api/           ← REST routes (races, sessions, strava/*, profile)
lib/
  db/            ← Drizzle schema + client
  strava/        ← OAuth client, sync-activity
  training/      ← CSV parser, quality-score (retained), pace-calculator
components/
  race-setup/    ← 3-step setup modal
  workouts/      ← session cards, bonus runs list, CSV upload button
  profile/       ← Strava section, pace settings
  dashboard/     ← weekly distance, avg pace, completion rate widgets
```

## CSV Plan Format

```
date,type,km,target_pace
2026-04-16,tempo,7.0,5:18
2026-04-18,long_run,13.7,5:55
2026-04-19,easy,2.9,6:09
2026-04-21,interval,4.7,4:24
```

- `date`: `DD MMM` (e.g. `16 Apr`) or `YYYY-MM-DD`
- `type`: `easy`, `tempo`, `interval`, `long_run`, `race_pace`
- `km`: planned distance
- `target_pace`: `mm:ss` — displayed only, not used in calculations

Uploading a new CSV replaces all planned sessions. Sessions with actuals already recorded are not affected.

## Test

```bash
npm test                      # vitest unit tests
npx playwright test           # E2E (requires Chromium system deps)
```
