import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  experimental: {
    // Les fotos fetes amb el mòbil poden ser grosses; el pas per Server Action
    // no les inclou (van directes a Storage), però deixem marge per si de cas.
    serverActions: { bodySizeLimit: '4mb' },
  },
}

export default nextConfig
