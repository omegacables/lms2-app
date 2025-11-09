'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { EyeIcon, EyeSlashIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';
import { useAuth } from '@/stores/auth';
import { loginSchema, type LoginFormData } from '@/lib/validation/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { cn } from '@/lib/utils';

interface AdminLoginFormProps {
  className?: string;
}

export function AdminLoginForm({ className }: AdminLoginFormProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { signIn } = useAuth();
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    console.log('[AdminLoginForm] Admin login attempt started');
    setError(null);
    setIsLoading(true);

    try {
      const result = await signIn(data.email, data.password);

      if (result.error) {
        console.error('[AdminLoginForm] Login failed:', result.error);
        setError(result.error);
        setIsLoading(false);
        return;
      }

      console.log('[AdminLoginForm] Login successful, result:', result);

      // ログイン成功後、管理者権限を確認
      const userRole = result.user?.profile?.role;

      if (userRole !== 'admin') {
        setError('管理者権限がありません。一般ユーザーの方は通常のログインページからログインしてください。');
        setIsLoading(false);
        // 管理者以外はログアウト
        return;
      }

      console.log('[AdminLoginForm] Admin access confirmed, redirecting to admin panel');

      // 管理者ページにリダイレクト
      window.location.replace('/admin');

    } catch (err) {
      console.error('[AdminLoginForm] Unexpected error:', err);
      setError('ログインに失敗しました');
      setIsLoading(false);
    }
  };

  return (
    <div className={cn('w-full max-w-md', className)}>
      {/* ヘッダー */}
      <div className="text-center mb-8">
        <div className="flex justify-center mb-4">
          <ShieldCheckIcon className="h-16 w-16 text-blue-600" />
        </div>
        <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          管理者ログイン
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          管理者専用のログインページです
        </p>
      </div>

      {/* 警告メッセージ */}
      <div className="mb-6 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-4">
        <p className="text-sm text-yellow-800 dark:text-yellow-200">
          このページは管理者専用です。一般ユーザーの方は{' '}
          <Link href="/auth/login" className="underline font-medium">
            こちら
          </Link>
          {' '}からログインしてください。
        </p>
      </div>

      {/* フォーム */}
      <div className="liquid-glass-interactive dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border border-gray-200 dark:border-neutral-800 p-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" method="POST" action="#">
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 p-4">
              <div className="flex">
                <div className="ml-3">
                  <p className="text-sm text-red-700 dark:text-red-200">{error}</p>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-4">
            <Input
              type="email"
              label="管理者メールアドレス"
              placeholder="admin@example.com"
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
            className="w-full"
            size="lg"
            loading={isLoading}
            disabled={isSubmitting || isLoading}
          >
            管理者としてログイン
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
            一般ユーザーの方は{' '}
            <Link
              href="/auth/login"
              className="text-blue-600 hover:text-blue-500 font-medium"
            >
              通常のログインページ
            </Link>
            {' '}へ
          </div>
        </div>
      </div>
    </div>
  );
}
