/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // ビルド時のESLintエラーを無視
  eslint: {
    ignoreDuringBuilds: true,
  },

  // ビルド時の型チェックエラーを無視
  typescript: {
    ignoreBuildErrors: true,
  },

  // 開発環境での Fast Refresh を調整
  webpack: (config, { dev, isServer }) => {
    if (dev && !isServer) {
      // Fast Refresh のポーリング間隔を長くする
      config.watchOptions = {
        ...config.watchOptions,
        poll: 5000, // 5秒に1回のポーリング
        aggregateTimeout: 300, // 変更を待つ時間
        ignored: ['**/node_modules', '**/.git', '**/.next'],
      };
    }
    return config;
  },

  // 画像の最適化設定
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },

  // Fast Refresh の設定
  onDemandEntries: {
    // ページをメモリに保持する時間を延長
    maxInactiveAge: 60 * 1000 * 60, // 60分
    // 同時にキープするページ数
    pagesBufferLength: 10,
  },
};

module.exports = nextConfig;