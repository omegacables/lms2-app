'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/stores/auth';
import { loginSchema, type LoginFormData } from '@/lib/validation/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

interface LoginFormProps {
  className?: string;
  redirectTo?: string;
}

export function LoginForm({ className, redirectTo = '/dashboard' }: LoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  // URLパラメータからredirectToを取得
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const urlRedirectTo = searchParams?.get('redirectTo') || redirectTo;
  
  console.log('[LoginForm] Redirect destination:', urlRedirectTo);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    console.log('[LoginForm] Login attempt started');
    setError(null);
    setIsLoading(true);

    try {
      const result = await signIn(data.email, data.password);

      if (result.error) {
        console.error('[LoginForm] Login failed:', result.error);
        setError(result.error);
        setIsLoading(false);
        return;
      }

      console.log('[LoginForm] Login successful, result:', result);

      // ログイン成功後、強制的にリダイレクト
      // windowオブジェクトを使用して確実にリダイレクトする
      const userRole = result.user?.profile?.role;
      let redirectUrl = urlRedirectTo;

      // URLパラメータが指定されていない場合のデフォルト動作
      if (!searchParams?.get('redirectTo')) {
        if (userRole === 'admin') {
          redirectUrl = '/admin';
        } else {
          redirectUrl = '/dashboard';
        }
      }

      console.log('[LoginForm] Redirecting to:', redirectUrl);

      // window.locationを使用して確実にリダイレクト
      // React Routerを使わず、ブラウザのネイティブナビゲーションを使用
      window.location.replace(redirectUrl);

    } catch (err) {
      console.error('[LoginForm] Unexpected error:', err);
      setError('ログインに失敗しました');
      setIsLoading(false);
    }
  };

  return (
    <div className={cn('w-full max-w-md', className)}>
      {/* ヘッダー */}
      <div className="text-center mb-8 px-2">
        <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3">
          ログイン
        </h2>
        <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 leading-relaxed">
          アカウントにログインして学習を続けましょう
        </p>
      </div>

      {/* フォーム */}
      <div className="bg-white dark:bg-neutral-900 rounded-xl shadow-sm dark:shadow-gray-900/20 border border-gray-200 dark:border-neutral-800 p-5 sm:p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" method="POST" action="#">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 p-4">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <Input
              type="email"
              label="メールアドレス"
              placeholder="user@example.com"
              autoComplete="username email"
              error={errors.email?.message}
              {...register('email')}
            />

            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                label="パスワード"
                placeholder="パスワードを入力"
                autoComplete="current-password"
                error={errors.password?.message}
                {...register('password')}
              />
              <button
                type="button"
                className="absolute right-3 top-9 text-gray-400 hover:text-gray-600 dark:text-gray-400"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeSlashIcon className="h-5 w-5" />
                ) : (
                  <EyeIcon className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:hover:bg-neutral-200 dark:text-neutral-900"
            size="lg"
            loading={isLoading}
            disabled={isSubmitting || isLoading}
          >
            ログイン
          </Button>
        </form>

        {/* フッターリンク */}
        <div className="mt-6 text-center space-y-4">
          {/* 管理者ログインリンク */}
          <div className="rounded-lg bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 p-3">
            <Link
              href="/admin/login"
              className="text-sm text-gray-700 dark:text-gray-200 hover:text-gray-900 dark:hover:text-white font-medium flex items-center justify-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
              </svg>
              管理者の方はこちら
            </Link>
          </div>

          <Link
            href="/auth/reset-password"
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white underline underline-offset-4"
          >
            パスワードを忘れた場合
          </Link>

          <div className="text-sm text-gray-600 dark:text-gray-400">
            アカウントをお持ちでないですか？{' '}
            <Link
              href="/auth/signup"
              className="text-gray-900 dark:text-white hover:opacity-70 font-medium underline underline-offset-4"
            >
              新規登録
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}