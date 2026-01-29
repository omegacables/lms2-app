import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 画像最適化設定
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'tjzdsiaehksqpxuvzqvp.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  // アップロード設定
  serverExternalPackages: ['@supabase/supabase-js'],

  // ビルド設定（Next.js 16対応）
  typescript: {
    ignoreBuildErrors: true,
  },

  // Turbopack設定（Next.js 16対応）
  turbopack: {},

  // 実験的機能
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },

  // セキュリティヘッダー
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS, PATCH',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ]
  },
};

export default nextConfig;
