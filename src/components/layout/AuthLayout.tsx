'use client';

import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { 
  AcademicCapIcon,
  PlayIcon,
  ChartBarIcon,
  DevicePhoneMobileIcon,
  CheckCircleIcon 
} from '@heroicons/react/24/outline';

interface AuthLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  className?: string;
}

/** App Store の公式ダウンロードリンク（iOSアプリ版） */
const APP_STORE_URL =
  'https://apps.apple.com/jp/app/minova-%E4%BC%81%E6%A5%AD%E7%A0%94%E4%BF%AE%E7%94%A8e%E3%83%A9%E3%83%BC%E3%83%8B%E3%83%B3%E3%82%B0%E3%82%A2%E3%83%97%E3%83%AA/id6789630514';

export function AuthLayout({
  children,
  title = 'Minova',
  subtitle = '企業研修用eラーニングアプリ',
  className
}: AuthLayoutProps) {
  return (
    <div className={cn('min-h-screen bg-white dark:bg-black', className)}>
      <div className="flex min-h-screen">
        {/* 左側：ブランディングエリア（白黒基調で可読性重視） */}
        <div className="hidden lg:flex lg:w-1/2 lg:items-center lg:justify-center bg-neutral-950 relative overflow-hidden">
          <div className="relative max-w-md text-center text-white px-8">
            {/* ロゴ */}
            <div className="mb-8">
              <div className="w-16 h-16 bg-white/10 border border-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AcademicCapIcon className="h-8 w-8 text-white" />
              </div>
              <div className="text-2xl font-bold">Minova</div>
            </div>
            
            <h1 className="text-4xl font-bold mb-4 leading-tight">{title}</h1>
            <p className="text-xl mb-8 text-neutral-300 leading-relaxed">{subtitle}</p>
            
            {/* 特徴リスト */}
            <div className="space-y-6 text-left">
              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 bg-white/10 border border-white/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <PlayIcon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">動画ベースの効率的な研修</h3>
                  <p className="text-sm text-neutral-400">高品質な動画コンテンツで学習効果を最大化</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 bg-white/10 border border-white/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <ChartBarIcon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">詳細な進捗管理</h3>
                  <p className="text-sm text-neutral-400">リアルタイムで学習状況を可視化</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 bg-white/10 border border-white/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <CheckCircleIcon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">自動証明書発行</h3>
                  <p className="text-sm text-neutral-400">完了時に即座に証明書を生成</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 bg-white/10 border border-white/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <DevicePhoneMobileIcon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">マルチデバイス対応</h3>
                  <p className="text-sm text-neutral-400">PC・タブレット・スマートフォンで学習</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右側：フォームエリア */}
        <div className="flex-1 flex items-center justify-center px-5 py-10 sm:px-8 sm:py-12 bg-white dark:bg-black">
          <div className="w-full max-w-md">
            {/* モバイル用ヘッダー */}
            <div className="lg:hidden text-center mb-10">
              <div className="w-14 h-14 bg-neutral-900 dark:bg-white rounded-xl flex items-center justify-center mx-auto mb-5">
                <AcademicCapIcon className="h-7 w-7 text-white dark:text-neutral-900" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{title}</h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">{subtitle}</p>
            </div>

            {/* iOSアプリ版の案内（スマホでは目立つカード、PCでは控えめに） */}
            <div className="lg:hidden mb-8 rounded-xl border border-gray-300 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900 p-5 text-center">
              <p className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                iOS向けアプリ版はこちら
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-3">
                iPhone・iPadでより快適に学習できます
              </p>
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block"
                aria-label="App Store でダウンロード"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/badges/app-store-badge-ja.svg"
                  alt="App Store でダウンロード"
                  className="h-12 w-auto mx-auto"
                />
              </a>
            </div>

            {/* フォームコンテンツ */}
            <div>
              {children}
            </div>

            {/* PC向け: iOSアプリ版の案内 */}
            <div className="hidden lg:flex mt-8 items-center justify-center gap-3">
              <span className="text-sm text-gray-600 dark:text-gray-400">
                iOS向けアプリ版はこちら
              </span>
              <a
                href={APP_STORE_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="App Store でダウンロード"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/badges/app-store-badge-ja.svg"
                  alt="App Store でダウンロード"
                  className="h-10 w-auto"
                />
              </a>
            </div>

            {/* フッター */}
            <div className="mt-8 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                © 2025 Minova. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}