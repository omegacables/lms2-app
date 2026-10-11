'use client';

import { usePathname } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';

/**
 * /admin 配下を一括で保護する。
 * 以前は各ページの <AuthGuard> に役割指定が無い（または存在しない props を渡している）ものが多く、
 * ログイン済みの受講者でも管理画面が表示されていた。
 * 管理者専用のページは、さらにページ側で requiredRoles={['admin']} を指定する。
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }
  return (
    <AuthGuard requiredRoles={['admin', 'instructor']} redirectTo="/admin/login">
      {children}
    </AuthGuard>
  );
}
