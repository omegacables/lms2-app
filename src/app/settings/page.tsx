'use client';

import { useState, useEffect } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { useTheme } from '@/contexts/ThemeContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import { AvatarCropperModal } from '@/components/settings/AvatarCropperModal';
import {
  UserCircleIcon,
  KeyIcon,
  MoonIcon,
  SunIcon,
  ComputerDesktopIcon,
  PhotoIcon,
  PencilIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import { CheckIcon as CheckIconSolid } from '@heroicons/react/24/solid';

// 注: このページには実際に保存・反映される設定のみを置く。
// （通知設定・プライバシー設定・学習設定などの「保存されるだけで何にも使われない」項目は
//   誤解を招くため削除済み。機能を実装する際にタブごと追加すること）

interface ProfileSettings {
  display_name: string;
  email: string;
  company: string;
  department: string;
  avatar_url?: string;
}

export default function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const { theme: currentTheme, setTheme: setAppTheme } = useTheme();
  const [profile, setProfile] = useState<ProfileSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    new: '',
    confirm: ''
  });
  const [changingPassword, setChangingPassword] = useState(false);

  // アバタークロップ用
  const [cropImageSrc, setCropImageSrc] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const tabs = [
    { id: 'profile', name: 'プロフィール', icon: UserCircleIcon },
    { id: 'appearance', name: '表示設定', icon: PencilIcon },
    { id: 'security', name: 'セキュリティ', icon: KeyIcon }
  ];

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      if (!user?.id) return;

      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('display_name, company, department, avatar_url')
        .eq('id', user.id)
        .single();

      setProfile({
        display_name: profileData?.display_name || user.email?.split('@')[0] || '',
        email: user.email || '',
        company: profileData?.company || '',
        department: profileData?.department || '',
        avatar_url: profileData?.avatar_url || undefined
      });
    } catch (error) {
      console.error('設定取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveProfile = async () => {
    if (!profile || !user?.id) return;

    if (!profile.display_name.trim()) {
      alert('表示名を入力してください');
      return;
    }

    setSaving(true);
    try {
      // updateProfile はDB更新とヘッダー等のストア状態更新を両方行う
      const { error } = await updateProfile({
        display_name: profile.display_name.trim(),
        department: profile.department.trim() || undefined
      });
      if (error) throw new Error(error);
      alert('プロフィールを保存しました');
    } catch (error) {
      console.error('設定保存エラー:', error);
      alert('保存に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!passwordForm.current || !passwordForm.new || !passwordForm.confirm) {
      alert('すべてのフィールドを入力してください');
      return;
    }
    if (passwordForm.new !== passwordForm.confirm) {
      alert('新しいパスワードが一致しません');
      return;
    }
    if (passwordForm.new.length < 6) {
      alert('パスワードは6文字以上で設定してください');
      return;
    }
    if (!user?.email) return;

    setChangingPassword(true);
    try {
      // 現在のパスワードを実際に検証する（誤入力のまま変更してしまう事故を防ぐ）
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: passwordForm.current
      });
      if (verifyError) {
        alert('現在のパスワードが正しくありません');
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: passwordForm.new
      });
      if (error) throw error;

      setPasswordForm({ current: '', new: '', confirm: '' });
      alert('パスワードが変更されました');
    } catch (error) {
      console.error('パスワード変更エラー:', error);
      alert('パスワードの変更に失敗しました');
    } finally {
      setChangingPassword(false);
    }
  };

  // アバター: ファイル選択 → クロップモーダルを開く
  const handleAvatarFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 同じファイルを選び直しても onChange が発火するようリセット
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('画像ファイル（JPG / PNG など）を選択してください');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('画像サイズは10MB以下にしてください');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setCropImageSrc(reader.result as string);
    reader.onerror = () => alert('画像の読み込みに失敗しました');
    reader.readAsDataURL(file);
  };

  // アバター: クロップ確定 → アップロード → プロフィール更新
  const handleCroppedUpload = async (blob: Blob) => {
    if (!user?.id) return;
    setAvatarUploading(true);
    try {
      // RLS: avatars バケットは「{自分のuid}/」配下のみアップロード可
      const path = `${user.id}/avatar-${Date.now()}.jpg`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(path);

      const { error } = await updateProfile({ avatar_url: publicUrl });
      if (error) throw new Error(error);

      setProfile((p) => (p ? { ...p, avatar_url: publicUrl } : p));
      setCropImageSrc(null);
      alert('プロフィール画像を更新しました');
    } catch (error) {
      console.error('アバターアップロードエラー:', error);
      alert('画像のアップロードに失敗しました。時間をおいて再度お試しください。');
    } finally {
      setAvatarUploading(false);
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="flex justify-center items-center min-h-64">
            <LoadingSpinner size="lg" />
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  if (!profile) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">設定を読み込めませんでした</h2>
            <Button onClick={fetchProfile}>再試行</Button>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mr-4">
                <Cog6ToothIcon className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">設定</h1>
                <p className="text-gray-600 dark:text-gray-400">アカウントと表示をカスタマイズしましょう</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar */}
            <div className="lg:w-64">
              <nav className="flex lg:flex-col gap-1 overflow-x-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-shrink-0 lg:w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                      activeTab === tab.id
                        ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <tab.icon className={`h-5 w-5 mr-2 lg:mr-3 ${
                      activeTab === tab.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'
                    }`} />
                    {tab.name}
                  </button>
                ))}
              </nav>
            </div>

            {/* Main Content */}
            <div className="flex-1">
              <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">

                {/* Profile Settings */}
                {activeTab === 'profile' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">プロフィール設定</h2>

                    {/* Avatar Upload */}
                    <div className="flex items-center space-x-6">
                      <div className="relative">
                        <div className="w-20 h-20 bg-gray-200 dark:bg-neutral-700 rounded-full flex items-center justify-center overflow-hidden">
                          {profile.avatar_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={profile.avatar_url} alt="プロフィール画像" className="w-full h-full object-cover" />
                          ) : (
                            <UserCircleIcon className="h-12 w-12 text-gray-400" />
                          )}
                        </div>
                        <label className="absolute bottom-0 right-0 w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-indigo-700">
                          <PhotoIcon className="h-4 w-4 text-white" />
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarFileSelect}
                            className="hidden"
                            disabled={avatarUploading}
                          />
                        </label>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white">プロフィール画像</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          JPG・PNG形式、最大10MB。選択後に切り抜き（クロップ）できます。
                        </p>
                      </div>
                    </div>

                    {/* Profile Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Input
                        label="表示名"
                        value={profile.display_name}
                        onChange={(e) => setProfile({ ...profile, display_name: e.target.value })}
                        required
                      />

                      <Input
                        label="メールアドレス"
                        type="email"
                        value={profile.email}
                        disabled
                        helperText="メールアドレスは変更できません"
                      />

                      <Input
                        label="会社名"
                        value={profile.company}
                        disabled
                        helperText="会社名の変更は管理者にお問い合わせください"
                      />

                      <Input
                        label="部署名"
                        value={profile.department}
                        onChange={(e) => setProfile({ ...profile, department: e.target.value })}
                        placeholder="開発部"
                      />
                    </div>

                    <div className="flex justify-end pt-4 border-t border-gray-200 dark:border-neutral-800">
                      <Button onClick={saveProfile} loading={saving}>
                        <CheckIconSolid className="h-4 w-4 mr-2" />
                        {saving ? '保存中...' : 'プロフィールを保存'}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Appearance Settings */}
                {activeTab === 'appearance' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">表示設定</h2>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        テーマ
                      </label>
                      <div className="grid grid-cols-3 gap-3 max-w-md">
                        {[
                          { value: 'light', label: 'ライト', icon: SunIcon },
                          { value: 'dark', label: 'ダーク', icon: MoonIcon },
                          { value: 'system', label: '自動', icon: ComputerDesktopIcon }
                        ].map(({ value, label, icon: Icon }) => (
                          <button
                            key={value}
                            onClick={() => setAppTheme(value as 'light' | 'dark' | 'system')}
                            className={`p-4 border rounded-lg flex flex-col items-center space-y-2 transition-colors ${
                              currentTheme === value
                                ? 'border-indigo-600 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400'
                                : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 text-gray-700 dark:text-gray-300'
                            }`}
                          >
                            <Icon className="h-6 w-6" />
                            <span className="text-sm font-medium">{label}</span>
                          </button>
                        ))}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                        選択するとすぐに反映・保存されます
                      </p>
                    </div>
                  </div>
                )}

                {/* Security Settings */}
                {activeTab === 'security' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">セキュリティ設定</h2>

                    {/* Password Change */}
                    <div className="bg-gray-50 dark:bg-black rounded-lg p-6">
                      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">パスワード変更</h3>
                      <div className="space-y-4">
                        <Input
                          label="現在のパスワード"
                          type="password"
                          value={passwordForm.current}
                          onChange={(e) => setPasswordForm({ ...passwordForm, current: e.target.value })}
                          autoComplete="current-password"
                        />
                        <Input
                          label="新しいパスワード"
                          type="password"
                          value={passwordForm.new}
                          onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                          helperText="6文字以上で入力してください"
                          autoComplete="new-password"
                        />
                        <Input
                          label="新しいパスワード（確認）"
                          type="password"
                          value={passwordForm.confirm}
                          onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                          autoComplete="new-password"
                        />
                        <Button
                          onClick={changePassword}
                          variant="outline"
                          className="w-full sm:w-auto"
                          loading={changingPassword}
                        >
                          {changingPassword ? '変更中...' : 'パスワードを変更'}
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* アバタークロップモーダル */}
        {cropImageSrc && (
          <AvatarCropperModal
            imageSrc={cropImageSrc}
            onCancel={() => !avatarUploading && setCropImageSrc(null)}
            onCropped={handleCroppedUpload}
            uploading={avatarUploading}
          />
        )}
      </MainLayout>
    </AuthGuard>
  );
}
