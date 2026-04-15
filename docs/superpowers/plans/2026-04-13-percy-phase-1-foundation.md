# Percy the Pacer — Implementation Plan (Phase 1: Foundation)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the foundation layer — project setup, database, auth, training logic, and race setup flow — producing a working app where users can register, configure a race, and have a full training plan generated and stored in Neon DB.

**Architecture:** Next.js 16 App Router with Neon DB (Drizzle ORM), NextAuth v5 Credentials provider (DB sessions via DrizzleAdapter), and a deterministic phase-based periodization algorithm. Auth pages live in the `(auth)` route group; protected routes in `(app)`. Route protection logic lives in `proxy.ts`, re-exported by `middleware.ts` for Next.js to pick up.

**Tech Stack:** Next.js 16.2, TypeScript strict, Drizzle ORM, @neondatabase/serverless, next-auth@beta, @auth/drizzle-adapter, bcryptjs, shadcn/ui, Tailwind CSS v4, Vitest, Playwright

> **Scope note:** This is Phase 1 of 4.
>
> - Phase 2: UI tabs (Dashboard, Workouts, Race, Profile)
> - Phase 3: Adaptive Plan Engine (Option A rules, Option B Gemini, Orchestrator)
> - Phase 4: Strava integration + PWA

---

## File Map

| File                                         | Purpose                                                       |
| -------------------------------------------- | ------------------------------------------------------------- |
| `package.json`                               | All runtime + dev dependencies                                |
| `next.config.ts`                             | Enable `dynamicIO` for `"use cache"`                          |
| `vitest.config.ts`                           | Vitest + jsdom for unit tests                                 |
| `playwright.config.ts`                       | Playwright E2E config                                         |
| `drizzle.config.ts`                          | Drizzle Kit migration config                                  |
| `app/layout.tsx`                             | Root layout — Google Fonts, PWA meta                          |
| `app/globals.css`                            | Tailwind v4 `@theme`, CSS vars, base resets                   |
| `lib/db/index.ts`                            | Drizzle client (Neon serverless)                              |
| `lib/db/schema.ts`                           | All table definitions                                         |
| `lib/auth.ts`                                | NextAuth v5 config (Credentials + DrizzleAdapter)             |
| `app/api/auth/[...nextauth]/route.ts`        | NextAuth route handlers                                       |
| `proxy.ts`                                   | Auth middleware logic                                         |
| `middleware.ts`                              | Re-exports proxy for Next.js edge runtime                     |
| `app/(auth)/layout.tsx`                      | Full-screen auth layout (no nav)                              |
| `app/(auth)/login/page.tsx`                  | Login form                                                    |
| `app/(auth)/register/page.tsx`               | Register form                                                 |
| `lib/race/active-race.ts`                    | `getActiveRace()`, `getRacePaceSecPerKm()`, `getDaysToRace()` |
| `lib/race/complete-race.ts`                  | `completeRace()` transaction                                  |
| `lib/training/pace-calculator.ts`            | `calculateTrainingPaces()`                                    |
| `lib/training/quality-score.ts`              | `calculateQualityScore()`                                     |
| `lib/training/periodization.ts`              | `generatePlan()`                                              |
| `lib/training/garmin-parser.ts`              | `parseGarminExport()`                                         |
| `app/api/races/route.ts`                     | POST — create race + active-race constraint                   |
| `components/race-setup/RaceSetupModal.tsx`   | 3-step undismissable Dialog                                   |
| `components/race-setup/Step1RaceDetails.tsx` | Step 1 fields                                                 |
| `components/race-setup/Step2GoalFitness.tsx` | Step 2 fields                                                 |
| `components/race-setup/Step3PhysioData.tsx`  | Step 3 + Garmin upload                                        |
| `app/(app)/layout.tsx`                       | App shell: slim header + nav stub                             |
| `app/(app)/dashboard/page.tsx`               | Dashboard stub (landing after setup)                          |
| `__tests__/training/pace-calculator.test.ts` | Unit tests                                                    |
| `__tests__/training/quality-score.test.ts`   | Unit tests                                                    |
| `__tests__/training/periodization.test.ts`   | Unit tests                                                    |
| `__tests__/training/garmin-parser.test.ts`   | Unit tests                                                    |
| `e2e/auth.spec.ts`                           | Playwright — register + login                                 |
| `e2e/race-setup.spec.ts`                     | Playwright — 3-step setup + redirect                          |

---

## Task 1: Install dependencies

**Files:**

- Modify: `package.json`

- [ ] **Step 1: Install runtime dependencies**

```bash
cd /workspace/running-tracker
npm install \
  @neondatabase/serverless \
  drizzle-orm \
  next-auth@beta \
  @auth/drizzle-adapter \
  bcryptjs \
  swr \
  zod \
  react-hook-form \
  @hookform/resolvers \
  date-fns \
  @google/generative-ai \
  lucide-react \
  class-variance-authority \
  clsx \
  tailwind-merge
```

- [ ] **Step 2: Install dev dependencies**

```bash
npm install -D \
  drizzle-kit \
  @types/bcryptjs \
  @types/node \
  vitest \
  @vitejs/plugin-react \
  @testing-library/react \
  @testing-library/jest-dom \
  jsdom \
  @playwright/test \
  dotenv-cli
```

- [ ] **Step 3: Install Playwright browsers**

```bash
npx playwright install chromium
```

Expected: Downloads Chromium browser binary.

- [ ] ***

```bash
npx shadcn@latest init
```

When prompted:

- Style: Default
- Base color: Neutral
- CSS variables: Yes

This creates `components/ui/`, `lib/utils.ts`, and updates `app/globals.css`.

- [ ] **Step 5: Add required shadcn components**

```bash
npx shadcn@latest add button input label form dialog select alert tabs card
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: install dependencies and init shadcn"
```

---

## Task 2: Configure vitest, Playwright, and next.config

**Files:**

- Create: `vitest.config.ts`
- Create: `playwright.config.ts`
- Modify: `next.config.ts`

- [ ] **Step 1: Create vitest config**

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

- [ ] **Step 2: Create vitest setup file**

```ts
// vitest.setup.ts
import '@testing-library/jest-dom';
```

- [ ] **Step 3: Create Playwright config**

```ts
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120000,
  },
});
```

- [ ] **Step 4: Update next.config.ts**

```ts
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  experimental: {
    dynamicIO: true, // enables "use cache" directive
  },
};

export default nextConfig;
```

- [ ] **Step 5: Add test scripts to package.json**

Edit `package.json` scripts section — add:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: configure vitest, playwright, next.config"
```

---

## Task 3: Environment variables

**Files:**

- Create: `.env.local` (not committed — already gitignored by Next.js)
- Create: `.env.example`

- [ ] **Step 1: Create .env.local with required variables**

Create `/workspace/running-tracker/.env.local`:

```bash
# Neon DB — get from console.neon.tech
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"

# NextAuth — generate with: openssl rand -base64 32
AUTH_SECRET="your-secret-here"

# Google Gemini — get from aistudio.google.com
GEMINI_API_KEY="your-gemini-key"

# Strava OAuth — get from strava.com/settings/api
STRAVA_CLIENT_ID="your-strava-client-id"
STRAVA_CLIENT_SECRET="your-strava-client-secret"
STRAVA_WEBHOOK_VERIFY_TOKEN="your-random-token"

# App URL
NEXTAUTH_URL="http://localhost:3000"
```

- [ ] **Step 2: Create .env.example**

```bash
# .env.example
DATABASE_URL=""
AUTH_SECRET=""
GEMINI_API_KEY=""
STRAVA_CLIENT_ID=""
STRAVA_CLIENT_SECRET=""
STRAVA_WEBHOOK_VERIFY_TOKEN=""
NEXTAUTH_URL="http://localhost:3000"
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "chore: add .env.example"
```

---

## Task 4: Global styles and fonts

**Files:**

- Modify: `app/layout.tsx`
- Modify: `app/globals.css`

- [ ] **Step 1: Update root layout with fonts and meta**

```tsx
// app/layout.tsx
import type { Metadata } from 'next';
import { Barlow_Condensed, DM_Mono, Instrument_Sans } from 'next/font/google';
import './globals.css';

const barlowCondensed = Barlow_Condensed({
  weight: ['700'],
  subsets: ['latin'],
  variable: '--font-barlow',
});

const dmMono = DM_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-dm-mono',
});

const instrumentSans = Instrument_Sans({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-instrument',
});

