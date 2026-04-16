import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.redirect(new URL('/login', process.env.AUTH_URL!))
  }

  const params = new URLSearchParams({
    client_id:       process.env.STRAVA_CLIENT_ID!,
    redirect_uri:    `${process.env.AUTH_URL}/api/strava/callback`,
    response_type:   'code',
    approval_prompt: 'auto',
    scope:           'activity:read_all',
  })

  return NextResponse.redirect(
    `https://www.strava.com/oauth/authorize?${params.toString()}`,
  )
}
