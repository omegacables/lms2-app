import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 画像最適化設定
  images: {
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: 'tjzdsiaehksqpxuvzqvp.supabase.co' },
      { protocol: 'https', hostname: 'ewtnyhfizuyvzvxkllva.supabase.co' },
      { protocol: 'https', hostname: 'btxlrrjcifynhnujsgyf.supabase.co' },
      { protocol: 'https', hostname: 'media.stus-lms.com' },
      { protocol: 'https', hostname: 'media.axialms.com' },
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
  // ※ 以前は /api/* に Access-Control-Allow-Origin: * を付けていたが、
  //    iOS/Android アプリは Bearer トークンで直接呼ぶため CORS は不要。任意サイトからの API 読み取りを防ぐため削除。
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },
};

export default nextConfig;
