'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/lib/database/supabase';
import {
  UsersIcon,
  MagnifyingGlassIcon,
  AdjustmentsHorizontalIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  CheckCircleIcon,
  XCircleIcon,
  UserIcon,
  ShieldCheckIcon,
  AcademicCapIcon,
  FolderIcon,
  LockClosedIcon,
  LockOpenIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/outline';
import {
  CheckCircleIcon as CheckCircleIconSolid,
  LockClosedIcon as LockClosedIconSolid
} from '@heroicons/react/24/solid';
import type { Tables } from '@/lib/database/supabase';

type UserProfile = Tables<'user_profiles'> & {
  email?: string;
  courseProgress?: {
    totalCourses: number;
    completedCourses: number;
    totalWatchTime: number;
  };
};

interface Course {
  id: number;
  title: string;
  description: string;
  category: string;
  difficulty_level: string;
  estimated_duration: number;
  status: string;
}

interface CourseGroup {
  id: number;
  title: string;
  description: string | null;
  is_sequential: boolean;
  items?: Array<{
    id: number;
    course_id: number;
    order_index: number;
    progress?: number;
    isCompleted?: boolean;
    isUnlocked?: boolean;
    course: Course;
  }>;
}

interface GroupEnrollment {
  id: number;
  user_id: string;
  group_id: number;
  enrolled_at: string;
  enrolled_by: string | null;
  group: CourseGroup;
  enrolled_by_user?: { display_name: string };
}

export default function AdminUsersPage() {
  const { user, isAdmin } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);

  // グループ割当関連
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  const [allGroups, setAllGroups] = useState<CourseGroup[]>([]);
  const [userEnrolledGroups, setUserEnrolledGroups] = useState<Map<string, number[]>>(new Map());
  const [loadingGroups, setLoadingGroups] = useState<Set<string>>(new Set());
  const [savingGroupChanges, setSavingGroupChanges] = useState<Set<string>>(new Set());

  // 管理者チェック
  if (!isAdmin && user) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="max-w-2xl mx-auto px-4 py-16 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">アクセス権限がありません</h1>
            <Link href="/dashboard">
              <Button>ダッシュボードに戻る</Button>
            </Link>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  useEffect(() => {
    fetchUsers();
    fetchAllGroups();
  }, []);

  // 全グループを取得
  const fetchAllGroups = async () => {
    try {
      const { data: groupsData, error } = await supabase
        .from('course_groups')
        .select('id, title, description, is_sequential')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('グループ取得エラー:', error);
      } else {
        setAllGroups(groupsData || []);
      }
    } catch (error) {
      console.error('グループ取得エラー:', error);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);

      // 全ユーザーを取得
      const { data: usersData, error } = await supabase
        .from('user_profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('ユーザーデータ取得エラー:', error);
        return;
      }

      // emailがない場合はauth.usersから取得
      const usersWithEmail = await Promise.all(
        (usersData || []).map(async (user) => {
          if (!user.email) {
            const { data: authData } = await supabase
              .from('auth.users')
              .select('email')
              .eq('id', user.id)
              .single();

            if (authData?.email) {
              // user_profilesにemailを更新
              await supabase
                .from('user_profiles')
                .update({ email: authData.email })
                .eq('id', user.id);

              return { ...user, email: authData.email };
            }
          }
          return user;
        })
      );

      // 各ユーザーの学習統計を取得
      const usersWithStats = await Promise.all(
        usersWithEmail.map(async (user) => {
          try {
            // 割り当てられたコースを取得
            const { data: assignedCoursesData } = await supabase
              .from('user_course_assignments')
              .select('course_id')
              .eq('user_id', user.id);

            const assignedCourses = assignedCoursesData?.map(a => a.course_id) || [];

            const { data: progressData } = await supabase
              .from('video_view_logs')
              .select('*')
              .eq('user_id', user.id);

            const totalCourses = assignedCourses.length;
            const completedCourses = progressData?.filter(p => p.status === 'completed').length || 0;
            const totalWatchTime = progressData?.reduce((sum, p) => sum + (p.total_watched_time || 0), 0) || 0;

            return {
              ...user,
              courseProgress: {
                totalCourses,
                completedCourses,
                totalWatchTime
              }
            };
          } catch (err) {
            console.error('統計取得エラー:', err);
            return {
              ...user,
              courseProgress: {
                totalCourses: 0,
                completedCourses: 0,
                totalWatchTime: 0
              }
            };
          }
        })
      );

      setUsers(usersWithStats);
    } catch (error) {
      console.error('ユーザーデータ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStatusToggle = async (userId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ is_active: !currentStatus })
        .eq('id', userId);

      if (error) {
        console.error('ユーザーステータス更新エラー:', error);
        return;
      }

      // 状態を更新
      setUsers(users.map(user => 
        user.id === userId ? { ...user, is_active: !currentStatus } : user
      ));
    } catch (error) {
      console.error('ユーザーステータス更新エラー:', error);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`本当に「${userName}」を削除しますか？\nこの操作は取り消せません。`)) {
      return;
    }

    try {
      // Supabaseセッションからトークンを取得
      const { data: { session } } = await supabase.auth.getSession();

      const response = await fetch(`/api/admin/users/${userId}/delete`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
      });

      const data = await response.json();

      if (response.ok) {
        if (data.partialSuccess) {
          alert(`ユーザーデータは削除されましたが、認証情報の削除には手動操作が必要です。\n\n${data.error || data.message}`);
        } else {
          alert('ユーザーが正常に削除されました。');
        }
        // リストを更新
        await fetchUsers();
      } else {
        alert(`削除に失敗しました: ${data.error || 'エラーが発生しました'}`);
      }
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除中にエラーが発生しました。');
    }
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({ role: newRole })
        .eq('id', userId);

      if (error) {
        console.error('ユーザーロール更新エラー:', error);
        return;
      }

      // 状態を更新
      setUsers(users.map(user =>
        user.id === userId ? { ...user, role: newRole } : user
      ));
    } catch (error) {
      console.error('ユーザーロール更新エラー:', error);
    }
  };

  // トグルを開く/閉じる
  const handleToggleUser = async (userId: string) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
      setExpandedUsers(newExpanded);
    } else {
      newExpanded.add(userId);
      setExpandedUsers(newExpanded);
      // 初回展開時にグループ情報を取得
      if (!userEnrolledGroups.has(userId)) {
        await fetchUserEnrolledGroups(userId);
      }
    }
  };

  // ユーザーの登録済みグループを取得
  const fetchUserEnrolledGroups = async (userId: string) => {
    try {
      setLoadingGroups(new Set(loadingGroups).add(userId));

      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/admin/users/${userId}/group-enrollments`, {
        headers: {
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const enrolledGroupIds = (data.data || []).map((e: GroupEnrollment) => e.group_id);
        setUserEnrolledGroups(new Map(userEnrolledGroups).set(userId, enrolledGroupIds));
      }
    } catch (error) {
      console.error('グループ取得エラー:', error);
    } finally {
      const newLoading = new Set(loadingGroups);
      newLoading.delete(userId);
      setLoadingGroups(newLoading);
    }
  };

  // グループのチェック状態を変更
  const handleGroupCheckChange = async (userId: string, groupId: number, isChecked: boolean) => {
    try {
      setSavingGroupChanges(new Set(savingGroupChanges).add(userId));
      const { data: { session } } = await supabase.auth.getSession();

      if (isChecked) {
        // グループを追加
        const response = await fetch(`/api/admin/users/${userId}/group-enrollments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
          },
          body: JSON.stringify({ groupIds: [groupId] }),
        });

        if (response.ok) {
          // 成功したら状態を更新
          const currentEnrolled = userEnrolledGroups.get(userId) || [];
          setUserEnrolledGroups(new Map(userEnrolledGroups).set(userId, [...currentEnrolled, groupId]));
        } else {
          const data = await response.json();
          alert(`エラー: ${data.error || '割り当てに失敗しました'}`);
        }
      } else {
        // グループを解除
        const response = await fetch(`/api/admin/users/${userId}/group-enrollments`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
          },
          body: JSON.stringify({ groupId }),
        });

        if (response.ok) {
          // 成功したら状態を更新
          const currentEnrolled = userEnrolledGroups.get(userId) || [];
          setUserEnrolledGroups(new Map(userEnrolledGroups).set(userId, currentEnrolled.filter(id => id !== groupId)));
        } else {
          const data = await response.json();
          alert(`エラー: ${data.error || '解除に失敗しました'}`);
        }
      }
    } catch (error) {
      console.error('グループ変更エラー:', error);
      alert('グループ変更中にエラーが発生しました');
    } finally {
      const newSaving = new Set(savingGroupChanges);
      newSaving.delete(userId);
      setSavingGroupChanges(newSaving);
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <ShieldCheckIcon className="h-4 w-4" />;
      case 'instructor':
        return <AcademicCapIcon className="h-4 w-4" />;
      case 'student':
        return <UserIcon className="h-4 w-4" />;
      default:
        return <UserIcon className="h-4 w-4" />;
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'admin':
        return '管理者';
      case 'instructor':
        return '講師';
      case 'student':
        return '受講者';
      default:
        return '未設定';
    }
  };

  const getRoleColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800';
      case 'instructor':
        return 'bg-blue-100 text-blue-800';
      case 'student':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 dark:bg-neutral-900 text-gray-800 dark:text-gray-200';
    }
  };

  const formatWatchTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}時間${minutes}分`;
    }
    return `${minutes}分`;
  };


  const filteredUsers = users.filter(user => {
    const matchesSearch = user.display_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         user.company?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesRole = selectedRole === 'all' || user.role === selectedRole;
    const matchesStatus = selectedStatus === 'all' || 
                         (selectedStatus === 'active' && user.is_active) ||
                         (selectedStatus === 'inactive' && !user.is_active);
    
    return matchesSearch && matchesRole && matchesStatus;
  });

  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  if (loading) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="container mx-auto px-4 py-8">
            <div className="flex justify-center items-center min-h-64">
              <LoadingSpinner size="lg" />
            </div>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* ヘッダーセクション */}
          <div className="mb-8">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                  <UsersIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">生徒管理</h1>
                  <p className="text-gray-600 dark:text-gray-400">学習者の情報と進捗を管理できます。</p>
                </div>
              </div>
              <Link href="/admin/users/new">
                <Button className="bg-blue-600 hover:bg-blue-700 flex items-center">
                  <PlusIcon className="h-4 w-4 mr-2" />
                  新規ユーザー
                </Button>
              </Link>
            </div>
          </div>

          {/* 統計サマリー */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <UsersIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">総ユーザー数</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{users.length}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircleIcon className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">アクティブユーザー</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {users.filter(u => u.is_active).length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <AcademicCapIcon className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">講師</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {users.filter(u => u.role === 'instructor').length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <ShieldCheckIcon className="h-6 w-6 text-red-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">管理者</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {users.filter(u => u.role === 'admin').length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 検索・フィルターセクション */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6 mb-8">
            <div className="grid gap-4 md:grid-cols-4">
              {/* 検索 */}
              <div className="relative md:col-span-2">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="ユーザーを検索..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* ロールフィルター */}
              <select
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
              >
                <option value="all">すべてのロール</option>
                <option value="student">受講者</option>
                <option value="instructor">講師</option>
                <option value="admin">管理者</option>
              </select>

              {/* ステータスフィルター */}
              <select
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
              >
                <option value="all">すべてのステータス</option>
                <option value="active">アクティブ</option>
                <option value="inactive">非アクティブ</option>
              </select>
            </div>
          </div>

          {/* ユーザー一覧 */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 dark:bg-black">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      ユーザー
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      会社・部署
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      ロール
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      学習状況
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      最終ログイン
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      ステータス
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200">
                  {paginatedUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
                            {user.avatar_url ? (
                              <img
                                src={user.avatar_url}
                                alt={user.display_name || ''}
                                className="w-10 h-10 rounded-full object-cover"
                              />
                            ) : (
                              <UserIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                            )}
                          </div>
                          <div className="ml-4">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {user.display_name}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900 dark:text-white">{user.company || '-'}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{user.department || '-'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <select
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}
                          value={user.role}
                          onChange={(e) => handleRoleChange(user.id, e.target.value)}
                        >
                          <option value="student">受講者</option>
                          <option value="instructor">講師</option>
                          <option value="admin">管理者</option>
                        </select>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        <div>完了: {user.courseProgress?.completedCourses || 0} / {user.courseProgress?.totalCourses || 0}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          視聴: {user.courseProgress ? formatWatchTime(user.courseProgress.totalWatchTime) : '0分'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {user.last_login_at 
                          ? new Date(user.last_login_at).toLocaleDateString('ja-JP')
                          : '未ログイン'
                        }
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <button
                          onClick={() => handleStatusToggle(user.id, user.is_active)}
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            user.is_active
                              ? 'bg-green-100 text-green-800'
                              : 'bg-red-100 text-red-800'
                          }`}
                        >
                          {user.is_active ? (
                            <>
                              <CheckCircleIcon className="h-3 w-3 mr-1" />
                              アクティブ
                            </>
                          ) : (
                            <>
                              <XCircleIcon className="h-3 w-3 mr-1" />
                              非アクティブ
                            </>
                          )}
                        </button>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex justify-end space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            title="コース割当"
                            onClick={() => handleToggleUser(user.id)}
                          >
                            {expandedUsers.has(user.id) ? (
                              <ChevronUpIcon className="h-4 w-4" />
                            ) : (
                              <ChevronDownIcon className="h-4 w-4" />
                            )}
                          </Button>
                          <Link href={`/admin/users/${user.id}`}>
                            <Button variant="outline" size="sm" title="詳細">
                              <EyeIcon className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Link href={`/admin/users/${user.id}/edit`}>
                            <Button variant="outline" size="sm" title="編集">
                              <PencilIcon className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteUser(user.id, user.display_name || user.email || '')}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="削除"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>

                    {/* グループ割当展開エリア */}
                    {expandedUsers.has(user.id) && (
                      <tr>
                        <td colSpan={7} className="px-6 py-4 bg-gray-50 dark:bg-neutral-800">
                          <div className="max-w-4xl">
                            <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
                              <FolderIcon className="h-4 w-4 mr-2" />
                              コースグループ割当
                            </h4>

                            {loadingGroups.has(user.id) ? (
                              <div className="flex items-center justify-center py-8">
                                <LoadingSpinner size="md" />
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {allGroups.length === 0 ? (
                                  <div className="col-span-2 text-center py-6 text-gray-500 dark:text-gray-400">
                                    <p>利用可能なグループがありません</p>
                                  </div>
                                ) : (
                                  allGroups.map((group) => {
                                    const isEnrolled = userEnrolledGroups.get(user.id)?.includes(group.id) || false;
                                    const isSaving = savingGroupChanges.has(user.id);

                                    return (
                                      <label
                                        key={group.id}
                                        className={`
                                          flex items-start p-3 border rounded-lg cursor-pointer transition-all
                                          ${isEnrolled
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                            : 'border-gray-200 dark:border-neutral-700 hover:border-gray-300 dark:hover:border-neutral-600'
                                          }
                                          ${isSaving ? 'opacity-50 cursor-wait' : ''}
                                        `}
                                      >
                                        <input
                                          type="checkbox"
                                          checked={isEnrolled}
                                          onChange={(e) => handleGroupCheckChange(user.id, group.id, e.target.checked)}
                                          disabled={isSaving}
                                          className="mt-1 h-4 w-4 text-blue-600 rounded focus:ring-blue-500"
                                        />
                                        <div className="ml-3 flex-1 min-w-0">
                                          <div className="flex items-center gap-2">
                                            <h5 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                                              {group.title}
                                            </h5>
                                            {group.is_sequential ? (
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300">
                                                <LockClosedIcon className="h-2.5 w-2.5 mr-0.5" />
                                                順次
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                                                <LockOpenIcon className="h-2.5 w-2.5 mr-0.5" />
                                                自由
                                              </span>
                                            )}
                                          </div>
                                          {group.description && (
                                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 line-clamp-2">
                                              {group.description}
                                            </p>
                                          )}
                                        </div>
                                      </label>
                                    );
                                  })
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ページネーション */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-between">
              <div className="text-sm text-gray-700 dark:text-gray-300">
                {filteredUsers.length} 件中 {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredUsers.length)} 件を表示
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                >
                  前へ
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                >
                  次へ
                </Button>
              </div>
            </div>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}