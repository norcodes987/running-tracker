// components/nav/AppNav.tsx
'use client'

import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Activity,
  Flag,
  User,
  type LucideIcon,
} from 'lucide-react'

type Tab = { label: string; href: string; Icon: LucideIcon }

const TABS: Tab[] = [
  { label: 'Dashboard', href: '/dashboard', Icon: LayoutDashboard },
  { label: 'Workouts',  href: '/workouts',  Icon: Activity },
  { label: 'Race',      href: '/race',      Icon: Flag },
  { label: 'Profile',   href: '/profile',   Icon: User },
]

export function AppNav() {
  const pathname = usePathname()
  const router   = useRouter()

  function navigate(href: string) {
    if (pathname === href || pathname.startsWith(href + '/')) return
    if ('startViewTransition' in document) {
      ;(document as Document & { startViewTransition: (cb: () => void) => void })
        .startViewTransition(() => { router.push(href) })
    } else {
      router.push(href)
    }
  }

  return (
    <nav className="sticky top-0 z-50 flex bg-bg">
      {TABS.map(({ label, href, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <button
            key={href}
            onClick={() => navigate(href)}
            aria-current={active ? 'page' : undefined}
            className={[
              'flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[10px] uppercase tracking-widest transition-colors',
              active
                ? 'border-b-2 border-accent text-accent'
                : 'text-muted hover:text-text',
            ].join(' ')}
          >
            <Icon size={18} />
            <span className="nav-label">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
