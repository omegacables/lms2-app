'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import {
  ArrowLeftIcon,
  UserCircleIcon,
  EnvelopeIcon,
  BuildingOfficeIcon,
  BriefcaseIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';

interface UserData {
  id: string;
  email: string;
  display_name: string;
  company: string;
  department: string;
  role: 'student' | 'instructor' | 'admin';
  is_active: boolean;
}


export default function EditUserPage() {
  const { user } = useAuth();
  const router = useRouter();
  const params = useParams();
  const userId = params.id as string;
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [formData, setFormData] = useState({
    display_name: '',
    company: '',
    department: '',
    role: 'student' as 'student' | 'instructor' | 'admin',
    is_active: true
  });

  useEffect(() => {
    if (userId) {
      fetchUserData();
    }
  }, [userId]);

  const fetchUserData = async () => {
    try {
      setLoading(true);
      
      // ユーザー情報を取得
      const { data: profileData, error: profileError } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileError) throw profileError;

      // メールアドレスは auth.users から取得
      const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
      
      const email = authData?.user?.email || profileData.email || '';

      const userInfo = {
        id: profileData.id,
        email: email,
        display_name: profileData.display_name || '',
        company: profileData.company || '',
        department: profileData.department || '',
        role: profileData.role || 'student',
        is_active: profileData.is_active !== false
      };

      setUserData(userInfo);
      setFormData({
        display_name: userInfo.display_name,
        company: userInfo.company,
        department: userInfo.department,
        role: userInfo.role,
        is_active: userInfo.is_active
      });
    } catch (error) {
      console.error('ユーザー情報取得エラー:', error);
      // エラーが発生しても、プロフィールデータだけで続行
      try {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (profileData) {
          const userInfo = {
            id: profileData.id,
            email: profileData.email || '',
            display_name: profileData.display_name || '',
            company: profileData.company || '',
            department: profileData.department || '',
            role: profileData.role || 'student',
            is_active: profileData.is_active !== false
          };

          setUserData(userInfo);
          setFormData({
            display_name: userInfo.display_name,
            company: userInfo.company,
            department: userInfo.department,
            role: userInfo.role,
            is_active: userInfo.is_active
          });
        }
      } catch (fallbackError) {
        alert('ユーザー情報の取得に失敗しました');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.id) {
      alert('認証エラー: 管理者としてログインしてください');
      return;
    }

    if (!formData.display_name) {
      alert('表示名は必須です');
      return;
    }

    setSaving(true);
    
    try {
      const { error } = await supabase
        .from('user_profiles')
        .update({
          display_name: formData.display_name,
          company: formData.company,
          department: formData.department,
          role: formData.role,
          is_active: formData.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) throw error;

      alert('ユーザー情報を更新しました');
      router.push('/admin/users');
    } catch (error) {
      console.error('更新エラー:', error);
      alert('ユーザー情報の更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

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

  if (!userData) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="container mx-auto px-4 py-8">
            <div className="text-center">
              <p className="text-gray-600 dark:text-gray-400">ユーザーが見つかりません</p>
              <Link href="/admin/users">
                <Button className="mt-4">ユーザー一覧に戻る</Button>
              </Link>
            </div>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 py-8">
          {/* ヘッダー */}
          <div className="mb-8">
            <Link href="/admin/users">
              <Button variant="ghost" size="sm" className="mb-4">
                <ArrowLeftIcon className="h-4 w-4 mr-2" />
                ユーザー一覧に戻る
              </Button>
            </Link>
            
            <div className="flex items-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                <UserCircleIcon className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">ユーザー編集</h1>
                <p className="text-gray-600 dark:text-gray-400">ユーザー情報を更新します。</p>
              </div>
            </div>
          </div>

          {/* フォーム */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
              {/* メールアドレス（読み取り専用） */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <EnvelopeIcon className="inline h-4 w-4 mr-1" />
                  メールアドレス
                </label>
                <Input
                  type="email"
                  value={userData.email}
                  disabled
                  className="bg-gray-50 dark:bg-black"
                />
              </div>

              {/* 表示名 */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <UserCircleIcon className="inline h-4 w-4 mr-1" />
                  表示名 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  placeholder="山田 太郎"
                  required
                />
              </div>

              {/* 会社名 */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <BuildingOfficeIcon className="inline h-4 w-4 mr-1" />
                  会社名
                </label>
                <Input
                  type="text"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="株式会社〇〇"
                />
              </div>

              {/* 部署 */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <BriefcaseIcon className="inline h-4 w-4 mr-1" />
                  部署
                </label>
                <Input
                  type="text"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  placeholder="営業部"
                />
              </div>

              {/* ロール */}
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  <ShieldCheckIcon className="inline h-4 w-4 mr-1" />
                  ロール
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                >
                  <option value="student">受講者</option>
                  <option value="instructor">講師</option>
                  <option value="admin">管理者</option>
                </select>
              </div>

              {/* ステータス */}
              <div className="mb-6">
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">アクティブ</span>
                </label>
              </div>

              {/* ボタン */}
              <div className="flex justify-end space-x-4">
                <Link href="/admin/users">
                  <Button variant="outline" disabled={saving}>
                    キャンセル
                  </Button>
                </Link>
                <Button type="submit" disabled={saving}>
                  {saving ? (
                    <>
                      <LoadingSpinner size="sm" className="mr-2" />
                      保存中...
                    </>
                  ) : (
                    '変更を保存'
                  )}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}