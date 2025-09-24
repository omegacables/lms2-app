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
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          ログイン
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          アカウントにログインして学習を続けましょう
        </p>
      </div>

      {/* フォーム */}
      <div className="liquid-glass-interactive dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border border-gray-200 dark:border-neutral-800 p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
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
              autoComplete="email"
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
            className="w-full"
            size="lg"
            loading={isLoading}
            disabled={isSubmitting || isLoading}
          >
            ログイン
          </Button>
        </form>

        {/* フッターリンク */}
        <div className="mt-6 text-center space-y-4">
          <Link
            href="/auth/reset-password"
            className="text-sm text-blue-600 hover:text-blue-500"
          >
            パスワードを忘れた場合
          </Link>
          
          <div className="text-sm text-gray-600 dark:text-gray-400">
            アカウントをお持ちでないですか？{' '}
            <Link
              href="/auth/signup"
              className="text-blue-600 hover:text-blue-500 font-medium"
            >
              新規登録
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}