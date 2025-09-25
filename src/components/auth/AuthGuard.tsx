'use client';

import { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/stores/auth';
import { UserRole } from '@/types';
import { LoadingPage } from '@/components/ui/LoadingSpinner';

interface AuthGuardProps {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
  redirectTo?: string;
  fallback?: React.ReactNode;
}

export function AuthGuard({
  children,
  requiredRoles,
  redirectTo = '/auth/login',
  fallback
}: AuthGuardProps) {
  const { user, loading, initialized, initialize } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState<string | null>(null);
  const hasRedirected = useRef(false);

  useEffect(() => {
    setIsMounted(true);
    console.log('[AuthGuard] Component mounted - initialized:', initialized, 'loading:', loading, 'user:', user?.email);
    if (!initialized) {
      console.log('[AuthGuard] Calling initialize...');
      initialize();
    }
  }, []);

  useEffect(() => {
    // マウントされていない場合はリダイレクトしない
    if (!isMounted) return;

    console.log('[AuthGuard] Auth check - user:', user?.email, 'loading:', loading, 'initialized:', initialized);

    if (!initialized || loading) return;

    // 開発用バイパスユーザーの場合は認証チェックをスキップ
    if (user && user.id === 'dev-admin-001') {
      console.log('[AuthGuard] Dev bypass user detected, skipping auth check');
      return;
    }

    // 未認証の場合はログインページへリダイレクト
    if (!user) {
      console.log('[AuthGuard] No user, setting redirect to:', redirectTo);
      setShouldRedirect(redirectTo);
      return;
    }

    // 権限チェック
    if (requiredRoles && user.profile) {
      if (!requiredRoles.includes(user.profile.role)) {
        console.log('[AuthGuard] Insufficient permissions, setting redirect to /unauthorized');
        setShouldRedirect('/unauthorized');
        return;
      }
    }
  }, [user, loading, initialized, requiredRoles, redirectTo, isMounted]);

  // 別のエフェクトでリダイレクトを処理
  useEffect(() => {
    if (shouldRedirect && !hasRedirected.current && isMounted) {
      hasRedirected.current = true;
      // React 18以降では、ナビゲーションを次のティックまで遅延させる
      const timer = setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.href = shouldRedirect;
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [shouldRedirect, isMounted]);

  // マウントされていない、または初期化中、またはローディング中
  if (!isMounted || !initialized || loading) {
    return <LoadingPage message="認証情報を確認中..." />;
  }

  // 開発用バイパスユーザーの場合は常に認証済みとして扱う
  if (user && user.id === 'dev-admin-001') {
    // 権限チェック（開発用ユーザーでも権限は確認）
    if (requiredRoles && user.profile && !requiredRoles.includes(user.profile.role)) {
      return fallback || <LoadingPage message="権限を確認中..." />;
    }
    return <>{children}</>;
  }

  // 未認証
  if (!user) {
    return fallback || <LoadingPage message="リダイレクト中..." />;
  }

  // 権限不足
  if (requiredRoles && user.profile && !requiredRoles.includes(user.profile.role)) {
    return fallback || <LoadingPage message="権限を確認中..." />;
  }

  return <>{children}</>;
}

// 管理者専用ガード
export function AdminGuard({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <AuthGuard requiredRoles={['admin']} fallback={fallback}>
      {children}
    </AuthGuard>
  );
}

// インストラクター以上ガード
export function InstructorGuard({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <AuthGuard requiredRoles={['instructor', 'admin']} fallback={fallback}>
      {children}
    </AuthGuard>
  );
}

// ゲストガード（未認証ユーザー専用）
export function GuestGuard({
  children,
  redirectTo = '/dashboard'
}: {
  children: React.ReactNode;
  redirectTo?: string;
}) {
  const { user, loading, initialized, initialize } = useAuth();
  const [isMounted, setIsMounted] = useState(false);
  const [shouldRedirect, setShouldRedirect] = useState<string | null>(null);
  const hasRedirected = useRef(false);

  useEffect(() => {
    setIsMounted(true);
    if (!initialized) {
      initialize();
    }
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    if (!initialized || loading) return;

    // 認証済みの場合はダッシュボードへリダイレクト
    if (user) {
      setShouldRedirect(redirectTo);
      return;
    }
  }, [user, loading, initialized, redirectTo, isMounted]);

  // 別のエフェクトでリダイレクトを処理
  useEffect(() => {
    if (shouldRedirect && !hasRedirected.current && isMounted) {
      hasRedirected.current = true;
      // React 18以降では、ナビゲーションを次のティックまで遅延させる
      const timer = setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.href = shouldRedirect;
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [shouldRedirect, isMounted]);

  // マウントされていない、または初期化中、またはローディング中
  if (!isMounted || !initialized || loading) {
    return <LoadingPage message="認証情報を確認中..." />;
  }

  // 認証済みの場合はリダイレクト
  if (user) {
    return <LoadingPage message="リダイレクト中..." />;
  }

  return <>{children}</>;
}