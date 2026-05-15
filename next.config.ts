import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ['.space-z.ai', '.space-chatglm.site', 'localhost', '127.0.0.1'],
  async headers() {
    return [
      {
        // Add Connection: close to ALL responses to prevent keep-alive resource leaks
        // This is critical for server stability in containerized environments
        source: '/(.*)',
        headers: [
          { key: 'Connection', value: 'close' },
        ],
      },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PATCH, DELETE, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
          { key: 'Connection', value: 'close' },
        ],
      },
    ]
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    serverMinification: true,
  },
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? { exclude: ['error', 'warn'] } : false,
  },
};

export default nextConfig;