export const metadata: Metadata = {
  title: 'Percy — Race Training',
  description: 'Train smarter. Race faster.',
  manifest: '/manifest.json',
  themeColor: '#080808',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang='en'
      className={`${barlowCondensed.variable} ${dmMono.variable} ${instrumentSans.variable}`}
    >
      <body className='bg-bg text-text antialiased'>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Update globals.css with Tailwind v4 theme and CSS vars**

Replace the entire contents of `app/globals.css`:

```css
@import 'tailwindcss';

@theme {
  --color-bg: #080808;
  --color-surface: #111111;
  --color-border: #1e1e1e;
  --color-accent: #c8ff00;
  --color-auth-accent: #f5c400;
  --color-danger: #ff4444;
  --color-warning: #ff9500;
  --color-text: #f5f5f5;
  --color-muted: #666666;

  --font-display: var(--font-barlow), ui-sans-serif;
  --font-mono: var(--font-dm-mono), ui-monospace;
  --font-sans: var(--font-instrument), ui-sans-serif;

  --radius: 4px;
}

@layer base {
  * {
    box-sizing: border-box;
  }

  body {
    background-color: var(--color-bg);
    color: var(--color-text);
    font-family: var(--font-sans);
    font-size: 14px;
  }

  /* shadcn CSS variable overrides for dark theme */
  :root {
    --background: 0 0% 3%;
    --foreground: 0 0% 96%;
    --card: 0 0% 7%;
    --card-foreground: 0 0% 96%;
    --popover: 0 0% 7%;
    --popover-foreground: 0 0% 96%;
    --primary: 75 100% 50%;
    --primary-foreground: 0 0% 0%;
    --secondary: 0 0% 12%;
    --secondary-foreground: 0 0% 96%;
    --muted: 0 0% 12%;
    --muted-foreground: 0 0% 40%;
    --accent: 0 0% 12%;
    --accent-foreground: 0 0% 96%;
    --destructive: 0 72% 51%;
    --destructive-foreground: 0 0% 96%;
    --border: 0 0% 12%;
    --input: 0 0% 12%;
    --ring: 75 100% 50%;
    --radius: 0.25rem;
  }
}
```

- [ ] **Step 3: Verify dev server starts without errors**

```bash
npm run dev
```

Expected: Server starts on http://localhost:3000, no TypeScript or CSS errors.

- [ ] **Step 4: Commit**

```bash
git add app/layout.tsx app/globals.css
git commit -m "style: configure Tailwind v4 theme and Google Fonts"
```

---

## Task 5: Database schema and Drizzle client

**Files:**

- Create: `lib/db/index.ts`
- Create: `lib/db/schema.ts`
- Create: `drizzle.config.ts`

- [ ] **Step 1: Create Drizzle client**

```ts
// lib/db/index.ts
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

const sql = neon(process.env.DATABASE_URL!);

export const db = drizzle(sql, { schema });
```

- [ ] **Step 2: Create schema**

```ts
// lib/db/schema.ts
import {
  pgTable,
  text,
  integer,
  real,
  timestamp,
  date,
  jsonb,
  primaryKey,
} from 'drizzle-orm/pg-core';
import type { AdapterAccountType } from 'next-auth/adapters';

// ── Auth tables (NextAuth v5 DrizzleAdapter compatible) ──

export const users = pgTable('users', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { mode: 'date' }),
  image: text('image'),
  passwordHash: text('password_hash'),
  createdAt: timestamp('created_at').defaultNow(),
});

export const accounts = pgTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessionsAuth = pgTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { mode: 'date' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// ── User physiological profile (persists across races) ──

export const userProfile = pgTable('user_profile', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id)
    .unique(),
  maxHr: integer('max_hr'),
  age: integer('age'),
  thresholdPaceSecPerKm: integer('threshold_pace_sec_per_km'),
  paceZones: jsonb('pace_zones'),
  hrZones: jsonb('hr_zones'),
  acwrBaseline: real('acwr_baseline'),
  stravaAccessToken: text('strava_access_token'),
  stravaRefreshToken: text('strava_refresh_token'),
  stravaTokenExpiry: timestamp('strava_token_expiry'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// ── Races (one active at a time; completed rows = historical record) ──

export const races = pgTable('races', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  name: text('name').notNull(),
  raceDate: date('race_date').notNull(),
  location: text('location'),
  distanceKm: real('distance_km').notNull(),
  goalTimeMinutes: real('goal_time_minutes').notNull(),
  trainingStartDate: date('training_start_date').notNull(),
  fitnessLevel: text('fitness_level').notNull(), // 'beginner' | 'building' | 'ready'
  status: text('status').notNull().default('active'), // 'active' | 'completed'
  actualTimeMinutes: real('actual_time_minutes'),
  notes: text('notes'),
  completedAt: timestamp('completed_at'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Training sessions (deleted on race completion) ──

export const trainingSessions = pgTable('training_sessions', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  raceId: text('race_id')
    .notNull()
    .references(() => races.id),
  date: date('date').notNull(),
  type: text('type').notNull(),
  distanceKm: real('distance_km').notNull(),
  targetPaceSecPerKm: integer('target_pace_sec_per_km'),
  targetHrZone: text('target_hr_zone'),
  status: text('status').notNull().default('planned'),
  actualDistanceKm: real('actual_distance_km'),
  actualPaceSecPerKm: integer('actual_pace_sec_per_km'),
  actualAvgHr: integer('actual_avg_hr'),
  distanceScore: integer('distance_score'),
  paceScore: integer('pace_score'),
  qualityScore: integer('quality_score'),
  stravaActivityId: text('strava_activity_id'),
  notes: text('notes'),
  rescheduledFrom: text('rescheduled_from'),
  createdAt: timestamp('created_at').defaultNow(),
});

// ── Plan adaptation audit log (deleted on race completion) ──

export const planChanges = pgTable('plan_changes', {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id')
    .notNull()
    .references(() => users.id),
  raceId: text('race_id')
    .notNull()
    .references(() => races.id),
  triggeredBy: text('triggered_by').references(() => trainingSessions.id),
  optionUsed: text('option_used'),
  changes: jsonb('changes'),
  reasoning: text('reasoning'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

- [ ] **Step 3: Create drizzle.config.ts**

```ts
// drizzle.config.ts
import type { Config } from 'drizzle-kit';

export default {
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
} satisfies Config;
```

- [ ] **Step 4: Push schema to Neon DB**

```bash
npx dotenv-cli -e .env.local -- npm run db:push
```

Expected output: All tables created successfully. If prompted to confirm destructive changes, type `y`.

- [ ] **Step 5: Commit**

```bash
git add lib/db/ drizzle.config.ts
git commit -m "feat: add database schema and Drizzle client"
```

---

## Task 6: NextAuth v5 configuration

**Files:**

- Create: `lib/auth.ts`
- Create: `app/api/auth/[...nextauth]/route.ts`

- [ ] **Step 1: Create NextAuth config**

```ts
// lib/auth.ts
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import {
  users,
  sessionsAuth,
  accounts,
  verificationTokens,
} from '@/lib/db/schema';

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessionsAuth,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'database' },
  pages: {
    signIn: '/login',
    error: '/login',
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      authorize: async (credentials) => {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.query.users.findFirst({
          where: eq(users.email, credentials.email as string),
        });

        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.passwordHash,
        );

        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  callbacks: {
    session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
      }
      return session;
    },
  },
});
```

- [ ] **Step 2: Create NextAuth route handler**

```ts
// app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/lib/auth';
export const { GET, POST } = handlers;
```

- [ ] **Step 3: Extend NextAuth session type**

Create `types/next-auth.d.ts`:

```ts
// types/next-auth.d.ts
import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
    };
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add lib/auth.ts app/api/auth types/
git commit -m "feat: configure NextAuth v5 Credentials + DrizzleAdapter"
```

---

## Task 7: Route protection with proxy.ts

**Files:**

- Create: `proxy.ts`
- Create: `middleware.ts`

- [ ] **Step 1: Create proxy.ts with auth logic**

```ts
// proxy.ts
import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const session = await auth();

  const { pathname } = request.nextUrl;
  const isAuthRoute =
    pathname.startsWith('/login') || pathname.startsWith('/register');
  const isProtected = !isAuthRoute;

  if (!session && isProtected) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  if (session && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js).*)',
  ],
};
```

- [ ] **Step 2: Create middleware.ts that re-exports proxy**

```ts
// middleware.ts
export { proxy as middleware, config } from './proxy';
```

- [ ] **Step 3: Commit**

```bash
git add proxy.ts middleware.ts
git commit -m "feat: route protection via proxy.ts middleware"
```

---

## Task 8: Auth pages — login and register

**Files:**

- Create: `app/(auth)/layout.tsx`
- Create: `app/(auth)/login/page.tsx`
- Create: `app/(auth)/register/page.tsx`

- [ ] **Step 1: Create auth layout**

```tsx
// app/(auth)/layout.tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className='min-h-screen flex items-center justify-center bg-bg px-6'>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Create login page**

```tsx
// app/(auth)/login/page.tsx
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

const schema = z.object({
  email: z.string().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

type FormData = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setError(null);
    setLoading(true);
    const result = await signIn('credentials', {
      email: data.email,
      password: data.password,
      redirect: false,
    });
    setLoading(false);

    if (result?.error) {
      setError('Incorrect email or password');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className='w-full max-w-sm'>
      <div className='text-center mb-10'>
        <h1
          className='text-6xl leading-none tracking-widest mb-2'
          style={{ fontFamily: 'var(--font-barlow)', color: '#F5C400' }}
        >
          PERCY
        </h1>
        <p className='text-sm text-muted tracking-wide'>
          Train smarter. Race faster.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className='space-y-1.5'>
          <Label
            htmlFor='email'
            className='text-xs uppercase tracking-widest text-muted'
          >
            Email
          </Label>
          <Input
            id='email'
            type='email'
            placeholder='you@example.com'
            className='bg-surface border-border text-text placeholder:text-muted'
            {...register('email')}
          />
          {errors.email && (
            <p className='text-xs text-danger'>{errors.email.message}</p>
          )}
        </div>

        <div className='space-y-1.5'>
          <Label
            htmlFor='password'
            className='text-xs uppercase tracking-widest text-muted'
          >
            Password
          </Label>
          <Input
            id='password'
            type='password'
            placeholder='••••••••'
            className='bg-surface border-border text-text placeholder:text-muted'
            {...register('password')}
          />
          {errors.password && (
            <p className='text-xs text-danger'>{errors.password.message}</p>
          )}
        </div>

        <Button
          type='submit'
          disabled={loading}
          className='w-full text-black font-bold uppercase tracking-widest mt-2'
          style={{ background: '#F5C400' }}
        >
          {loading ? 'Logging in…' : 'Log in'}
        </Button>
      </form>

      <p className='text-center text-xs text-muted mt-6'>
        Don't have an account?{' '}
        <Link href='/register' style={{ color: '#F5C400' }}>
          Register
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Create register page**

```tsx
// app/(auth)/register/page.tsx
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

