import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
];

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker / Railway (.next/standalone).
  output: 'standalone',
  // Type errors now fail the build (the codebase type-checks cleanly).
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  poweredByHeader: false,
  // Native/DB drivers and the SQL engine must not be bundled by webpack/turbopack.
  serverExternalPackages: ['pg', 'mysql2', 'alasql'],
  async headers() {
    return [
      // API is same-origin only: no wildcard CORS (cookies carry the session).
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
      { source: '/:path*', headers: securityHeaders },
    ]
  },
  images: {
    unoptimized: true,
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn', 'log'] } : false,
  },
};

export default nextConfig;
