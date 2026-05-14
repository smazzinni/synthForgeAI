import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  output: 'standalone',
  allowedDevOrigins: ['.space-z.ai', '.space-chatglm.site', 'localhost'],
  async headers() {
    return [
      {
        source: '/__nextjs(.*)',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
      {
        source: '/_next/image(.*)',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ]
  },
  // Remove sharp from serverExternalPackages to avoid SIGBUS
  // serverExternalPackages: ['sharp'],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