const schema = z
  .object({
    email: z.string().email('Enter a valid email'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type FormData = z.infer<typeof schema>;

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  async function onSubmit(data: FormData) {
    setError(null);
    setLoading(true);

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: data.email, password: data.password }),
    });

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? 'Registration failed');
      setLoading(false);
      return;
    }

    // Auto-login after register
    const result = await signIn('credentials', {
      email: data.email,
      password: data.password,
      redirect: false,
    });
    setLoading(false);

    if (result?.error) {
      setError('Account created but login failed — try logging in manually');
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className='w-full max-w-sm'>
      <div className='text-center mb-10'>
        <h1
          className='text-6xl leading-none tracking-widest mb-2'
          style={{ fontFamily: 'var(--font-barlow)', color: '#F5C400' }}
        >
          PERCY
        </h1>
        <p className='text-sm text-muted tracking-wide'>
          Train smarter. Race faster.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
        {error && (
          <Alert variant='destructive'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className='space-y-1.5'>
          <Label
            htmlFor='email'
            className='text-xs uppercase tracking-widest text-muted'
          >
            Email
          </Label>
          <Input
            id='email'
            type='email'
            placeholder='you@example.com'
            className='bg-surface border-border text-text placeholder:text-muted'
            {...register('email')}
          />
          {errors.email && (
            <p className='text-xs text-danger'>{errors.email.message}</p>
          )}
        </div>

        <div className='space-y-1.5'>
          <Label
            htmlFor='password'
            className='text-xs uppercase tracking-widest text-muted'
          >
            Password
          </Label>
          <Input
            id='password'
            type='password'
            placeholder='Min 8 characters'
            className='bg-surface border-border text-text placeholder:text-muted'
            {...register('password')}
          />
          {errors.password && (
            <p className='text-xs text-danger'>{errors.password.message}</p>
          )}
        </div>

        <div className='space-y-1.5'>
          <Label
            htmlFor='confirmPassword'
            className='text-xs uppercase tracking-widest text-muted'
          >
            Confirm password
          </Label>
          <Input
            id='confirmPassword'
            type='password'
            placeholder='Repeat password'
            className='bg-surface border-border text-text placeholder:text-muted'
            {...register('confirmPassword')}
          />
          {errors.confirmPassword && (
            <p className='text-xs text-danger'>
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        <Button
          type='submit'
          disabled={loading}
          className='w-full text-black font-bold uppercase tracking-widest mt-2'
          style={{ background: '#F5C400' }}
        >
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <p className='text-center text-xs text-muted mt-6'>
        Already have an account?{' '}
        <Link href='/login' style={{ color: '#F5C400' }}>
          Log in
        </Link>
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Create register API route**

```ts
// app/api/auth/register/route.ts
import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { users, userProfile } from '@/lib/db/schema';

export async function POST(request: Request) {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: 'Email and password required' },
      { status: 400 },
    );
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existing) {
    return NextResponse.json(
      { error: 'An account with this email already exists' },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const [user] = await db
    .insert(users)
    .values({ email, passwordHash })
    .returning();

  await db.insert(userProfile).values({ userId: user.id });

  return NextResponse.json({ ok: true }, { status: 201 });
}
```

- [ ] **Step 5: Commit**

```bash
git add app/\(auth\)/ app/api/auth/register/
git commit -m "feat: auth pages (login, register) and register API route"
```

---

## Task 9: Playwright E2E — auth flow

**Files:**

- Create: `e2e/auth.spec.ts`

- [ ] **Step 1: Write auth E2E tests**

```ts
// e2e/auth.spec.ts
import { test, expect } from '@playwright/test';

const TEST_EMAIL = `percy-test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';

test.describe('Authentication', () => {
  test('register creates account and redirects to dashboard', async ({
    page,
  }) => {
    await page.goto('/register');

    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[id="password"]', TEST_PASSWORD);
    await page.fill('input[id="confirmPassword"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Should redirect to /dashboard (race setup modal will show)
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
  });

  test('login with correct credentials succeeds', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
  });

  test('login with wrong password shows error', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', 'wrongpassword');
    await page.click('button[type="submit"]');

    await expect(page.locator('[role="alert"]')).toBeVisible();
    await expect(page).toHaveURL('/login');
  });

  test('unauthenticated user is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL('/login', { timeout: 5000 });
  });

  test('authenticated user on /login is redirected to /dashboard', async ({
    page,
  }) => {
    // Login first
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_EMAIL);
    await page.fill('input[type="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });

    // Navigate to /login — should redirect back
    await page.goto('/login');
    await expect(page).toHaveURL('/dashboard', { timeout: 5000 });
  });
});
```

- [ ] **Step 2: Run dev server and execute E2E tests**

In one terminal: `npm run dev`

In another terminal:

```bash
npx playwright test e2e/auth.spec.ts --reporter=line
```

Expected: All 5 tests pass. If "register" test fails with a DB error, verify `DATABASE_URL` in `.env.local`.

- [ ] **Step 3: Commit**

```bash
git add e2e/auth.spec.ts
git commit -m "test: Playwright E2E for auth flow"
```

---

## Task 10: Pace calculator

**Files:**

- Create: `lib/training/pace-calculator.ts`
- Create: `__tests__/training/pace-calculator.test.ts`

- [ ] **Step 1: Write failing tests first**

```ts
// __tests__/training/pace-calculator.test.ts
import { describe, it, expect } from 'vitest';
import {
  calculateTrainingPaces,
  formatPace,
  parsePaceInput,
  goalTimeToMinutes,
} from '@/lib/training/pace-calculator';

describe('calculateTrainingPaces', () => {
  it('derives all pace zones from race pace', () => {
    // 1:40:00 HM = 100 min / 21.0975 km = 284 sec/km race pace
    const racePace = Math.round((100 * 60) / 21.0975); // 284
    const paces = calculateTrainingPaces(racePace);

    expect(paces.race_pace).toBe(284);
    expect(paces.tempo).toBe(Math.round(284 * 1.12)); // 318
    expect(paces.long_run).toBe(Math.round(284 * 1.25)); // 355
    expect(paces.easy).toBe(Math.round(284 * 1.3)); // 369
    expect(paces.interval).toBe(Math.round(284 * 0.93)); // 264
    expect(paces.recovery).toBe(Math.round(284 * 1.45)); // 412
  });
});

describe('formatPace', () => {
  it('formats seconds per km as m:ss', () => {
    expect(formatPace(284)).toBe('4:44');
    expect(formatPace(369)).toBe('6:09');
    expect(formatPace(60)).toBe('1:00');
    expect(formatPace(305)).toBe('5:05');
  });
});

describe('parsePaceInput', () => {
  it('parses m:ss string to seconds', () => {
    expect(parsePaceInput('4:44')).toBe(284);
    expect(parsePaceInput('1:40:00')).toBe(6000); // treats as h:mm:ss
    expect(parsePaceInput('6:09')).toBe(369);
  });

  it('returns null for invalid input', () => {
    expect(parsePaceInput('abc')).toBeNull();
    expect(parsePaceInput('')).toBeNull();
  });
});

describe('goalTimeToMinutes', () => {
  it('parses h:mm:ss goal time string to minutes', () => {
    expect(goalTimeToMinutes('1:40:00')).toBe(100);
    expect(goalTimeToMinutes('2:00:00')).toBe(120);
    expect(goalTimeToMinutes('0:45:00')).toBe(45);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- pace-calculator
```

Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Implement pace-calculator.ts**

```ts
// lib/training/pace-calculator.ts
export type TrainingPaces = {
  race_pace: number;
  tempo: number;
  long_run: number;
  easy: number;
  interval: number;
  recovery: number;
};

export function calculateTrainingPaces(
  racePaceSecPerKm: number,
): TrainingPaces {
  return {
    race_pace: Math.round(racePaceSecPerKm),
    tempo: Math.round(racePaceSecPerKm * 1.12),
    long_run: Math.round(racePaceSecPerKm * 1.25),
    easy: Math.round(racePaceSecPerKm * 1.3),
    interval: Math.round(racePaceSecPerKm * 0.93),
    recovery: Math.round(racePaceSecPerKm * 1.45),
  };
}

/** Format seconds-per-km as "m:ss" */
export function formatPace(secPerKm: number): string {
  const m = Math.floor(secPerKm / 60);
  const s = secPerKm % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Parse "m:ss" or "h:mm:ss" pace string → seconds. Returns null if invalid. */
export function parsePaceInput(input: string): number | null {
  const parts = input.trim().split(':').map(Number);
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

/** Parse "h:mm:ss" goal time string → total minutes */
export function goalTimeToMinutes(input: string): number {
  const [h, m, s] = input.trim().split(':').map(Number);
  return h * 60 + m + (s ?? 0) / 60;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- pace-calculator
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/training/pace-calculator.ts __tests__/training/pace-calculator.test.ts
git commit -m "feat: pace calculator with unit tests"
```

---

## Task 11: Quality score calculator

**Files:**

- Create: `lib/training/quality-score.ts`
- Create: `__tests__/training/quality-score.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/training/quality-score.test.ts
import { describe, it, expect } from 'vitest';
import { calculateQualityScore } from '@/lib/training/quality-score';
import type { SessionType } from '@/lib/training/quality-score';

describe('calculateQualityScore — distance score', () => {
  it('returns 100 when actual >= planned', () => {
    const { distanceScore } = calculateQualityScore({
      type: 'easy',
      plannedKm: 10,
      actualKm: 10,
      targetPaceSecPerKm: 369,
      actualPaceSecPerKm: 369,
    });
    expect(distanceScore).toBe(100);
  });

  it('returns proportional score for 85-99% completion', () => {
    const { distanceScore } = calculateQualityScore({
      type: 'easy',
      plannedKm: 10,
      actualKm: 9.2,
      targetPaceSecPerKm: 369,
      actualPaceSecPerKm: 369,
    });
    expect(distanceScore).toBe(92);
  });

  it('returns 0 for less than 50% completion', () => {
    const { distanceScore } = calculateQualityScore({
      type: 'easy',
      plannedKm: 10,
      actualKm: 4,
      targetPaceSecPerKm: 369,
      actualPaceSecPerKm: 369,
    });
    expect(distanceScore).toBe(0);
  });
});

describe('calculateQualityScore — pace score', () => {
  it('returns 100 when pace exactly on target', () => {
    const { paceScore } = calculateQualityScore({
      type: 'tempo',
      plannedKm: 10,
      actualKm: 10,
      targetPaceSecPerKm: 318,
      actualPaceSecPerKm: 318,
    });
    expect(paceScore).toBe(100);
  });

  it('penalises tempo pace outside tolerance (±20s)', () => {
    const { paceScore } = calculateQualityScore({
      type: 'tempo',
      plannedKm: 10,
      actualKm: 10,
      targetPaceSecPerKm: 318,
      actualPaceSecPerKm: 348, // 30s slower
    });
    expect(paceScore).toBe(0); // (30/20)*100 = 150 → clamped to 0
  });

  it('easy run: penalises too fast (negative deviation)', () => {
    const { paceScore } = calculateQualityScore({
      type: 'easy',
      plannedKm: 8,
      actualKm: 8,
      targetPaceSecPerKm: 369,
      actualPaceSecPerKm: 300, // 69s faster
    });
    // deviation = 300 - 369 = -69, tolerance 45, score = clamp(100 - ((-69)/45)*100, 0, 100)
    // = clamp(100 + 153, 0, 100) — wait, inverted for easy: penalise if actual < target
    // For easy: pace_score penalises negative deviation (too fast)
    expect(paceScore).toBe(0); // too fast = fail
  });
});

describe('calculateQualityScore — final score', () => {
  it('averages distance and pace scores (0.5/0.5)', () => {
    const { qualityScore } = calculateQualityScore({
      type: 'long_run',
      plannedKm: 18,
      actualKm: 18,
      targetPaceSecPerKm: 355,
      actualPaceSecPerKm: 355,
    });
    expect(qualityScore).toBe(100); // 100 * 0.5 + 100 * 0.5
  });

  it('returns correct status for quality score', () => {
    const complete = calculateQualityScore({
      type: 'tempo',
      plannedKm: 10,
      actualKm: 10,
      targetPaceSecPerKm: 318,
      actualPaceSecPerKm: 318,
    });
    expect(complete.status).toBe('completed');

    const partial = calculateQualityScore({
      type: 'tempo',
      plannedKm: 10,
      actualKm: 7.5,
      targetPaceSecPerKm: 318,
      actualPaceSecPerKm: 318,
    });
    expect(partial.status).toBe('partial');

    const failed = calculateQualityScore({
      type: 'tempo',
      plannedKm: 10,
      actualKm: 4,
      targetPaceSecPerKm: 318,
      actualPaceSecPerKm: 380,
    });
    expect(failed.status).toBe('failed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- quality-score
```

Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Implement quality-score.ts**

```ts
// lib/training/quality-score.ts
export type SessionType =
  | 'long_run'
  | 'race_pace'
  | 'interval'
  | 'tempo'
  | 'easy'
  | 'rest';

export type QualityScoreResult = {
  distanceScore: number;
  paceScore: number;
  qualityScore: number;
  status: 'completed' | 'partial' | 'failed';
};

type QualityScoreInput = {
  type: SessionType;
  plannedKm: number;
  actualKm: number;
  targetPaceSecPerKm: number;
  actualPaceSecPerKm: number;
  /** For interval sessions: % of time in z5 (0–100). Replaces paceScore. */
  z5TimePct?: number;
};

const PACE_TOLERANCE: Partial<Record<SessionType, number>> = {
  easy: 45,
  long_run: 30,
  tempo: 20,
  race_pace: 15,
};

function calcDistanceScore(plannedKm: number, actualKm: number): number {
  const pct = (actualKm / plannedKm) * 100;
  if (pct >= 100) return 100;
  if (pct >= 50) return Math.round(pct);
  return 0;
}

function calcPaceScore(
  type: SessionType,
  targetPace: number,
  actualPace: number,
  z5TimePct?: number,
): number {
  if (type === 'interval') {
    if (z5TimePct === undefined) return 100; // no HR data — skip
    if (z5TimePct >= 60) return 100;
    if (z5TimePct >= 40) return Math.round(((z5TimePct - 40) / 20) * 100);
    return 0;
  }

  const tolerance = PACE_TOLERANCE[type];
  if (!tolerance) return 100; // rest — no pace score

  const deviation = actualPace - targetPace;

  if (type === 'easy') {
    // Penalise too fast (negative deviation). Too slow is fine.
    if (deviation >= 0) return 100;
    return Math.max(
      0,
      Math.round(100 - (Math.abs(deviation) / tolerance) * 100),
    );
  }

  return Math.max(0, Math.round(100 - (Math.abs(deviation) / tolerance) * 100));
}

export function calculateQualityScore(
  input: QualityScoreInput,
): QualityScoreResult {
  const distanceScore = calcDistanceScore(input.plannedKm, input.actualKm);
  const paceScore = calcPaceScore(
    input.type,
    input.targetPaceSecPerKm,
    input.actualPaceSecPerKm,
    input.z5TimePct,
  );
  const qualityScore = Math.round(distanceScore * 0.5 + paceScore * 0.5);

  const status =
    qualityScore >= 85
      ? 'completed'
      : qualityScore >= 60
        ? 'partial'
        : 'failed';

  return { distanceScore, paceScore, qualityScore, status };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- quality-score
```

Expected: All 8 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/training/quality-score.ts __tests__/training/quality-score.test.ts
git commit -m "feat: quality score calculator with unit tests"
```

---

## Task 12: Periodization algorithm

**Files:**

- Create: `lib/training/periodization.ts`
- Create: `__tests__/training/periodization.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/training/periodization.test.ts
import { describe, it, expect } from 'vitest';
import {
  generatePlan,
  getPeakWeekKm,
  getPhaseForWeek,
} from '@/lib/training/periodization';

describe('getPeakWeekKm', () => {
  it('returns correct km for fitness level and distance', () => {
    expect(getPeakWeekKm('beginner', 21.0975)).toBe(35);
    expect(getPeakWeekKm('building', 21.0975)).toBe(50);
    expect(getPeakWeekKm('ready', 21.0975)).toBe(65);
    expect(getPeakWeekKm('beginner', 42.195)).toBe(55);
    expect(getPeakWeekKm('building', 42.195)).toBe(75);
    expect(getPeakWeekKm('ready', 42.195)).toBe(95);
    expect(getPeakWeekKm('beginner', 5.0)).toBe(25);
    expect(getPeakWeekKm('building', 10.0)).toBe(42);
  });
});

describe('getPhaseForWeek', () => {
  it('returns correct phase for a 13-week plan', () => {
    // weeks counted from 1 (week 1 = first week of training, week 13 = race week)
    expect(getPhaseForWeek(13, 13)).toBe('taper'); // last 2 weeks
    expect(getPhaseForWeek(12, 13)).toBe('taper');
    expect(getPhaseForWeek(11, 13)).toBe('peak');
    expect(getPhaseForWeek(10, 13)).toBe('peak');
    expect(getPhaseForWeek(9, 13)).toBe('build');
    expect(getPhaseForWeek(5, 13)).toBe('build');
    expect(getPhaseForWeek(1, 13)).toBe('base');
    expect(getPhaseForWeek(4, 13)).toBe('base');
  });
});

describe('generatePlan', () => {
  const baseInput = {
    raceId: 'race-1',
    userId: 'user-1',
    raceDate: '2026-08-01',
    trainingStartDate: '2026-05-04', // ~13 weeks before
    distanceKm: 21.0975,
    goalTimeMinutes: 100,
    fitnessLevel: 'building' as const,
    maxHr: 185,
  };

  it('generates sessions for every week', () => {
    const sessions = generatePlan(baseInput);
    expect(sessions.length).toBeGreaterThan(0);
  });

  it('includes interval and tempo every week', () => {
    const sessions = generatePlan(baseInput);
    const weeks = new Map<string, string[]>();

    for (const s of sessions) {
      if (s.status === 'planned') {
        const week = new Date(s.date).toISOString().slice(0, 8); // year+week proxy
        const key = getISOWeek(new Date(s.date));
        if (!weeks.has(key)) weeks.set(key, []);
        weeks.get(key)!.push(s.type);
      }
    }

    for (const [, types] of weeks) {
      if (types.includes('rest')) {
        // skip pure rest weeks
        expect(types).toContain('interval');
        expect(types).toContain('tempo');
      }
    }
  });

  it('never schedules sessions after race date', () => {
    const sessions = generatePlan(baseInput);
    for (const s of sessions) {
      expect(new Date(s.date) <= new Date(baseInput.raceDate)).toBe(true);
    }
  });

  it('taper weeks have reduced volume', () => {
    const sessions = generatePlan(baseInput);
    const allDates = sessions.map((s) => s.date).sort();
    const raceDate = new Date(baseInput.raceDate);

    const taperSessions = sessions.filter((s) => {
      const d = new Date(s.date);
      const daysToRace = Math.ceil(
        (raceDate.getTime() - d.getTime()) / 86400000,
      );
      return daysToRace <= 14;
    });

    const peakSessions = sessions.filter((s) => {
      const d = new Date(s.date);
      const daysToRace = Math.ceil(
        (raceDate.getTime() - d.getTime()) / 86400000,
      );
      return daysToRace > 14 && daysToRace <= 28;
    });

    const taperKm = taperSessions.reduce((sum, s) => sum + s.distanceKm, 0);
    const peakKm = peakSessions.reduce((sum, s) => sum + s.distanceKm, 0);

    expect(taperKm).toBeLessThan(peakKm);
  });
});

function getISOWeek(date: Date): string {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getFullYear()}-W${weekNo}`;
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- periodization
```

Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Implement periodization.ts**

```ts
// lib/training/periodization.ts
import { calculateTrainingPaces } from './pace-calculator';
import type { SessionType } from './quality-score';

export type FitnessLevel = 'beginner' | 'building' | 'ready';
export type Phase = 'base' | 'build' | 'peak' | 'taper';

type PlanInput = {
  raceId: string;
  userId: string;
  raceDate: string; // YYYY-MM-DD
  trainingStartDate: string; // YYYY-MM-DD
  distanceKm: number;
  goalTimeMinutes: number;
  fitnessLevel: FitnessLevel;
  maxHr: number;
  /** If present, overrides fitness-level volume */
  garminChronicLoadKm?: number;
};

type PlannedSession = {
  raceId: string;
  userId: string;
  date: string;
  type: SessionType;
  distanceKm: number;
  targetPaceSecPerKm: number;
  targetHrZone: string;
  status: 'planned';
};

// Peak week volume table: [beginner, building, ready] per distance bracket
const PEAK_VOLUME: Array<{ maxKm: number; values: [number, number, number] }> =
  [
    { maxKm: 5, values: [25, 35, 45] },
    { maxKm: 10, values: [30, 42, 55] },
    { maxKm: 21.0975, values: [35, 50, 65] },
    { maxKm: 42.195, values: [55, 75, 95] },
    { maxKm: Infinity, values: [65, 90, 110] }, // ultra / custom > marathon
  ];

const FITNESS_INDEX: Record<FitnessLevel, 0 | 1 | 2> = {
  beginner: 0,
  building: 1,
  ready: 2,
};

export function getPeakWeekKm(
  fitnessLevel: FitnessLevel,
  distanceKm: number,
): number {
  const bracket =
    PEAK_VOLUME.find((b) => distanceKm <= b.maxKm) ??
    PEAK_VOLUME[PEAK_VOLUME.length - 1];
  return bracket.values[FITNESS_INDEX[fitnessLevel]];
}

// Phase boundaries (from end of plan, in weeks)
export function getPhaseForWeek(weekNumber: number, totalWeeks: number): Phase {
  const fromEnd = totalWeeks - weekNumber + 1;
  if (fromEnd <= 2) return 'taper';
  if (fromEnd <= 4) return 'peak';
  if (fromEnd <= 9) return 'build';
  return 'base';
}

// Monday of the ISO week containing `date`
function getMondayOf(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// HR zone label from intensity
function hrZoneForType(type: SessionType): string {
  const zones: Record<SessionType, string> = {
    rest: 'z1',
    easy: 'z2',
    long_run: 'z2',
    tempo: 'z3',
    race_pace: 'z4',
    interval: 'z5',
  };
  return zones[type];
}

// Session pattern: day offsets 0–6 = Mon–Sun
// Returns [dayOffset, sessionType]
const WEEK_PATTERN: Array<[number, SessionType]> = [
  [0, 'rest'],
  [1, 'interval'],
  [2, 'easy'],
  [3, 'tempo'],
  [4, 'rest'],
  [5, 'long_run'],
  [6, 'easy'], // overridden to race_pace in build/peak
];

// Volume multipliers by phase
function phaseVolumeMultiplier(phase: Phase, weekInBuild: number): number {
  if (phase === 'taper') return 0; // handled separately
  if (phase === 'peak') return 1.0;
  if (phase === 'build') return 0.6 + weekInBuild * 0.1;
  return 0.6; // base
}

// Distribute weekly km across session types
function distributeVolume(
  weeklyKm: number,
  pattern: Array<[number, SessionType]>,
): Map<SessionType, number> {
  // Proportions per session type within a week
  const proportions: Partial<Record<SessionType, number>> = {
    long_run: 0.35,
    race_pace: 0.2,
    tempo: 0.18,
    interval: 0.12,
    easy: 0.15, // split across 2 easy sessions (0.075 each if two)
  };

  const dist = new Map<SessionType, number>();
  const runSessions = pattern.filter(([, t]) => t !== 'rest');

  // Count easy sessions
  const easySessions = runSessions.filter(([, t]) => t === 'easy').length;

  for (const [, type] of runSessions) {
    if (type === 'rest') continue;
    let prop = proportions[type] ?? 0.1;
    if (type === 'easy') prop = (proportions.easy ?? 0.15) / easySessions;
    dist.set(type, Math.max(1, Math.round(weeklyKm * prop * 10) / 10));
  }

  return dist;
}

export function generatePlan(input: PlanInput): PlannedSession[] {
  const {
    raceId,
    userId,
    raceDate,
    trainingStartDate,
    distanceKm,
    goalTimeMinutes,
    fitnessLevel,
    maxHr,
    garminChronicLoadKm,
  } = input;

  const startDate = new Date(trainingStartDate);
  const endDate = new Date(raceDate);
  const startMonday = getMondayOf(startDate);

  // Count total weeks
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const totalWeeks = Math.ceil(
    (endDate.getTime() - startMonday.getTime()) / msPerWeek,
  );

  // Peak volume
  const basePeak = getPeakWeekKm(fitnessLevel, distanceKm);
  const peakKm = garminChronicLoadKm
    ? Math.round(garminChronicLoadKm * 1.2)
    : basePeak;

  // Taper long_run cap = 50% of race distance
  const taperLongRunCap = distanceKm * 0.5;

  // Paces
  const racePaceSecPerKm = Math.round((goalTimeMinutes * 60) / distanceKm);
  const paces = calculateTrainingPaces(racePaceSecPerKm);

  const sessions: PlannedSession[] = [];

  for (let week = 1; week <= totalWeeks; week++) {
    const phase = getPhaseForWeek(week, totalWeeks);
    const weekMonday = addDays(startMonday, (week - 1) * 7);

    // Build phase progression: week 1 of build = first week after base
    const buildStartWeek =
      Array.from({ length: totalWeeks }, (_, i) => i + 1).find(
        (w) => getPhaseForWeek(w, totalWeeks) === 'build',
      ) ?? 1;
    const weekInBuild = Math.max(0, week - buildStartWeek);

    // Weekly km
    let weeklyKm: number;
    if (phase === 'taper') {
      const taperWeek = week === totalWeeks ? 2 : 1; // 1 = first taper, 2 = race week
      weeklyKm =
        taperWeek === 1 ? Math.round(peakKm * 0.6) : Math.round(peakKm * 0.4);
    } else {
      weeklyKm = Math.round(peakKm * phaseVolumeMultiplier(phase, weekInBuild));
    }

    // Determine actual week pattern (Sun = race_pace in build/peak, else easy)
    const weekPattern: Array<[number, SessionType]> = WEEK_PATTERN.map(
      ([day, type]) => {
        if (day === 6 && (phase === 'build' || phase === 'peak')) {
          return [day, 'race_pace'];
        }
        return [day, type];
      },
    );

    const volDist = distributeVolume(weeklyKm, weekPattern);

    for (const [dayOffset, type] of weekPattern) {
      if (type === 'rest') continue;

      const sessionDate = addDays(weekMonday, dayOffset);

      // Don't schedule past race date
      if (sessionDate >= endDate) continue;
      // Don't schedule before training start
      if (sessionDate < startDate) continue;

      let km = volDist.get(type) ?? 5;

      // Cap taper long run
      if (phase === 'taper' && type === 'long_run') {
        km = Math.min(km, taperLongRunCap);
      }

      const paceKey = type as keyof typeof paces;
      const targetPace = paces[paceKey] ?? paces.easy;

      sessions.push({
        raceId,
        userId,
        date: toDateString(sessionDate),
        type,
        distanceKm: km,
        targetPaceSecPerKm: targetPace,
        targetHrZone: hrZoneForType(type),
        status: 'planned',
      });
    }
  }

  return sessions;
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- periodization
```

Expected: All 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/training/periodization.ts __tests__/training/periodization.test.ts
git commit -m "feat: phase-based periodization plan generator with unit tests"
```

---

## Task 13: Garmin data parser

**Files:**

- Create: `lib/training/garmin-parser.ts`
- Create: `__tests__/training/garmin-parser.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
// __tests__/training/garmin-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseGarminExport } from '@/lib/training/garmin-parser';

const csvSample = `Activity Type,Date,Distance,Calories,Time,Avg HR,Max HR,Avg Pace,Best Pace
Running,2026-04-01 07:30:00,10.05,650,01:00:30,145,178,6:01,4:52
Running,2026-03-29 08:00:00,8.0,510,00:48:00,138,165,6:00,5:10
Running,2026-03-25 06:45:00,21.1,1400,01:55:00,152,182,5:28,4:40
Cycling,2026-03-24 09:00:00,40.0,900,01:30:00,130,155,,`;

const jsonSample = JSON.stringify({
  activities: [
    {
      activityType: 'running',
      startTimeLocal: '2026-04-01 07:30:00',
      distance: 10050,
      averageHR: 145,
      maxHR: 178,
      duration: 3630,
    },
    {
      activityType: 'running',
      startTimeLocal: '2026-03-25 06:45:00',
      distance: 21100,
      averageHR: 152,
      maxHR: 182,
      duration: 6900,
    },
    {
      activityType: 'cycling',
      startTimeLocal: '2026-03-24 09:00:00',
      distance: 40000,
      averageHR: 130,
      maxHR: 155,
      duration: 5400,
    },
  ],
});

describe('parseGarminExport — CSV', () => {
  it('extracts max HR from running activities', () => {
    const result = parseGarminExport(csvSample, 'csv');
    expect(result.maxHr).toBe(182); // highest across runs
  });

  it('ignores non-running activities', () => {
    const result = parseGarminExport(csvSample, 'csv');
    // cycling maxHR (155) should not influence result
    expect(result.maxHr).toBe(182);
  });

  it('calculates 28-day chronic load baseline', () => {
    const result = parseGarminExport(csvSample, 'csv');
    expect(result.chronicLoadKm).toBeGreaterThan(0);
  });
});

describe('parseGarminExport — JSON', () => {
  it('extracts max HR from running activities', () => {
    const result = parseGarminExport(jsonSample, 'json');
    expect(result.maxHr).toBe(182);
  });

  it('ignores non-running activities', () => {
    const result = parseGarminExport(jsonSample, 'json');
    expect(result.maxHr).toBe(182);
  });
});

describe('parseGarminExport — fallback', () => {
  it('returns null maxHr for empty data', () => {
    const result = parseGarminExport('', 'csv');
    expect(result.maxHr).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- garmin-parser
```

Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Implement garmin-parser.ts**

```ts
// lib/training/garmin-parser.ts
export type GarminParseResult = {
  maxHr: number | null;
  chronicLoadKm: number; // 28-day total km for ACWR seeding
  paceBenchmarks: Partial<Record<string, number>>; // session type → avg sec/km
};

type RunActivity = {
  date: Date;
  distanceKm: number;
  maxHr: number;
  durationSec: number;
};

function parsePaceToSec(pace: string): number | null {
  if (!pace) return null;
  const [m, s] = pace.split(':').map(Number);
  if (isNaN(m) || isNaN(s)) return null;
  return m * 60 + s;
}

function parseCSV(content: string): RunActivity[] {
  const lines = content.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim());
  const idx = (name: string) => headers.findIndex((h) => h === name);

  const typeIdx = idx('Activity Type');
  const dateIdx = idx('Date');
  const distIdx = idx('Distance');
  const maxHrIdx = idx('Max HR');
  const timeIdx = idx('Time');

  const runs: RunActivity[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',');
    const type = cols[typeIdx]?.trim();
    if (!type || !type.toLowerCase().includes('running')) continue;

    const distKm = parseFloat(cols[distIdx]);
    const maxHr = parseInt(cols[maxHrIdx]);
    const dateStr = cols[dateIdx]?.trim();

    if (!dateStr || isNaN(distKm) || isNaN(maxHr)) continue;

    // Parse duration "HH:MM:SS"
    const timeParts = (cols[timeIdx] ?? '').trim().split(':').map(Number);
    const durationSec =
      timeParts.length === 3
        ? timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2]
        : 0;

    runs.push({
      date: new Date(dateStr),
      distanceKm: distKm,
      maxHr,
      durationSec,
    });
  }

  return runs;
}

function parseJSON(content: string): RunActivity[] {
  let data: { activities?: unknown[] };
  try {
    data = JSON.parse(content);
  } catch {
    return [];
  }

  const activities = data.activities ?? [];
  const runs: RunActivity[] = [];

  for (const act of activities) {
    const a = act as Record<string, unknown>;
    const type = String(a.activityType ?? '');
    if (!type.toLowerCase().includes('running')) continue;

    const distKm = (Number(a.distance) || 0) / 1000;
    const maxHr = Number(a.maxHR) || 0;
    const dateStr = String(a.startTimeLocal ?? '');
    const durationSec = Number(a.duration) || 0;

    if (!dateStr || distKm === 0) continue;

    runs.push({
      date: new Date(dateStr),
      distanceKm: distKm,
      maxHr,
      durationSec,
    });
  }

  return runs;
}

export function parseGarminExport(
  content: string,
  format: 'csv' | 'json',
): GarminParseResult {
  const runs = format === 'csv' ? parseCSV(content) : parseJSON(content);

  if (runs.length === 0) {
    return { maxHr: null, chronicLoadKm: 0, paceBenchmarks: {} };
  }

  // Max HR across all runs
  const maxHr = Math.max(...runs.map((r) => r.maxHr));

  // 28-day chronic load
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 28);
  const chronicLoadKm = runs
    .filter((r) => r.date >= cutoff)
    .reduce((sum, r) => sum + r.distanceKm, 0);

  return {
    maxHr: maxHr > 0 ? maxHr : null,
    chronicLoadKm,
    paceBenchmarks: {}, // future: classify runs by effort level
  };
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npm test -- garmin-parser
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/training/garmin-parser.ts __tests__/training/garmin-parser.test.ts
git commit -m "feat: Garmin CSV/JSON export parser with unit tests"
```

---

## Task 14: Active race helpers and complete-race transaction

**Files:**

- Create: `lib/race/active-race.ts`
- Create: `lib/race/complete-race.ts`

- [ ] **Step 1: Create active-race.ts**

```ts
// lib/race/active-race.ts
import { cache } from 'react';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { races } from '@/lib/db/schema';
import { auth } from '@/lib/auth';

export const getActiveRace = cache(async () => {
  const session = await auth();
  if (!session?.user?.id) return null;

  return db.query.races.findFirst({
    where: and(eq(races.userId, session.user.id), eq(races.status, 'active')),
  });
});

export function getRacePaceSecPerKm(
  goalTimeMinutes: number,
  distanceKm: number,
): number {
  return Math.round((goalTimeMinutes * 60) / distanceKm);
}

export function getDaysToRace(raceDate: Date | string): number {
  const date = typeof raceDate === 'string' ? new Date(raceDate) : raceDate;
  return Math.ceil((date.getTime() - Date.now()) / 86400000);
}
```

- [ ] **Step 2: Create complete-race.ts**

```ts
// lib/race/complete-race.ts
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { races, trainingSessions, planChanges } from '@/lib/db/schema';

type CompleteRaceOptions = {
  raceId: string;
  userId: string;
  actualTimeMinutes: number;
  notes?: string;
  deleteSessions: boolean; // false = "Keep data for now"
};

export async function completeRace(opts: CompleteRaceOptions): Promise<void> {
  const { raceId, userId, actualTimeMinutes, notes, deleteSessions } = opts;

  await db.transaction(async (tx) => {
    if (deleteSessions) {
      // Delete plan changes first (FK dependency)
      await tx
        .delete(planChanges)
        .where(
          and(eq(planChanges.raceId, raceId), eq(planChanges.userId, userId)),
        );
      // Delete all training sessions
      await tx
        .delete(trainingSessions)
        .where(
          and(
            eq(trainingSessions.raceId, raceId),
            eq(trainingSessions.userId, userId),
          ),
        );
    }

    // Mark race completed (row becomes the permanent result record)
    await tx
      .update(races)
      .set({
        status: 'completed',
        actualTimeMinutes,
        notes,
        completedAt: new Date(),
      })
      .where(and(eq(races.id, raceId), eq(races.userId, userId)));
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add lib/race/
git commit -m "feat: active-race helpers and complete-race transaction"
```

---

## Task 15: Race API route

**Files:**

- Create: `app/api/races/route.ts`

- [ ] **Step 1: Create race API route**

```ts
// app/api/races/route.ts
import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { races, trainingSessions, userProfile } from '@/lib/db/schema';
import { generatePlan } from '@/lib/training/periodization';
import { parseGarminExport } from '@/lib/training/garmin-parser';

const createRaceSchema = z.object({
  name: z.string().min(1),
  raceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  distanceKm: z.number().positive(),
  location: z.string().optional(),
  trainingStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  goalTimeMinutes: z.number().positive(),
  fitnessLevel: z.enum(['beginner', 'building', 'ready']),
  // Physiological data
  age: z.number().int().min(10).max(100).optional(),
  maxHr: z.number().int().min(100).max(250).optional(),
  garminData: z.string().optional(), // raw CSV or JSON string
  garminFormat: z.enum(['csv', 'json']).optional(),
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  const body = await request.json();
  const parsed = createRaceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  // Enforce one active race at a time
  const existingActive = await db.query.races.findFirst({
    where: and(eq(races.userId, userId), eq(races.status, 'active')),
  });

  if (existingActive) {
    return NextResponse.json(
      {
        error:
          'You already have an active race. Complete it before starting a new one.',
      },
      { status: 409 },
    );
  }

  // Parse Garmin data if provided
  let garminResult = null;
  if (data.garminData && data.garminFormat) {
    garminResult = parseGarminExport(data.garminData, data.garminFormat);
  }

  // Compute max HR
  const tanakaMhr = data.age ? Math.round(208 - 0.7 * data.age) : null;
  const maxHr = data.maxHr ?? garminResult?.maxHr ?? tanakaMhr ?? 180;

  // Update user profile
  await db
    .update(userProfile)
    .set({
      age: data.age,
      maxHr,
      hrZones: {
        z1: { max: Math.round(maxHr * 0.6) },
        z2: { min: Math.round(maxHr * 0.6), max: Math.round(maxHr * 0.7) },
        z3: { min: Math.round(maxHr * 0.7), max: Math.round(maxHr * 0.8) },
        z4: { min: Math.round(maxHr * 0.8), max: Math.round(maxHr * 0.9) },
        z5: { min: Math.round(maxHr * 0.9) },
      },
      acwrBaseline: garminResult?.chronicLoadKm
        ? garminResult.chronicLoadKm / 4 // weekly avg
        : null,
      updatedAt: new Date(),
    })
    .where(eq(userProfile.userId, userId));

  // Create race
  const [race] = await db
    .insert(races)
    .values({
      userId,
      name: data.name,
      raceDate: data.raceDate,
      location: data.location,
      distanceKm: data.distanceKm,
      goalTimeMinutes: data.goalTimeMinutes,
      trainingStartDate: data.trainingStartDate,
      fitnessLevel: data.fitnessLevel,
    })
    .returning();

  // Generate training plan
  const sessions = generatePlan({
    raceId: race.id,
    userId,
    raceDate: data.raceDate,
    trainingStartDate: data.trainingStartDate,
    distanceKm: data.distanceKm,
    goalTimeMinutes: data.goalTimeMinutes,
    fitnessLevel: data.fitnessLevel,
    maxHr,
    garminChronicLoadKm: garminResult?.chronicLoadKm,
  });

  // Insert all sessions in one batch
  if (sessions.length > 0) {
    await db.insert(trainingSessions).values(sessions);
  }

  return NextResponse.json(
    { raceId: race.id, sessionCount: sessions.length },
    { status: 201 },
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/races/
git commit -m "feat: race creation API with plan generation trigger"
```

---

## Task 16: Race Setup Modal components

**Files:**

- Create: `components/race-setup/Step1RaceDetails.tsx`
- Create: `components/race-setup/Step2GoalFitness.tsx`
- Create: `components/race-setup/Step3PhysioData.tsx`
- Create: `components/race-setup/RaceSetupModal.tsx`

- [ ] **Step 1: Create Step1RaceDetails**

```tsx
// components/race-setup/Step1RaceDetails.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const DISTANCES = [
  { label: '5K', value: 5 },
  { label: '10K', value: 10 },
  { label: 'Half Marathon', value: 21.0975 },
  { label: 'Marathon', value: 42.195 },
  { label: 'Custom', value: 0 },
];

const schema = z.object({
  name: z.string().min(1, 'Race name is required'),
  raceDate: z
    .string()
    .min(1, 'Race date is required')
    .refine((d) => new Date(d) > new Date(), 'Race date must be in the future'),
  distanceKm: z.number({ invalid_type_error: 'Select a distance' }).positive(),
  location: z.string().optional(),
  trainingStartDate: z.string().min(1, 'Training start date is required'),
});

export type Step1Data = z.infer<typeof schema>;

type Props = {
  onNext: (data: Step1Data) => void;
  defaultValues?: Partial<Step1Data>;
};

export function Step1RaceDetails({ onNext, defaultValues }: Props) {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().slice(0, 10);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Step1Data>({
    resolver: zodResolver(schema),
    defaultValues: { trainingStartDate: tomorrowStr, ...defaultValues },
  });

  const distanceKm = watch('distanceKm');

  return (
    <form onSubmit={handleSubmit(onNext)} className='space-y-4'>
      <div className='space-y-1.5'>
        <Label className='text-xs uppercase tracking-widest text-muted'>
          Race name
        </Label>
        <Input
          placeholder='e.g. ASICS Run Melbourne HM'
          className='bg-bg border-border text-text placeholder:text-muted'
          {...register('name')}
        />
        {errors.name && (
          <p className='text-xs text-danger'>{errors.name.message}</p>
        )}
      </div>

      <div className='grid grid-cols-2 gap-3'>
        <div className='space-y-1.5'>
          <Label className='text-xs uppercase tracking-widest text-muted'>
            Race date
          </Label>
          <Input
            type='date'
            className='bg-bg border-border text-text'
            {...register('raceDate')}
          />
          {errors.raceDate && (
            <p className='text-xs text-danger'>{errors.raceDate.message}</p>
          )}
        </div>
        <div className='space-y-1.5'>
          <Label className='text-xs uppercase tracking-widest text-muted'>
            Distance
          </Label>
          <Select onValueChange={(v) => setValue('distanceKm', parseFloat(v))}>
            <SelectTrigger className='bg-bg border-border text-text'>
              <SelectValue placeholder='Select' />
            </SelectTrigger>
            <SelectContent className='bg-surface border-border'>
              {DISTANCES.map((d) => (
                <SelectItem key={d.value} value={String(d.value)}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.distanceKm && (
            <p className='text-xs text-danger'>{errors.distanceKm.message}</p>
          )}
        </div>
      </div>

      {distanceKm === 0 && (
        <div className='space-y-1.5'>
          <Label className='text-xs uppercase tracking-widest text-muted'>
            Custom distance (km)
          </Label>
          <Input
            type='number'
            step='0.1'
            placeholder='e.g. 15.0'
            className='bg-bg border-border text-text'
            onChange={(e) => setValue('distanceKm', parseFloat(e.target.value))}
          />
        </div>
      )}

      <div className='space-y-1.5'>
        <Label className='text-xs uppercase tracking-widest text-muted'>
          Race location
        </Label>
        <Input
          placeholder='e.g. Melbourne, Australia'
          className='bg-bg border-border text-text placeholder:text-muted'
          {...register('location')}
        />
      </div>

      <div className='space-y-1.5'>
        <Label className='text-xs uppercase tracking-widest text-muted'>
          Training start date
        </Label>
        <Input
          type='date'
          className='bg-bg border-border text-text'
          {...register('trainingStartDate')}
        />
        {errors.trainingStartDate && (
          <p className='text-xs text-danger'>
            {errors.trainingStartDate.message}
          </p>
        )}
      </div>

      <div className='flex justify-end pt-2'>
        <Button
          type='submit'
          className='bg-accent text-black font-bold uppercase tracking-widest text-xs'
        >
          Next →
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create Step2GoalFitness**

```tsx
// components/race-setup/Step2GoalFitness.tsx
'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { goalTimeToMinutes } from '@/lib/training/pace-calculator';

const schema = z.object({
  goalTimeStr: z
    .string()
    .regex(/^\d{1,2}:\d{2}:\d{2}$/, 'Format: h:mm:ss, e.g. 1:40:00'),
  fitnessLevel: z.enum(['beginner', 'building', 'ready']),
});

export type Step2Data = {
  goalTimeMinutes: number;
  fitnessLevel: 'beginner' | 'building' | 'ready';
};

type Props = {
  onNext: (data: Step2Data) => void;
  onBack: () => void;
};

export function Step2GoalFitness({ onNext, onBack }: Props) {
  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
  });

  function onSubmit(data: z.infer<typeof schema>) {
    onNext({
      goalTimeMinutes: goalTimeToMinutes(data.goalTimeStr),
      fitnessLevel: data.fitnessLevel,
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className='space-y-4'>
      <div className='space-y-1.5'>
        <Label className='text-xs uppercase tracking-widest text-muted'>
          Goal finish time
        </Label>
        <Input
          placeholder='1:40:00'
          className='bg-bg border-border text-text placeholder:text-muted font-mono'
          {...register('goalTimeStr')}
        />
        {errors.goalTimeStr && (
          <p className='text-xs text-danger'>{errors.goalTimeStr.message}</p>
        )}
      </div>

      <div className='space-y-1.5'>
        <Label className='text-xs uppercase tracking-widest text-muted'>
          Current weekly mileage
        </Label>
        <Select
          onValueChange={(v) =>
            setValue('fitnessLevel', v as 'beginner' | 'building' | 'ready')
          }
        >
          <SelectTrigger className='bg-bg border-border text-text'>
            <SelectValue placeholder='Select fitness level' />
          </SelectTrigger>
          <SelectContent className='bg-surface border-border'>
            <SelectItem value='beginner'>
              Just starting — &lt;20km/week
            </SelectItem>
            <SelectItem value='building'>
              Building base — 20–40km/week
            </SelectItem>
            <SelectItem value='ready'>Race ready — 40km+/week</SelectItem>
          </SelectContent>
        </Select>
        {errors.fitnessLevel && (
          <p className='text-xs text-danger'>{errors.fitnessLevel.message}</p>
        )}
      </div>

      <div className='flex justify-between pt-2'>
        <Button
          type='button'
          variant='ghost'
          onClick={onBack}
          className='text-muted border-border text-xs'
        >
          ← Back
        </Button>
        <Button
          type='submit'
          className='bg-accent text-black font-bold uppercase tracking-widest text-xs'
        >
          Next →
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Create Step3PhysioData**

```tsx
// components/race-setup/Step3PhysioData.tsx
'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const schema = z.object({
  age: z
    .number({ invalid_type_error: 'Age is required' })
    .int()
    .min(10)
    .max(100),
  maxHr: z.number().int().min(100).max(250).optional(),
});

export type Step3Data = {
  age: number;
  maxHr?: number;
  garminData?: string;
  garminFormat?: 'csv' | 'json';
};

type Props = {
  onSubmit: (data: Step3Data) => void;
  onBack: () => void;
  loading: boolean;
};

export function Step3PhysioData({ onSubmit, onBack, loading }: Props) {
  const [garminFile, setGarminFile] = useState<File | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(schema),
  });

  async function onFormSubmit(formData: z.infer<typeof schema>) {
    let garminData: string | undefined;
    let garminFormat: 'csv' | 'json' | undefined;

    if (garminFile) {
      garminData = await garminFile.text();
      garminFormat = garminFile.name.endsWith('.json') ? 'json' : 'csv';
    }

    onSubmit({
      age: formData.age,
      maxHr: formData.maxHr,
      garminData,
      garminFormat,
    });
  }

  return (
    <form onSubmit={handleSubmit(onFormSubmit)} className='space-y-4'>
      <div className='grid grid-cols-2 gap-3'>
        <div className='space-y-1.5'>
          <Label className='text-xs uppercase tracking-widest text-muted'>
            Age
          </Label>
          <Input
            type='number'
            placeholder='32'
            className='bg-bg border-border text-text placeholder:text-muted'
            {...register('age', { valueAsNumber: true })}
          />
          {errors.age && (
            <p className='text-xs text-danger'>{errors.age.message}</p>
          )}
        </div>
        <div className='space-y-1.5'>
          <Label className='text-xs uppercase tracking-widest text-muted'>
            Max HR <span className='text-muted normal-case'>(optional)</span>
          </Label>
          <Input
            type='number'
            placeholder='auto'
            className='bg-bg border-border text-text placeholder:text-muted'
            {...register('maxHr', { valueAsNumber: true })}
          />
        </div>
      </div>

      <div className='space-y-1.5'>
        <Label className='text-xs uppercase tracking-widest text-muted'>
          Garmin export{' '}
          <span className='text-muted normal-case'>
            (optional — CSV or JSON)
          </span>
        </Label>
        <div
          className='border border-dashed border-border rounded p-5 text-center text-muted text-xs cursor-pointer hover:border-accent/50 transition-colors'
          onClick={() => document.getElementById('garmin-upload')?.click()}
        >
          {garminFile ? (
            <span className='text-accent'>{garminFile.name}</span>
          ) : (
            <>
              Drop file here or <span className='text-accent'>browse</span>
            </>
          )}
          <div className='mt-1 text-muted/60'>
            Extracts max HR · pace benchmarks · training load
          </div>
        </div>
        <input
          id='garmin-upload'
          type='file'
          accept='.csv,.json'
          className='hidden'
          onChange={(e) => setGarminFile(e.target.files?.[0] ?? null)}
        />
        {!garminFile && (
          <p className='text-xs text-muted'>
            No Garmin data? HR estimated from your age using the Tanaka formula.
          </p>
        )}
      </div>

      <div className='flex justify-between pt-2'>
        <Button
          type='button'
          variant='ghost'
          onClick={onBack}
          className='text-muted border-border text-xs'
        >
          ← Back
        </Button>
        <Button
          type='submit'
          disabled={loading}
          className='bg-accent text-black font-bold uppercase tracking-widest text-xs'
        >
          {loading ? 'Building plan…' : 'Build my plan →'}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 4: Create RaceSetupModal (orchestrator)**

```tsx
// components/race-setup/RaceSetupModal.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Step1RaceDetails, type Step1Data } from './Step1RaceDetails';
import { Step2GoalFitness, type Step2Data } from './Step2GoalFitness';
import { Step3PhysioData, type Step3Data } from './Step3PhysioData';
import { Alert, AlertDescription } from '@/components/ui/alert';

type Props = {
  open: boolean; // controlled externally — cannot be dismissed
};

type AllData = Step1Data & Step2Data & Step3Data;

export function RaceSetupModal({ open }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [step1, setStep1] = useState<Step1Data | null>(null);
  const [step2, setStep2] = useState<Step2Data | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStep3Submit(step3Data: Step3Data) {
    if (!step1 || !step2) return;
    setLoading(true);
    setError(null);

    const res = await fetch('/api/races', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: step1.name,
        raceDate: step1.raceDate,
        distanceKm: step1.distanceKm,
        location: step1.location,
        trainingStartDate: step1.trainingStartDate,
        goalTimeMinutes: step2.goalTimeMinutes,
        fitnessLevel: step2.fitnessLevel,
        age: step3Data.age,
        maxHr: step3Data.maxHr,
        garminData: step3Data.garminData,
        garminFormat: step3Data.garminFormat,
      }),
    });

    setLoading(false);

    if (!res.ok) {
      const body = await res.json();
      setError(body.error ?? 'Failed to create race. Please try again.');
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className='bg-surface border-border max-w-md w-full'
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          {/* Step indicator */}
          <div className='flex items-center gap-0 mb-2'>
            {[1, 2, 3].map((s, i) => (
              <div key={s} className='flex items-center flex-1'>
                <div
                  className={`
                  w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono flex-shrink-0
                  ${s < step ? 'bg-accent text-black' : ''}
                  ${s === step ? 'border-2 border-accent text-accent' : ''}
                  ${s > step ? 'border-2 border-border text-muted' : ''}
                `}
                >
                  {s < step ? '✓' : s}
                </div>
                {i < 2 && (
                  <div
                    className={`flex-1 h-px mx-1 ${s < step ? 'bg-accent/40' : 'bg-border'}`}
                  />
                )}
              </div>
            ))}
          </div>

          <DialogTitle className='font-display text-2xl tracking-wide'>
            {step === 1 && 'Your Race'}
            {step === 2 && 'Goal & Fitness'}
            {step === 3 && 'Physiological Data'}
          </DialogTitle>
          <p className='text-xs text-muted'>
            {step === 1 && "Tell us about the race you're training for"}
            {step === 2 && "We'll build your plan around these"}
            {step === 3 && 'Personalises your HR zones and target paces'}
          </p>
        </DialogHeader>

        {error && (
          <Alert variant='destructive' className='mt-2'>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === 1 && (
          <Step1RaceDetails
            onNext={(data) => {
              setStep1(data);
              setStep(2);
            }}
          />
        )}
        {step === 2 && (
          <Step2GoalFitness
            onNext={(data) => {
              setStep2(data);
              setStep(3);
            }}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && (
          <Step3PhysioData
            onSubmit={handleStep3Submit}
            onBack={() => setStep(2)}
            loading={loading}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add components/race-setup/
git commit -m "feat: 3-step Race Setup Modal components"
```

---

## Task 17: App shell layout and dashboard stub

**Files:**

- Create: `app/(app)/layout.tsx`
- Create: `app/(app)/dashboard/page.tsx`
- Modify: `app/layout.tsx` (add SessionProvider)

- [ ] **Step 1: Add SessionProvider to root layout**

```tsx
// app/layout.tsx
import type { Metadata } from 'next';
import { Barlow_Condensed, DM_Mono, Instrument_Sans } from 'next/font/google';
import { SessionProvider } from 'next-auth/react';
import './globals.css';

const barlowCondensed = Barlow_Condensed({
  weight: ['700'],
  subsets: ['latin'],
  variable: '--font-barlow',
});
const dmMono = DM_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-dm-mono',
});
const instrumentSans = Instrument_Sans({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--font-instrument',
});

export const metadata: Metadata = {
  title: 'Percy — Race Training',
  description: 'Train smarter. Race faster.',
  manifest: '/manifest.json',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang='en'
      className={`${barlowCondensed.variable} ${dmMono.variable} ${instrumentSans.variable}`}
    >
      <body className='bg-bg text-text antialiased'>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Create app shell layout**

```tsx
// app/(app)/layout.tsx
import { auth } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { getActiveRace, getDaysToRace } from '@/lib/race/active-race';
import { RaceSetupModal } from '@/components/race-setup/RaceSetupModal';

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect('/login');

  const activeRace = await getActiveRace();
  const needsSetup = !activeRace;

  const daysToRace = activeRace ? getDaysToRace(activeRace.raceDate) : null;

  return (
    <div className='min-h-screen bg-bg'>
      {/* Slim header */}
      <div className='flex justify-between items-center px-4 py-2.5 border-b border-border'>
        <span
          className='text-accent text-lg tracking-widest'
          style={{ fontFamily: 'var(--font-barlow)' }}
        >
          PERCY
        </span>
        {activeRace && daysToRace !== null && (
          <span
            className='text-xs text-muted'
            style={{ fontFamily: 'var(--font-dm-mono)' }}
          >
            <span className='text-text'>{daysToRace}</span> days ·{' '}
            {activeRace.name}
          </span>
        )}
      </div>

      {/* Sticky nav — stub, filled out in Phase 2 */}
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

      <main className='max-w-md mx-auto'>{children}</main>

      {/* Race Setup Modal — shows when no active race */}
      <RaceSetupModal open={needsSetup} />
    </div>
  );
}
```

- [ ] **Step 3: Create dashboard stub**

```tsx
// app/(app)/dashboard/page.tsx
import { getActiveRace } from '@/lib/race/active-race';

export default async function DashboardPage() {
  const race = await getActiveRace();

  return (
    <div className='p-4'>
      <p className='text-muted text-sm'>
        {race
          ? `Training for ${race.name} · Dashboard coming in Phase 2`
          : 'No active race — setup modal should be open'}
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Add redirect from root to dashboard**

```tsx
// app/page.tsx
import { redirect } from 'next/navigation';
export default function HomePage() {
  redirect('/dashboard');
}
```

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/ app/page.tsx app/layout.tsx
git commit -m "feat: app shell layout with race setup modal integration"
```

---

## Task 18: Playwright E2E — race setup flow

**Files:**

- Create: `e2e/race-setup.spec.ts`

- [ ] **Step 1: Write race setup E2E test**

```ts
// e2e/race-setup.spec.ts
import { test, expect } from '@playwright/test';

const EMAIL = `percy-setup-${Date.now()}@example.com`;
const PASSWORD = 'SetupTest123!';

// Calculate dates
function futureDate(daysAhead: number): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  return d.toISOString().slice(0, 10);
}

test.describe('Race Setup', () => {
  test.beforeEach(async ({ page }) => {
    // Register fresh user
    await page.goto('/register');
    await page.fill('input[type="email"]', EMAIL);
    await page.fill('input[id="password"]', PASSWORD);
    await page.fill('input[id="confirmPassword"]', PASSWORD);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/dashboard', { timeout: 10000 });
  });

  test('race setup modal shows after registration', async ({ page }) => {
    // Dialog should be visible
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    // Step 1 title should show
    await expect(page.getByText('Your Race')).toBeVisible();
  });

  test('completes all 3 steps and generates training plan', async ({
    page,
  }) => {
    const raceDate = futureDate(90);
    const startDate = futureDate(1);

    // Step 1
    await page.fill('input[placeholder*="ASICS"]', 'Test Marathon');
    await page.fill('input[type="date"]:first-of-type', raceDate);
    // Select distance
    await page.locator('[role="combobox"]').first().click();
    await page.getByRole('option', { name: 'Half Marathon' }).click();
    await page.fill('input[placeholder*="Melbourne"]', 'Sydney, Australia');
    await page.fill('input[type="date"]:last-of-type', startDate);
    await page.click('button:has-text("Next")');

    // Step 2
    await expect(page.getByText('Goal & Fitness')).toBeVisible();
    await page.fill('input[placeholder="1:40:00"]', '1:45:00');
    await page.locator('[role="combobox"]').first().click();
    await page.getByRole('option', { name: /Building base/ }).click();
    await page.click('button:has-text("Next")');

    // Step 3
    await expect(page.getByText('Physiological Data')).toBeVisible();
    await page.fill('input[placeholder="32"]', '28');
    await page.click('button:has-text("Build my plan")');

    // Should redirect to dashboard with race loaded
    await expect(page).toHaveURL('/dashboard', { timeout: 15000 });
    await expect(page.locator('[role="dialog"]')).not.toBeVisible({
      timeout: 5000,
    });
    await expect(page.getByText('Test Marathon')).toBeVisible();
  });

  test('modal cannot be dismissed with escape', async ({ page }) => {
    await expect(page.locator('[role="dialog"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E tests**

```bash
npx playwright test e2e/race-setup.spec.ts --reporter=line
```

Expected: All 3 tests PASS.

- [ ] **Step 3: Run full unit test suite to confirm nothing broken**

```bash
npm test
```

Expected: All unit tests PASS.

- [ ] **Step 4: Commit**

```bash
git add e2e/race-setup.spec.ts
git commit -m "test: Playwright E2E for race setup flow"
```

---

## Task 19: Final phase 1 integration check

- [ ] **Step 1: Start dev server and manually verify the full flow**

```bash
npm run dev
```

Navigate to `http://localhost:3000` and verify:

1. Redirects to `/login`
2. Register creates account
3. Race Setup modal opens immediately after register
4. All 3 steps validate correctly
5. "Build my plan →" calls API and redirects to `/dashboard`
6. Slim header shows race name + countdown
7. Log out and log back in — modal does NOT re-open (active race exists)

- [ ] **Step 2: Run all tests**

```bash
npm test && npx playwright test --reporter=line
```

Expected: All unit tests + all E2E tests PASS.

- [ ] **Step 3: Tag Phase 1 complete**

```bash
git tag phase-1-foundation
git push origin main --tags
```

---

## What's Next

**Phase 2 — UI Tabs:** Dashboard widgets (weekly distance arc, est. finish time, pace table, completion rate), Workouts tab (session cards, log-run form, adaptation banner), Race tab (server-rendered race info + pace band), Profile tab (goal time edit, Garmin re-upload, danger zone).

**Phase 3 — Adaptive Plan Engine:** Option A rule-based rescheduling, Option B Gemini AI rescheduling, ACWR calculation, Orchestrator routing.

**Phase 4 — Strava + PWA:** OAuth2 callback, webhook, activity sync, next-pwa manifest, service worker offline caching.
