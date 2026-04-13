import type { Metadata } from 'next'
import { Barlow_Condensed, DM_Mono, Instrument_Sans } from 'next/font/google'
import { SessionProvider } from 'next-auth/react'
import './globals.css'

const barlowCondensed = Barlow_Condensed({ weight: ['700'], subsets: ['latin'], variable: '--font-barlow' })
const dmMono = DM_Mono({ weight: ['400', '500'], subsets: ['latin'], variable: '--font-dm-mono' })
const instrumentSans = Instrument_Sans({ weight: ['400', '500', '600'], subsets: ['latin'], variable: '--font-instrument' })

export const metadata: Metadata = {
  title: 'Percy — Race Training',
  description: 'Train smarter. Race faster.',
  manifest: '/manifest.json',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${barlowCondensed.variable} ${dmMono.variable} ${instrumentSans.variable}`}>
      <body className="bg-bg text-text antialiased">
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  )
}
