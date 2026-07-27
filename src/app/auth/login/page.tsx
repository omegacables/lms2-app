import { GuestGuard } from '@/components/auth/AuthGuard';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata = {
  title: 'ログイン - Minova',
  description: 'Minova（企業研修用eラーニングアプリ）にログインして学習を開始しましょう。',
};

export default function LoginPage() {
  return (
    <AuthLayout>
      <LoginForm />
    </AuthLayout>
  );
}