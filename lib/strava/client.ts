const BASE = 'https://www.strava.com/api/v3'
const TOKEN_URL = 'https://www.strava.com/oauth/token'

export type StravaTokenResponse = {
  access_token:  string
  refresh_token: string
  expires_at:    number   // Unix timestamp (seconds)
  athlete?:      StravaAthlete
}

export type StravaAthlete = {
  id:        number
  firstname: string
  lastname:  string
}

export type StravaActivity = {
  id:                number
  type:              string   // 'Run', 'VirtualRun', etc.
  distance:          number   // metres
  moving_time:       number   // seconds
  average_heartrate: number | undefined
  average_speed:     number   // m/s
  start_date:        string   // ISO 8601 datetime string
}

export type StravaActivitySummary = {
  id:         number
  type:       string
  start_date: string
}

export async function exchangeCode(code: string): Promise<StravaTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID!,
      client_secret: process.env.STRAVA_CLIENT_SECRET!,
      code,
      grant_type:    'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Strava token exchange failed: ${res.status}`)
  return res.json()
}

export async function refreshStravaToken(refreshToken: string): Promise<StravaTokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID!,
      client_secret: process.env.STRAVA_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type:    'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Strava token refresh failed: ${res.status}`)
  return res.json()
}

export async function fetchStravaActivity(accessToken: string, activityId: number): Promise<StravaActivity> {
  const res = await fetch(`${BASE}/activities/${activityId}`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Strava fetch activity failed: ${res.status}`)
  return res.json()
}

export async function fetchStravaActivities(accessToken: string, perPage: number): Promise<StravaActivitySummary[]> {
  const res = await fetch(`${BASE}/athlete/activities?per_page=${perPage}`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Strava fetch activities failed: ${res.status}`)
  return res.json()
}

export async function fetchStravaAthlete(accessToken: string): Promise<StravaAthlete> {
  const res = await fetch(`${BASE}/athlete`, {
    cache: 'no-store',
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error(`Strava fetch athlete failed: ${res.status}`)
  return res.json()
}

export async function registerStravaWebhook(callbackUrl: string, verifyToken: string): Promise<number> {
  const res = await fetch(`${BASE}/push_subscriptions`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id:     process.env.STRAVA_CLIENT_ID!,
      client_secret: process.env.STRAVA_CLIENT_SECRET!,
      callback_url: callbackUrl,
      verify_token: verifyToken,
    }),
  })
  if (!res.ok) throw new Error(`Strava register webhook failed: ${res.status}`)
  const data = await res.json()
  return data.id as number
}

export async function deleteStravaWebhook(subscriptionId: number): Promise<void> {
  const body = new URLSearchParams({
    client_id:     process.env.STRAVA_CLIENT_ID!,
    client_secret: process.env.STRAVA_CLIENT_SECRET!,
  })
  const res = await fetch(`${BASE}/push_subscriptions/${subscriptionId}`, {
    method: 'DELETE',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok && res.status !== 404) {
    throw new Error(`Strava delete webhook failed: ${res.status}`)
  }
}
