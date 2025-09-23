'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/database/supabase';
import { useAuth } from '@/stores/auth';
import { ThemeToggleSwitch } from '@/components/ui/ThemeToggleSwitch';
import { messageEvents } from '@/lib/utils/events';
import { 
  HomeIcon,
  AcademicCapIcon,
  ChartBarIcon,
  UserGroupIcon,
  DocumentTextIcon,
  Cog6ToothIcon,
  BookOpenIcon,
  TrophyIcon,
  ClipboardDocumentListIcon,
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  XMarkIcon,
  MagnifyingGlassIcon,
  BellIcon,
  UserCircleIcon,
  MoonIcon,
  SunIcon,
  ChatBubbleLeftRightIcon
} from '@heroicons/react/24/outline';
import { 
  HomeIcon as HomeIconSolid,
  AcademicCapIcon as AcademicCapIconSolid,
  ChartBarIcon as ChartBarIconSolid,
  UserGroupIcon as UserGroupIconSolid,
  DocumentTextIcon as DocumentTextIconSolid,
  Cog6ToothIcon as Cog6ToothIconSolid,
  BookOpenIcon as BookOpenIconSolid,
  TrophyIcon as TrophyIconSolid,
  ClipboardDocumentListIcon as ClipboardDocumentListIconSolid
} from '@heroicons/react/24/solid';

interface MainLayoutProps {
  children: React.ReactNode;
}

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ForwardRefExoticComponent<any>;
  iconActive: React.ForwardRefExoticComponent<any>;
  roles?: string[];
}

const navigation: NavigationItem[] = [
  {
    name: 'ダッシュボード',
    href: '/dashboard',
    icon: HomeIcon,
    iconActive: HomeIconSolid
  },
  {
    name: 'マイコース',
    href: '/my-courses',
    icon: AcademicCapIcon,
    iconActive: AcademicCapIconSolid
  },
  {
    name: '課題',
    href: '/homework',
    icon: ClipboardDocumentListIcon,
    iconActive: ClipboardDocumentListIconSolid
  },
  { 
    name: '証明書', 
    href: '/certificates', 
    icon: TrophyIcon, 
    iconActive: TrophyIconSolid 
  },
  { 
    name: 'メッセージ', 
    href: '/messages', 
    icon: UserCircleIcon, 
    iconActive: UserCircleIcon 
  },
  { 
    name: '設定', 
    href: '/settings', 
    icon: Cog6ToothIcon, 
    iconActive: Cog6ToothIconSolid 
  },
];

const adminNavigation: NavigationItem[] = [
  { 
    name: '管理ダッシュボード', 
    href: '/admin', 
    icon: HomeIcon, 
    iconActive: HomeIconSolid 
  },
  { 
    name: '生徒管理', 
    href: '/admin/students', 
    icon: UserGroupIcon, 
    iconActive: UserGroupIconSolid 
  },
  { 
    name: 'コース管理', 
    href: '/admin/courses', 
    icon: AcademicCapIcon, 
    iconActive: AcademicCapIconSolid 
  },
  { 
    name: '証明書管理', 
    href: '/admin/certificates', 
    icon: TrophyIcon, 
    iconActive: TrophyIconSolid 
  },
  { 
    name: '学習ログ', 
    href: '/admin/learning-logs', 
    icon: ChartBarIcon, 
    iconActive: ChartBarIconSolid 
  },
  { 
    name: 'システム設定', 
    href: '/admin/settings', 
    icon: Cog6ToothIcon, 
    iconActive: Cog6ToothIconSolid 
  },
];

