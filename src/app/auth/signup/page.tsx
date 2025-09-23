'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/stores/auth';

const signupSchema = z.object({
  email: z.string().email('有効なメールアドレスを入力してください'),
  password: z.string().min(8, 'パスワードは8文字以上で入力してください'),
  confirmPassword: z.string(),
  displayName: z.string().min(1, '表示名を入力してください'),
  company: z.string().optional(),
  department: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "パスワードが一致しません",
  path: ["confirmPassword"],
});

type SignupFormData = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { signUp } = useAuth();
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormData>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignupFormData) => {
    try {
      setError(null);
      setIsLoading(true);

      const result = await signUp(data.email, data.password, data.displayName);

      if (result.error) {
        setError(result.error);
        setIsLoading(false);
        return;
      }

      // サインアップ成功
      alert('アカウントが作成されました。メールをご確認ください。');
      router.push('/auth/login');
    } catch (err) {
      console.error('サインアップエラー:', err);
      setError('予期しないエラーが発生しました');
      setIsLoading(false);
    }
  };

  return (
    <AuthLayout>
      <div className="w-full max-w-md">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            アカウント作成
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            新しいアカウントを作成して学習を開始しましょう
          </p>
        </div>

        {/* フォーム */}
        <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 p-4">
                <p className="text-sm text-red-700">{error}</p>
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

              <Input
                type="text"
                label="表示名"
                placeholder="山田太郎"
                error={errors.displayName?.message}
                {...register('displayName')}
              />

              <Input
                type="text"
                label="会社名（任意）"
                placeholder="株式会社サンプル"
                error={errors.company?.message}
                {...register('company')}
              />

              <Input
                type="text"
                label="部署名（任意）"
                placeholder="営業部"
                error={errors.department?.message}
                {...register('department')}
              />

              <Input
                type="password"
                label="パスワード"
                placeholder="パスワードを入力"
                autoComplete="new-password"
                error={errors.password?.message}
                {...register('password')}
              />

              <Input
                type="password"
                label="パスワード確認"
                placeholder="パスワードを再入力"
                autoComplete="new-password"
                error={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />
            </div>

            <button
              type="submit"
              className="w-full h-11 px-8 bg-blue-600 text-white rounded-md font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              disabled={isLoading}
            >
              {isLoading ? 'アカウント作成中...' : 'アカウント作成'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              既にアカウントをお持ちですか？{' '}
              <Link
                href="/auth/login"
                className="text-blue-600 hover:text-blue-500 hover:underline font-medium"
              >
                ログイン
              </Link>
            </p>
          </div>
        </div>
      </div>
    </AuthLayout>
  );
}