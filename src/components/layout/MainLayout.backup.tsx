'use client';

import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/database/supabase';
import { useAuth } from '@/stores/auth';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
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
    
    // 10秒ごとに未読メッセージ数を更新
    const interval = setInterval(fetchUnreadMessages, 30000); // 30秒ごとにチェック（パフォーマンス最適化）
    
    return () => clearInterval(interval);
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
    <div className="min-h-screen bg-gray-50 dark:bg-black flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-25 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 liquid-glass-interactive shadow-lg dark:shadow-gray-900/50 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 lg:flex lg:flex-col ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Logo section */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200 dark:border-neutral-800 flex-shrink-0">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <span className="ml-2 text-xl font-semibold text-gray-900 dark:text-white">SKILLUP</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <XMarkIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
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
                className={`flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-colors ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border-r-2 border-blue-600 dark:border-blue-400'
                    : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
                onClick={() => setSidebarOpen(false)}
              >
                <Icon className={`h-5 w-5 mr-3 ${isActive ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400 dark:text-gray-500 dark:text-gray-400'}`} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-gray-200 dark:border-neutral-800 p-4 flex-shrink-0">
          <div className="flex items-center px-4 py-2">
            <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
              <UserCircleIcon className="h-6 w-6 text-gray-600 dark:text-gray-300" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-700 dark:text-gray-200">
                {user?.profile?.display_name || user?.email}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {user?.profile?.role === 'admin' ? '管理者' : '学習者'}
              </p>
            </div>
          </div>
          <button
            onClick={handleSignOut}
            className="w-full mt-2 flex items-center px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <ArrowRightOnRectangleIcon className="h-4 w-4 mr-2" />
            ログアウト
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col">
        {/* Top header */}
        <div className="sticky top-0 z-10 liquid-glass-interactive dark:bg-neutral-900 shadow-sm dark:shadow-gray-900/20 border-b border-gray-200 dark:border-neutral-800">
          <div className="flex items-center justify-between h-16 px-6">
            <div className="flex items-center">
              <button
                onClick={() => setSidebarOpen(true)}
                className="lg:hidden p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Bars3Icon className="h-6 w-6 text-gray-600 dark:text-gray-300" />
              </button>
              <div className="hidden lg:block ml-4">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400 dark:text-gray-500 dark:text-gray-400" />
                  <input
                    type="text"
                    placeholder="Course, theme, author..."
                    className="pl-10 pr-4 py-2 w-80 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="hidden lg:flex items-center text-sm text-gray-600 dark:text-gray-300">
                <span>{new Date().toLocaleDateString('ja-JP', {
                  weekday: 'long',
                  month: 'short',
                  day: 'numeric'
                })}</span>
              </div>
              
              {/* サポートチャット */}
              <Link
                href={isAdmin ? '/admin/support' : '/messages'}
                className="relative p-2 text-gray-400 dark:text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                title="サポートチャット"
              >
                <ChatBubbleLeftRightIcon className="h-5 w-5" />
                {unreadMessages > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full min-w-[18px] h-[18px] px-1 flex items-center justify-center font-bold">
                    {unreadMessages > 99 ? '99+' : unreadMessages}
                  </span>
                )}
              </Link>
              
              <button className="p-2 text-gray-400 dark:text-gray-500 dark:text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
                <BellIcon className="h-5 w-5" />
              </button>
              <ThemeToggle />
              <div className="flex items-center">
                <div className="w-8 h-8 bg-gray-300 dark:bg-gray-600 rounded-full flex items-center justify-center">
                  <UserCircleIcon className="h-6 w-6 text-gray-600 dark:text-gray-300" />
                </div>
                <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                  {user?.profile?.display_name || 'ユーザー'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="p-4 bg-gray-50 dark:bg-black min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>
    </div>
  );
}