export function MainLayout({ children }: MainLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const { user, isAdmin, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const currentNavigation = isAdmin ? adminNavigation : navigation;

  // 未読メッセージ数を取得
  const fetchUnreadMessages = async () => {
    if (!user?.id) return;

    try {
      if (isAdmin) {
        // 管理者の場合：生徒からの未読メッセージ数
        const { count } = await supabase
          .from('support_messages')
          .select('*', { count: 'exact', head: true })
          .eq('sender_type', 'student')
          .eq('is_read', false);
        
        setUnreadMessages(count || 0);
      } else {
        // 生徒の場合：管理者からの未読メッセージ数
        const { count } = await supabase
          .from('support_messages')
          .select('*', { count: 'exact', head: true })
          .eq('sender_type', 'admin')
          .eq('is_read', false)
          .in('conversation_id', 
            // 自分の会話IDのみを対象とする
            await supabase
              .from('support_conversations')
              .select('id')
              .eq('student_id', user.id)
              .then(({ data }) => data?.map(conv => conv.id) || [])
          );
        
        setUnreadMessages(count || 0);
      }
    } catch (error) {
      console.error('未読メッセージ数取得エラー:', error);
    }
  };

  useEffect(() => {
    fetchUnreadMessages();

    // 30秒ごとに未読メッセージ数を更新
    const interval = setInterval(fetchUnreadMessages, 30000); // 30秒ごとにチェック（パフォーマンス最適化）

    // メッセージ既読イベントをリッスン
    const handleMessageRead = () => {
      fetchUnreadMessages();
    };
    messageEvents.on('message-read', handleMessageRead);

    return () => {
      clearInterval(interval);
      messageEvents.off('message-read', handleMessageRead);
    };
  }, [user?.id, isAdmin]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/auth/login');
  };

  const isActivePath = (href: string) => {
    if (href === '/dashboard' || href === '/admin') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-zinc-950 border-r border-zinc-950/10 dark:border-white/10 transform transition-transform duration-200 ease-out lg:relative lg:translate-x-0 lg:flex lg:flex-col lg:z-30 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Logo section */}
        <div className="flex items-center gap-x-3 px-6 py-5 border-b border-zinc-950/5 dark:border-white/5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm">
            <span className="text-lg font-bold">S</span>
          </div>
          <div className="flex flex-col">
            <span className="text-base font-semibold text-zinc-950 dark:text-white">SKILLUP</span>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Learning Platform</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="ml-auto lg:hidden -mr-2 p-2 text-zinc-500 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-300"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex flex-1 flex-col gap-y-1 overflow-y-auto px-4 py-4">
          {currentNavigation.map((item) => {
            const isActive = isActivePath(item.href);
            const Icon = isActive ? item.iconActive : item.icon;

            // ロール制限チェック
            if (item.roles && !item.roles.includes(user?.profile?.role || 'student')) {
              return null;
            }

            return (
              <Link
                key={item.name}
                href={item.href}
                className={`group relative flex items-center gap-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-zinc-950/5 dark:bg-white/5 text-zinc-950 dark:text-white'
                    : 'text-zinc-700 hover:bg-zinc-950/5 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white'
                }`}
                onClick={() => setSidebarOpen(false)}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                  isActive
                    ? 'text-zinc-950 dark:text-white'
                    : 'text-zinc-500 group-hover:text-zinc-700 dark:text-zinc-400 dark:group-hover:text-zinc-300'
                }`}>
                  <Icon className="h-4 w-4" />
                </span>
                <span className="truncate">{item.name}</span>
                {isActive && (
                  <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-zinc-950 dark:bg-white" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-zinc-950/5 dark:border-white/5 p-4">
          <div className="flex items-center gap-x-3 rounded-lg px-3 py-2 hover:bg-zinc-950/5 dark:hover:bg-white/5 transition-colors">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
              <UserCircleIcon className="h-6 w-6 text-zinc-600 dark:text-zinc-400" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-950 dark:text-white">
                {user?.profile?.display_name || user?.email}
              </p>
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {user?.profile?.role === 'admin' ? '管理者' : '学習者'}
              </p>
            </div>
          </div>

          {/* テーマ切り替え (モバイル用) */}
          <div className="lg:hidden px-3 py-2 border-t border-zinc-950/5 dark:border-white/5 mt-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                ダークモード
              </span>
              <ThemeToggleSwitch />
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="mt-2 flex w-full items-center gap-x-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-900/20 dark:hover:text-red-300 transition-colors"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center">
              <ArrowRightOnRectangleIcon className="h-4 w-4" />
            </span>
            <span>ログアウト</span>
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Top header */}
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center gap-x-6 border-b border-zinc-950/10 dark:border-white/10 bg-white/95 dark:bg-zinc-950/95 backdrop-blur px-6">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden -ml-2 p-2 text-zinc-500 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-300"
            >
              <Bars3Icon className="h-6 w-6" />
            </button>

            <div className="flex flex-1 items-center gap-x-4">
              <div className="hidden lg:block">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="検索..."
                    className="w-80 rounded-lg border-0 bg-zinc-950/5 dark:bg-white/5 py-2 pl-10 pr-4 text-sm text-zinc-950 placeholder:text-zinc-500 dark:text-white dark:placeholder:text-zinc-400 focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-x-4">
              <div className="hidden lg:flex items-center text-sm text-zinc-600 dark:text-zinc-400">
                <span>{new Date().toLocaleDateString('ja-JP', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric'
                })}</span>
              </div>

              {/* サポートチャット */}
              <Link
                href={isAdmin ? '/admin/support' : '/messages'}
                className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-300 transition-colors"
                title="サポートチャット"
              >
                <ChatBubbleLeftRightIcon className="h-5 w-5" />
                {unreadMessages > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                    {unreadMessages > 99 ? '99+' : unreadMessages}
                  </span>
                )}
              </Link>

              <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-300 transition-colors">
                <BellIcon className="h-5 w-5" />
              </button>

              <ThemeToggleSwitch />

              <div className="flex items-center gap-x-3">
                <span className="hidden lg:block text-sm font-medium text-zinc-950 dark:text-white">
                  {user?.profile?.display_name || 'ユーザー'}
                </span>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                  <UserCircleIcon className="h-5 w-5 text-zinc-600 dark:text-zinc-400" />
                </span>
              </div>
            </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 bg-zinc-50 dark:bg-zinc-900">
          {children}
        </main>
      </div>
    </div>
  );
}