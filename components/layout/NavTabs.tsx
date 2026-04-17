'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const TABS = [
  { label: 'Dashboard', href: '/dashboard' },
  { label: 'Workouts', href: '/workouts' },
  { label: 'Race', href: '/race' },
  { label: 'Profile', href: '/profile' },
];

export function NavTabs() {
  const pathname = usePathname();

  return (
    <>
      {TABS.map((tab) => {
        const active = pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`flex-1 py-3 text-center text-xs uppercase tracking-widest transition-colors ${
              active ? 'text-text border-b border-accent' : 'text-muted'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </>
  );
}
