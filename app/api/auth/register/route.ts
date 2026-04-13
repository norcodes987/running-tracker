import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { db } from '@/lib/db'
import { users, userProfile } from '@/lib/db/schema'

export async function POST(request: Request) {
  const { email, password } = await request.json()

  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
  }

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  })

  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 409 })
  }

  const passwordHash = await bcrypt.hash(password, 12)

  const [user] = await db.insert(users).values({ email, passwordHash }).returning()

  await db.insert(userProfile).values({ userId: user.id })

  return NextResponse.json({ ok: true }, { status: 201 })
}
