'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { 
  UserIcon,
  CameraIcon,
  LockClosedIcon,
  BellIcon,
  ChartBarIcon,
  ClockIcon,
  AcademicCapIcon,
  TrophyIcon
} from '@heroicons/react/24/outline';

const profileSchema = z.object({
  displayName: z.string().min(1, '表示名を入力してください'),
  company: z.string().optional(),
  department: z.string().optional(),
  bio: z.string().max(500, '自己紹介は500文字以内で入力してください').optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, '現在のパスワードを入力してください'),
  newPassword: z.string().min(8, '新しいパスワードは8文字以上で入力してください'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "新しいパスワードが一致しません",
  path: ["confirmPassword"],
});

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

export default function ProfilePage() {
  const { user, updateProfile, changePassword } = useAuth();
  const [loading, setLoading] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('profile');
  const router = useRouter();

  // モック統計データ
  const mockStats = {
    totalCourses: 5,
    completedCourses: 2,
    totalWatchTime: 3600, // 1時間
    certificatesEarned: 2,
    currentStreak: 7,
    totalPoints: 1250,
  };

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: user?.profile?.display_name || '',
      company: user?.profile?.company || '',
      department: user?.profile?.department || '',
      bio: user?.profile?.bio || '',
    },
  });

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
  });

  useEffect(() => {
    if (user?.profile) {
      profileForm.reset({
        displayName: user.profile.display_name || '',
        company: user.profile.company || '',
        department: user.profile.department || '',
        bio: user.profile.bio || '',
      });
    }
  }, [user, profileForm]);

  const onProfileSubmit = async (data: ProfileFormData) => {
    try {
      setError(null);
      setSuccess(null);
      setLoading(true);

      const result = await updateProfile({
        display_name: data.displayName,
        company: data.company || null,
        department: data.department || null,
        bio: data.bio || null,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess('プロフィールを更新しました');
    } catch (err) {
      console.error('プロフィール更新エラー:', err);
      setError('予期しないエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const onPasswordSubmit = async (data: PasswordFormData) => {
    try {
      setError(null);
      setSuccess(null);
      setPasswordLoading(true);

      const result = await changePassword(data.newPassword);

      if (result.error) {
        setError(result.error);
        return;
      }

      setSuccess('パスワードを変更しました');
      passwordForm.reset();
    } catch (err) {
      console.error('パスワード変更エラー:', err);
      setError('予期しないエラーが発生しました');
    } finally {
      setPasswordLoading(false);
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

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* ヘッダー */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">プロフィール</h1>
            <p className="text-gray-600 dark:text-gray-400">アカウント設定と学習統計を管理できます。</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* サイドバー */}
            <div className="lg:col-span-1">
              <nav className="space-y-1">
                <button
                  onClick={() => setActiveTab('profile')}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'profile'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <UserIcon className="h-4 w-4 inline mr-2" />
                  基本情報
                </button>
                <button
                  onClick={() => setActiveTab('password')}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'password'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <LockClosedIcon className="h-4 w-4 inline mr-2" />
                  パスワード変更
                </button>
                <button
                  onClick={() => setActiveTab('stats')}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === 'stats'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  <ChartBarIcon className="h-4 w-4 inline mr-2" />
                  学習統計
                </button>
              </nav>
            </div>

            {/* メインコンテンツ */}
            <div className="lg:col-span-3">
              {/* 通知エリア */}
              {error && (
                <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 p-4">
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}

              {success && (
                <div className="mb-6 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 p-4">
                  <p className="text-sm text-green-700">{success}</p>
                </div>
              )}

              {/* プロフィール基本情報タブ */}
              {activeTab === 'profile' && (
                <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">基本情報</h2>
                  
                  {/* アバター */}
                  <div className="flex items-center mb-8">
                    <div className="relative">
                      <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center">
                        {user?.profile?.avatar_url ? (
                          <img
                            src={user.profile.avatar_url}
                            alt="アバター"
                            className="w-20 h-20 rounded-full object-cover"
                          />
                        ) : (
                          <UserIcon className="h-10 w-10 text-gray-500 dark:text-gray-400" />
                        )}
                      </div>
                      <button className="absolute bottom-0 right-0 w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center text-white hover:bg-blue-700">
                        <CameraIcon className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="ml-6">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                        {user?.profile?.display_name || 'ユーザー'}
                      </h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{user?.email}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        最終ログイン: {user?.profile?.last_login_at 
                          ? new Date(user.profile.last_login_at).toLocaleDateString('ja-JP') 
                          : '未記録'}
                      </p>
                    </div>
                  </div>

                  <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-6">
                    <Input
                      label="表示名"
                      placeholder="山田太郎"
                      error={profileForm.formState.errors.displayName?.message}
                      {...profileForm.register('displayName')}
                    />

                    <Input
                      label="会社名（任意）"
                      placeholder="株式会社サンプル"
                      error={profileForm.formState.errors.company?.message}
                      {...profileForm.register('company')}
                    />

                    <Input
                      label="部署名（任意）"
                      placeholder="営業部"
                      error={profileForm.formState.errors.department?.message}
                      {...profileForm.register('department')}
                    />

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        自己紹介（任意）
                      </label>
                      <textarea
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                        placeholder="自己紹介を入力してください..."
                        {...profileForm.register('bio')}
                      />
                      {profileForm.formState.errors.bio && (
                        <p className="mt-1 text-sm text-red-600">
                          {profileForm.formState.errors.bio.message}
                        </p>
                      )}
                    </div>

                    <div className="pt-4">
                      <Button
                        type="submit"
                        disabled={loading}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {loading ? '更新中...' : '更新する'}
                      </Button>
                    </div>
                  </form>
                </div>
              )}

              {/* パスワード変更タブ */}
              {activeTab === 'password' && (
                <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">パスワード変更</h2>
                  
                  <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-6">
                    <Input
                      type="password"
                      label="現在のパスワード"
                      placeholder="現在のパスワードを入力"
                      autoComplete="current-password"
                      error={passwordForm.formState.errors.currentPassword?.message}
                      {...passwordForm.register('currentPassword')}
                    />

                    <Input
                      type="password"
                      label="新しいパスワード"
                      placeholder="新しいパスワードを入力"
                      autoComplete="new-password"
                      error={passwordForm.formState.errors.newPassword?.message}
                      {...passwordForm.register('newPassword')}
                    />

                    <Input
                      type="password"
                      label="新しいパスワード確認"
                      placeholder="新しいパスワードを再入力"
                      autoComplete="new-password"
                      error={passwordForm.formState.errors.confirmPassword?.message}
                      {...passwordForm.register('confirmPassword')}
                    />

                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 rounded-lg p-4">
                      <h4 className="text-sm font-medium text-yellow-800 mb-2">パスワード要件</h4>
                      <ul className="text-sm text-yellow-700 space-y-1">
                        <li>• 8文字以上</li>
                        <li>• 英数字を組み合わせる</li>
                        <li>• 特殊文字を含むことを推奨</li>
                      </ul>
                    </div>

                    <div className="pt-4">
                      <Button
                        type="submit"
                        disabled={passwordLoading}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        {passwordLoading ? '変更中...' : 'パスワードを変更'}
                      </Button>
                    </div>
                  </form>
                </div>
              )}

              {/* 学習統計タブ */}
              {activeTab === 'stats' && (
                <div className="space-y-6">
                  <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">学習統計</h2>
                    
                    {/* 統計カード */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <ClockIcon className="h-5 w-5 text-blue-600" />
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-blue-600">
                              {formatWatchTime(mockStats.totalWatchTime)}
                            </p>
                            <p className="text-sm text-blue-600">総学習時間</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                            <TrophyIcon className="h-5 w-5 text-green-600" />
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-green-600">{mockStats.completedCourses}</p>
                            <p className="text-sm text-green-600">完了コース</p>
                          </div>
                        </div>
                      </div>

                      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                            <AcademicCapIcon className="h-5 w-5 text-purple-600" />
                          </div>
                          <div className="text-right">
                            <p className="text-2xl font-bold text-purple-600">{mockStats.certificatesEarned}</p>
                            <p className="text-sm text-purple-600">取得証明書</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 詳細統計 */}
                    <div className="space-y-4">
                      <div className="flex justify-between items-center py-3 border-b">
                        <span className="font-medium text-gray-900 dark:text-white">利用可能コース数</span>
                        <span className="text-gray-600 dark:text-gray-400">{mockStats.totalCourses}</span>
                      </div>
                      
                      <div className="flex justify-between items-center py-3 border-b">
                        <span className="font-medium text-gray-900 dark:text-white">完了率</span>
                        <span className="text-gray-600 dark:text-gray-400">
                          {Math.round((mockStats.completedCourses / mockStats.totalCourses) * 100)}%
                        </span>
                      </div>
                      
                      <div className="flex justify-between items-center py-3 border-b">
                        <span className="font-medium text-gray-900 dark:text-white">連続学習日数</span>
                        <span className="text-gray-600 dark:text-gray-400">{mockStats.currentStreak}日</span>
                      </div>
                      
                      <div className="flex justify-between items-center py-3">
                        <span className="font-medium text-gray-900 dark:text-white">獲得ポイント</span>
                        <span className="text-gray-600 dark:text-gray-400">{mockStats.totalPoints.toLocaleString()}pt</span>
                      </div>
                    </div>
                  </div>

                  {/* 最近の活動 */}
                  <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">最近の活動</h3>
                    <div className="text-center py-8">
                      <ChartBarIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600 dark:text-gray-400">学習活動を開始すると、ここに履歴が表示されます。</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}