# Percy the Pacer

Mobile-first PWA for half-marathon runners. Percy generates a personalised phase-based training plan, tracks session completion via Strava, and retroactively credits makeup runs when you do a missed session on a different day.

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript strict |
| Database | Neon DB (serverless Postgres) via Drizzle ORM |
| Auth | NextAuth v5 — Credentials + DB sessions |
| Styling | Tailwind CSS v4 + shadcn/ui |
| AI | Google Gemini API (`gemini-2.0-flash`) |
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

- **Race setup** — 3-step modal: race date/goal, Garmin FIT upload, plan preview
- **Training plan** — phase-based periodization (base → build → peak → taper)
- **Strava sync** — OAuth2 connect, webhook push, manual "Sync now"
- **Makeup matching** — missed a session? Run it on any free day within 7 days and Percy credits it automatically
- **Quality score** — distance + pace score → 0–100 ring per session
- **Profile** — HR zones, training summary, Strava connection status

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
  strava/        ← OAuth client, sync-activity (makeup matching)
  training/      ← periodization, quality-score, pace-calculator
components/
  race-setup/    ← 3-step setup modal
  workouts/      ← session cards
  profile/       ← Strava section, HR zones
```

## Test

```bash
npm test                      # vitest unit tests (68 tests)
npx playwright test           # E2E (requires Chromium system deps)
```

---

## Active Training Plan — test race

64 sessions · 16 Apr → 16 Jul 2026

| Date | Type | Km | Target Pace |
|---|---|---|---|
| 16 Apr | tempo | 7.0 | 5:18 /km |
| 18 Apr | long_run | 13.7 | 5:55 /km |
| 19 Apr | easy | 2.9 | 6:09 /km |
| 21 Apr | interval | 4.7 | 4:24 /km |
| 22 Apr | easy | 2.9 | 6:09 /km |
| 23 Apr | tempo | 7.0 | 5:18 /km |
| 25 Apr | long_run | 13.7 | 5:55 /km |
| 26 Apr | easy | 2.9 | 6:09 /km |
| 28 Apr | interval | 4.7 | 4:24 /km |
| 29 Apr | easy | 2.9 | 6:09 /km |
| 30 Apr | tempo | 7.0 | 5:18 /km |
| 2 May | long_run | 13.7 | 5:55 /km |
| 3 May | easy | 2.9 | 6:09 /km |
| 5 May | interval | 4.7 | 4:24 /km |
| 6 May | easy | 2.9 | 6:09 /km |
| 7 May | tempo | 7.0 | 5:18 /km |
| 9 May | long_run | 13.7 | 5:55 /km |
| 10 May | easy | 2.9 | 6:09 /km |
| 12 May | interval | 4.7 | 4:24 /km |
| 13 May | easy | 2.9 | 6:09 /km |
| 14 May | tempo | 7.0 | 5:18 /km |
| 16 May | long_run | 13.7 | 5:55 /km |
| 17 May | easy | 2.9 | 6:09 /km |
| 19 May | interval | 4.7 | 4:24 /km |
| 20 May | easy | 5.9 | 6:09 /km |
| 21 May | tempo | 7.0 | 5:18 /km |
| 23 May | long_run | 13.7 | 5:55 /km |
| 24 May | race_pace | 7.8 | 4:44 /km |
| 26 May | interval | 5.5 | 4:24 /km |
| 27 May | easy | 6.9 | 6:09 /km |
| 28 May | tempo | 8.3 | 5:18 /km |
| 30 May | long_run | 16.1 | 5:55 /km |
| 31 May | race_pace | 9.2 | 4:44 /km |
| 2 Jun | interval | 6.2 | 4:24 /km |
| 3 Jun | easy | 7.8 | 6:09 /km |
| 4 Jun | tempo | 9.4 | 5:18 /km |
| 6 Jun | long_run | 18.2 | 5:55 /km |
| 7 Jun | race_pace | 10.4 | 4:44 /km |
| 9 Jun | interval | 7.1 | 4:24 /km |
| 10 Jun | easy | 8.9 | 6:09 /km |
| 11 Jun | tempo | 10.6 | 5:18 /km |
| 13 Jun | long_run | 20.7 | 5:55 /km |
| 14 Jun | race_pace | 11.8 | 4:44 /km |
| 16 Jun | interval | 7.8 | 4:24 /km |
| 17 Jun | easy | 9.8 | 6:09 /km |
| 18 Jun | tempo | 11.7 | 5:18 /km |
| 20 Jun | long_run | 22.8 | 5:55 /km |
| 21 Jun | race_pace | 13.0 | 4:44 /km |
| 23 Jun | interval | 7.8 | 4:24 /km |
| 24 Jun | easy | 9.8 | 6:09 /km |
| 25 Jun | tempo | 11.7 | 5:18 /km |
| 27 Jun | long_run | 22.8 | 5:55 /km |
| 28 Jun | race_pace | 13.0 | 4:44 /km |
| 30 Jun | interval | 7.8 | 4:24 /km |
| 1 Jul | easy | 9.8 | 6:09 /km |
| 2 Jul | tempo | 11.7 | 5:18 /km |
| 4 Jul | long_run | 22.8 | 5:55 /km |
| 5 Jul | race_pace | 13.0 | 4:44 /km |
| 7 Jul | interval | 4.7 | 4:24 /km |
| 8 Jul | easy | 2.9 | 6:09 /km |
| 9 Jul | tempo | 7.0 | 5:18 /km |
| 11 Jul | long_run | 10.5 | 5:55 /km |
| 12 Jul | easy | 2.9 | 6:09 /km |
| 14 Jul | interval | 3.1 | 4:24 /km |
| 15 Jul | easy | 2.0 | 6:09 /km |
| 16 Jul | tempo | 4.7 | 5:18 /km |
