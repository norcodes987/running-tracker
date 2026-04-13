import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // @ts-expect-error dynamicIO is available in Next.js canary but not yet typed
    dynamicIO: true,   // enables "use cache" directive
  },
}

export default nextConfig
