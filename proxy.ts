import { auth } from '@/lib/auth'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Session } from 'next-auth'

export const proxy = auth((request: NextRequest & { auth: Session | null }) => {
  const session = request.auth

  const { pathname } = request.nextUrl
  const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/register')
  const isProtected = !isAuthRoute

  if (!session && isProtected) {
    return NextResponse.redirect(new URL('/login', request.url))
  }

  if (session && isAuthRoute) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }
})

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|manifest.json|sw.js).*)'],
}
