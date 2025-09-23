import { GuestGuard } from '@/components/auth/AuthGuard';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { LoginForm } from '@/components/auth/LoginForm';

export const metadata = {
  title: 'ログイン - 企業研修LMS',
  description: '企業研修LMSにログインして学習を開始しましょう。',
};

export default function LoginPage() {
  return (
    <AuthLayout>
      <LoginForm />
    </AuthLayout>
  );
}