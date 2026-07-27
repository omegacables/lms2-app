import { AuthLayout } from '@/components/layout/AuthLayout';
import { AdminLoginForm } from '@/components/auth/AdminLoginForm';

export const metadata = {
  title: '管理者ログイン - Minova',
  description: '管理者専用のログインページです。',
};

export default function AdminLoginPage() {
  return (
    <AuthLayout>
      <AdminLoginForm />
    </AuthLayout>
  );
}
