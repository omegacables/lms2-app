'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/Button';
import { 
  HomeIcon, 
  BookOpenIcon, 
  UserIcon, 
  Bars3Icon,
  XMarkIcon,
  AcademicCapIcon,
  ChartBarIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  UsersIcon
} from '@heroicons/react/24/outline';

export function Header() {
  const { user, signOut, isAdmin } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth/login');
  };

  // クリック外部でメニューを閉じる
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // 学習者向けナビゲーション
  const studentNavigation = [
    { name: 'ダッシュボード', href: '/dashboard', icon: HomeIcon },
    { name: 'コース', href: '/courses', icon: BookOpenIcon },
    { name: '進捗', href: '/progress', icon: ChartBarIcon },
    { name: '証明書', href: '/certificates', icon: AcademicCapIcon },
  ];

  // 管理者向けナビゲーション（学習者機能も含む）
  const adminNavigation = [
    { name: 'ダッシュボード', href: '/dashboard', icon: HomeIcon },
    { name: 'コース', href: '/courses', icon: BookOpenIcon },
    { name: '管理者', href: '/admin', icon: Cog6ToothIcon },
    { name: '生徒管理', href: '/admin/students', icon: UsersIcon },
  ];

  // 現在のユーザーに応じたナビゲーションを選択
  const navigation = isAdmin ? adminNavigation : studentNavigation;

  const isCurrentPath = (href: string) => pathname === href;

  return (
    <header className="liquid-glass-interactive dark:bg-neutral-900 border-b border-gray-200 dark:border-neutral-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* ロゴ */}
          <div className="flex items-center">
            <Link href="/dashboard" className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <AcademicCapIcon className="h-5 w-5 text-white" />
              </div>
              <span className="text-xl font-bold text-gray-900 dark:text-white">LMS</span>
            </Link>
          </div>

          {/* デスクトップナビゲーション */}
          {user && (
            <nav className="hidden md:flex space-x-8">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                      isCurrentPath(item.href)
                        ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.name}
                  </Link>
                );
              })}
            </nav>
          )}

          {/* ユーザーメニュー */}
          <div className="flex items-center space-x-4">
            {user ? (
              <>
                {/* ユーザードロップダウン */}
                <div className="relative hidden md:block" ref={userMenuRef}>
                  <button
                    type="button"
                    className="flex items-center space-x-3 text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                  >
                    <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                      <UserIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900 dark:text-white">
                        {user.profile?.display_name || user.email}
                      </p>
                      <p className="text-gray-500 dark:text-gray-400 text-xs">
                        {isAdmin ? '管理者' : '学習者'}
                      </p>
                    </div>
                  </button>

                  {/* ドロップダウンメニュー */}
                  {userMenuOpen && (
                    <div className="absolute right-0 mt-2 w-48 liquid-glass-interactive rounded-md shadow-lg dark:shadow-gray-900/50 py-1 border border-gray-200 dark:border-neutral-800 z-50">
                      <Link
                        href="/profile"
                        className="block px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                        onClick={() => setUserMenuOpen(false)}
                      >
                        <UserIcon className="h-4 w-4 inline mr-2" />
                        プロフィール
                      </Link>
                      <div className="border-t border-gray-100"></div>
                      <button
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleSignOut();
                        }}
                        className="block w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        ログアウト
                      </button>
                    </div>
                  )}
                </div>

                {/* モバイルメニューボタン */}
                <button
                  type="button"
                  className="md:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700"
                  onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                >
                  {mobileMenuOpen ? (
                    <XMarkIcon className="h-6 w-6" />
                  ) : (
                    <Bars3Icon className="h-6 w-6" />
                  )}
                </button>
              </>
            ) : (
              <Link href="/auth/login">
                <Button variant="primary" size="sm">
                  ログイン
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* モバイルメニュー */}
      {user && mobileMenuOpen && (
        <div className="md:hidden">
          <div className="px-2 pt-2 pb-3 space-y-1 liquid-glass-interactive border-t border-gray-200 dark:border-neutral-800">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center px-3 py-2 text-base font-medium rounded-md ${
                    isCurrentPath(item.href)
                      ? 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Icon className="h-5 w-5 mr-3" />
                  {item.name}
                </Link>
              );
            })}
            
            {/* モバイル用ユーザー情報 */}
            <div className="px-3 py-2 border-t border-gray-200 dark:border-neutral-800 mt-3">
              <div className="flex items-center space-x-3 mb-3">
                <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                  <UserIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {user.profile?.display_name || user.email}
                  </p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {isAdmin ? '管理者' : '学習者'}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Link href="/profile" onClick={() => setMobileMenuOpen(false)}>
                  <Button variant="outline" size="sm" className="w-full justify-start">
                    <UserIcon className="h-4 w-4 mr-2" />
                    プロフィール
                  </Button>
                </Link>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleSignOut}
                  className="w-full"
                >
                  ログアウト
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}