'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/lib/database/supabase';
import {
  ArrowLeftIcon,
  UserPlusIcon,
  EnvelopeIcon,
  UserCircleIcon,
  BuildingOfficeIcon,
  BriefcaseIcon,
  KeyIcon,
  EyeIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline';

interface NewUserForm {
  email: string;
  password: string;
  display_name: string;
  company: string;
  department: string;
  role: 'student' | 'instructor' | 'admin';
  is_active: boolean;
}

export default function NewUserPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState<NewUserForm>({
    email: '',
    password: '',
    display_name: '',
    company: '',
    department: '',
    role: 'student',
    is_active: true
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user?.id) {
      alert('認証エラー: 管理者としてログインしてください');
      return;
    }

    // Validate form
    if (!formData.email || !formData.password || !formData.display_name) {
      alert('必須項目を入力してください');
      return;
    }

    if (formData.password.length < 6) {
      alert('パスワードは6文字以上で入力してください');
      return;
    }

    setLoading(true);
    
    try {
      // 管理者専用のユーザー作成関数を使用（メール認証不要）
      const { data: newUserId, error: createError } = await supabase.rpc('create_user_with_profile', {
        p_email: formData.email,
        p_password: formData.password,
        p_display_name: formData.display_name,
        p_company: formData.company,
        p_department: formData.department,
        p_role: formData.role,
        p_is_active: formData.is_active
      });

      if (createError) {
        console.error('ユーザー作成エラー:', createError);
        
        // フォールバック: 通常のサインアップを試す
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              display_name: formData.display_name,
              role: formData.role
            }
          }
        });

        if (authError) {
          throw new Error(`ユーザー作成エラー: ${authError.message}`);
        }

        if (!authData.user) {
          throw new Error('ユーザーデータが作成されませんでした');
        }

        // プロフィールを作成/更新
        const { data: existingProfile } = await supabase
          .from('user_profiles')
          .select('id')
          .eq('id', authData.user.id)
          .single();

        if (!existingProfile) {
          const { error: profileError } = await supabase
            .from('user_profiles')
            .insert([
              {
                id: authData.user.id,
                email: formData.email,
                display_name: formData.display_name,
                company: formData.company,
                department: formData.department,
                role: formData.role,
                is_active: formData.is_active,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              }
            ]);

          if (profileError) {
            console.error('Profile creation error:', profileError);
            throw new Error(`プロフィール作成エラー: ${profileError.message}`);
          }
        } else {
          // 既存プロフィールがある場合も更新
          const { error: updateError } = await supabase
            .from('user_profiles')
            .update({
              email: formData.email,
              display_name: formData.display_name,
              company: formData.company,
              department: formData.department,
              role: formData.role,
              is_active: formData.is_active,
              updated_at: new Date().toISOString()
            })
            .eq('id', authData.user.id);

          if (updateError) {
            console.error('Profile update error:', updateError);
            throw new Error(`プロフィール更新エラー: ${updateError.message}`);
          }
        }

        // メール確認を自動で行う
        try {
          await supabase.rpc('confirm_user_email', {
            user_id: authData.user.id
          });
        } catch (confirmError) {
          console.warn('メール確認の自動設定に失敗:', confirmError);
        }
      }

      // 3. Log the action
      try {
        await supabase.from('system_logs').insert({
          user_id: user.id,
          action: 'user_create',
          resource_type: 'user_profile',
          resource_id: newUserId || 'unknown',
          details: {
            created_user_email: formData.email,
            created_user_role: formData.role
          }
        });
      } catch (logError) {
        console.warn('Failed to log action:', logError);
      }

      alert(`ユーザー "${formData.display_name}" が正常に作成されました。メール確認は不要で、即座にログイン可能です。`);
      router.push('/admin/students');
    } catch (error) {
      console.error('User creation error:', error);
      alert(`エラーが発生しました: ${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  const generatePassword = () => {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length));
    }
    setFormData({ ...formData, password });
  };

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-2xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center space-x-4 mb-4">
              <Link 
                href="/admin/students"
                className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">新規生徒作成</h1>
                <p className="text-gray-600 dark:text-gray-400">新しい生徒アカウントを作成します</p>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Basic Information */}
            <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
              <div className="flex items-center mb-6">
                <UserCircleIcon className="h-5 w-5 text-blue-600 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">基本情報</h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <Input
                    label="メールアドレス"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="user@example.com"
                    required
                    icon={<EnvelopeIcon className="h-4 w-4" />}
                  />
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    ログインIDとして使用されます
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    パスワード *
                  </label>
                  <div className="flex space-x-2">
                    <div className="relative flex-1">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <KeyIcon className="h-4 w-4 text-gray-400" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        placeholder="6文字以上のパスワード"
                        required
                        minLength={6}
                      />
                      <button
                        type="button"
                        className="absolute inset-y-0 right-0 pr-3 flex items-center"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? (
                          <EyeSlashIcon className="h-4 w-4 text-gray-400" />
                        ) : (
                          <EyeIcon className="h-4 w-4 text-gray-400" />
                        )}
                      </button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={generatePassword}
                      className="flex-shrink-0"
                    >
                      自動生成
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    初回ログイン時にユーザー自身で変更してもらってください
                  </p>
                </div>

                <Input
                  label="表示名"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  placeholder="田中太郎"
                  required
                />
              </div>
            </div>

            {/* Organization Information */}
            <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
              <div className="flex items-center mb-6">
                <BuildingOfficeIcon className="h-5 w-5 text-blue-600 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">所属情報</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="会社名"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="株式会社サンプル"
                />

                <Input
                  label="部署名"
                  value={formData.department}
                  onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                  placeholder="システム開発部"
                />
              </div>
            </div>

            {/* Role and Permissions */}
            <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
              <div className="flex items-center mb-6">
                <BriefcaseIcon className="h-5 w-5 text-blue-600 mr-2" />
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">権限設定</h2>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    ユーザーロール
                  </label>
                  <select
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value as any })}
                  >
                    <option value="student">学習者 - 基本的な学習機能のみ</option>
                    <option value="instructor">講師 - コンテンツ作成と分析機能</option>
                    <option value="admin">管理者 - 全ての管理機能</option>
                  </select>
                </div>

                <div className="flex items-center">
                  <input
                    id="is_active"
                    type="checkbox"
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                  />
                  <label htmlFor="is_active" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                    アカウントを有効にする
                  </label>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  無効にした場合、ユーザーはログインできません
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-4 pt-6">
              <Link href="/admin/students">
                <Button variant="outline">キャンセル</Button>
              </Link>
              <Button 
                type="submit" 
                loading={loading}
                disabled={loading}
              >
                <UserPlusIcon className="h-4 w-4 mr-2" />
                {loading ? '作成中...' : '生徒を作成'}
              </Button>
            </div>
          </form>

          {/* Help Information */}
          <div className="mt-8 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-xl p-6">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">
              ユーザー作成に関する注意事項
            </h3>
            <div className="text-sm text-blue-800 space-y-1">
              <p>• 作成されたユーザーはメール認証不要で即座にログイン可能です</p>
              <p>• パスワードは安全な場所に保存し、ユーザーに直接お伝えください</p>
              <p>• ユーザーは初回ログイン時にパスワード変更を推奨されます</p>
              <p>• 管理者権限は慎重に付与してください</p>
            </div>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}