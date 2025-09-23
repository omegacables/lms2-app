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

export function AuthLayout({ 
  children, 
  title = '企業研修LMS',
  subtitle = '効率的な学習管理システム',
  className 
}: AuthLayoutProps) {
  return (
    <div className={cn('min-h-screen bg-gray-50 dark:bg-black', className)}>
      <div className="flex min-h-screen">
        {/* 左側：ブランディングエリア */}
        <div className="hidden lg:flex lg:w-1/2 lg:items-center lg:justify-center bg-gradient-to-br from-blue-600 via-blue-700 to-blue-800 relative overflow-hidden">
          {/* 背景デコレーション */}
          <div className="absolute inset-0 bg-gradient-to-br from-blue-600/20 to-transparent" />
          <div className="absolute top-10 left-10 w-32 h-32 liquid-glass-interactive dark:bg-neutral-900/10 rounded-full blur-xl" />
          <div className="absolute bottom-20 right-20 w-40 h-40 liquid-glass-interactive/5 rounded-full blur-xl" />
          
          <div className="relative max-w-md text-center text-white px-8">
            {/* ロゴ */}
            <div className="mb-8">
              <div className="w-16 h-16 liquid-glass-interactive/20 rounded-2xl flex items-center justify-center mx-auto mb-4 backdrop-blur-sm">
                <AcademicCapIcon className="h-8 w-8 text-white" />
              </div>
              <div className="text-2xl font-bold">LMS</div>
            </div>
            
            <h1 className="text-4xl font-bold mb-4 leading-tight">{title}</h1>
            <p className="text-xl mb-8 text-blue-100 leading-relaxed">{subtitle}</p>
            
            {/* 特徴リスト */}
            <div className="space-y-6 text-left">
              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 liquid-glass-interactive/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <PlayIcon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">動画ベースの効率的な研修</h3>
                  <p className="text-sm text-blue-100 opacity-90">高品質な動画コンテンツで学習効果を最大化</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 liquid-glass-interactive/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <ChartBarIcon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">詳細な進捗管理</h3>
                  <p className="text-sm text-blue-100 opacity-90">リアルタイムで学習状況を可視化</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 liquid-glass-interactive/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <CheckCircleIcon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">自動証明書発行</h3>
                  <p className="text-sm text-blue-100 opacity-90">完了時に即座に証明書を生成</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-4">
                <div className="w-8 h-8 liquid-glass-interactive/20 rounded-lg flex items-center justify-center flex-shrink-0 mt-1">
                  <DevicePhoneMobileIcon className="h-4 w-4 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold mb-1">マルチデバイス対応</h3>
                  <p className="text-sm text-blue-100 opacity-90">PC・タブレット・スマートフォンで学習</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 右側：フォームエリア */}
        <div className="flex-1 flex items-center justify-center p-8 liquid-glass-interactive">
          <div className="w-full max-w-md">
            {/* モバイル用ヘッダー */}
            <div className="lg:hidden text-center mb-8">
              <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mx-auto mb-4">
                <AcademicCapIcon className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">{title}</h1>
              <p className="text-gray-600 dark:text-gray-400">{subtitle}</p>
            </div>

            {/* フォームコンテンツ */}
            <div className="liquid-glass-interactive">
              {children}
            </div>
            
            {/* フッター */}
            <div className="mt-8 text-center">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                © 2025 企業研修LMS. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}