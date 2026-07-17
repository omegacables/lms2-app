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

  // 動画をサイトと同一ドメイン経由で配信するための中継（社内フィルタ対策）
  // /media/videos/... → 配信元（NEXT_PUBLIC_MEDIA_BASE_URL があれば R2、なければ Supabase）
  // ※ env を外すだけで Supabase 中継に戻せる（ロールバック用）
  async rewrites() {
    const mediaBase = process.env.NEXT_PUBLIC_MEDIA_BASE_URL?.replace(/\/+$/, '');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const destination = mediaBase
      ? `${mediaBase}/:path*`
      : supabaseUrl
        ? `${supabaseUrl}/storage/v1/object/public/videos/:path*`
        : null;
    if (!destination) return [];
    return [
      {
        source: '/media/videos/:path*',
        destination,
      },
    ];
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
