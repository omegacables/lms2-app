'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/stores/auth';

const resetPasswordSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
});

type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { resetPassword } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const onSubmit = async (data: ResetPasswordFormData) => {
    try {
      setError(null);
      setIsLoading(true);

      const result = await resetPassword(data.email);

      if (result.error) {
        setError(result.error);
        setIsLoading(false);
        return;
      }

      setSuccess(true);
      setIsLoading(false);
    } catch (err) {
      console.error('パスワードリセットエラー:', err);
      setError('予期しないエラーが発生しました');
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <AuthLayout>
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              メール送信完了
            </h2>
          </div>

          <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
            <div className="text-center">
              <div className="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 p-4 mb-6">
                <p className="text-sm text-green-700">
                  パスワードリセット用のメールを送信しました。
                  メール内のリンクをクリックして、新しいパスワードを設定してください。
                </p>
              </div>

              <Link
                href="/auth/login"
                className="text-blue-600 hover:text-blue-500 hover:underline font-medium"
              >
                ログインページに戻る
              </Link>
            </div>
          </div>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <div className="w-full max-w-md">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            パスワードリセット
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            メールアドレスを入力してください。パスワードリセット用のリンクをお送りします。
          </p>
        </div>

        {/* フォーム */}
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 p-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <Input
              type="email"
              label="メールアドレス"
              placeholder="user@example.com"
              autoComplete="email"
              error={errors.email?.message}
              {...register('email')}
            />

            <button
              type="submit"
              className="w-full h-11 px-8 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={isLoading}
            >
              {isLoading ? '送信中...' : 'リセットメールを送信'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link
              href="/auth/login"
              className="text-sm text-blue-600 hover:text-blue-500 hover:underline"
            >
              ログインページに戻る
            </Link>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}