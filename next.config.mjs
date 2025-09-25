import { hostname } from 'os';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,

  // 画像ドメインの設定
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'tjzdsiaehksqpxuvzqvp.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
  },

  // APIボディサイズの設定
  api: {
    bodyParser: {
      sizeLimit: '500mb',
    },
    responseLimit: '500mb',
  },

  // 静的エクスポートの設定
  output: process.env.NODE_ENV === 'production' ? 'standalone' : undefined,

  // TypeScriptとESLintの設定
  typescript: {
    ignoreBuildErrors: false,
  },

  eslint: {
    ignoreDuringBuilds: false,
  },

  // Serverless Function Configuration
  serverRuntimeConfig: {
    maxDuration: 60,
    bodySizeLimit: '500mb',
  },

  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },
};

export default nextConfig;