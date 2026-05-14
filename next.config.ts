import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ['.space-z.ai', '.space-chatglm.site', 'localhost'],
  // Fix 403 on dev overlay and font routes by allowing CORS on internal Next.js routes
  async headers() {
    return [
      {
        // Match all __nextjs internal routes (dev overlay, fonts, stack frames)
        source: '/__nextjs(.*)',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, OPTIONS' },
        ],
      },
      {
        // Match Next.js font optimization routes
        source: '/_next/static/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
      {
        // Match Next.js image optimization routes (used by font proxy)
        source: '/_next/image(.*)',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
        ],
      },
    ]
  },
  // Prevent server crashes from unhandled errors in API routes
  serverExternalPackages: ['sharp'],
};

export default nextConfig;
