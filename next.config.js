/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ビルド時の型チェックエラーを無視
  typescript: {
    ignoreBuildErrors: true,
  },

  // APIルートのボディサイズ制限を増やす
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
  },

  // Turbopack設定（Next.js 16対応）
  turbopack: {},

  // 画像の最適化設定
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

module.exports = nextConfig;