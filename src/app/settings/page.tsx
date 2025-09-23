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
import {
  UserCircleIcon,
  BellIcon,
  ShieldCheckIcon,
  AcademicCapIcon,
  KeyIcon,
  TrashIcon,
  EyeSlashIcon,
  MoonIcon,
  SunIcon,
  CheckIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
  PencilIcon,
  CloudArrowUpIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import {
  CheckIcon as CheckIconSolid,
  BellIcon as BellIconSolid
} from '@heroicons/react/24/solid';

interface UserSettings {
  profile: {
    display_name: string;
    email: string;
    phone?: string;
    company?: string;
    department?: string;
    avatar_url?: string;
  };
  notifications: {
    email_course_updates: boolean;
    email_assignments: boolean;
    email_messages: boolean;
    email_reminders: boolean;
    push_course_updates: boolean;
    push_assignments: boolean;
    push_messages: boolean;
    daily_digest: boolean;
  };
  privacy: {
    profile_visibility: 'public' | 'instructors' | 'private';
    show_progress: boolean;
    show_certificates: boolean;
    allow_messages: boolean;
    data_collection: boolean;
  };
  learning: {
    auto_continue: boolean;
    bookmark_reminders: boolean;
    offline_downloads: boolean;
    quality_preference: 'auto' | 'high' | 'medium' | 'low';
    subtitle_language: 'ja' | 'en' | 'none';
    video_preview: boolean;
  };
  appearance: {
    theme: 'light' | 'dark' | 'auto';
    language: 'ja' | 'en';
    compact_view: boolean;
  };
}

export default function SettingsPage() {
  const { user, updateProfile } = useAuth();
  const { theme: currentTheme, setTheme: setAppTheme } = useTheme();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');
  const [passwordForm, setPasswordForm] = useState({
    current: '',
    new: '',
    confirm: ''
  });

  const tabs = [
    { id: 'profile', name: 'プロフィール', icon: UserCircleIcon },
    { id: 'notifications', name: '通知', icon: BellIcon },
    { id: 'privacy', name: 'プライバシー', icon: ShieldCheckIcon },
    { id: 'learning', name: '学習設定', icon: AcademicCapIcon },
    { id: 'appearance', name: '表示設定', icon: PencilIcon },
    { id: 'security', name: 'セキュリティ', icon: KeyIcon }
  ];

  useEffect(() => {
    fetchUserSettings();
  }, []);

  const fetchUserSettings = async () => {
    try {
      setLoading(true);
      
      if (!user?.id) return;

      // ユーザープロフィールを取得
      const { data: profileData } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      // デフォルト設定
      const defaultSettings: UserSettings = {
        profile: {
          display_name: profileData?.display_name || user.email?.split('@')[0] || '',
          email: user.email || '',
          phone: profileData?.phone || '',
          company: profileData?.company || '',
          department: profileData?.department || '',
          avatar_url: profileData?.avatar_url
        },
        notifications: {
          email_course_updates: true,
          email_assignments: true,
          email_messages: true,
          email_reminders: true,
          push_course_updates: true,
          push_assignments: true,
          push_messages: true,
          daily_digest: false
        },
        privacy: {
          profile_visibility: 'instructors',
          show_progress: true,
          show_certificates: true,
          allow_messages: true,
          data_collection: true
        },
        learning: {
          auto_continue: true,
          bookmark_reminders: true,
          offline_downloads: false,
          quality_preference: 'auto',
          subtitle_language: 'ja',
          video_preview: true
        },
        appearance: {
          theme: currentTheme as 'light' | 'dark' | 'auto',
          language: 'ja',
          compact_view: false
        }
      };

      // ローカルストレージから設定を読み込み
      if (typeof window !== 'undefined') {
        try {
          const savedSettings = localStorage.getItem(`user_settings_${user.id}`);
          if (savedSettings) {
            const parsedSettings = JSON.parse(savedSettings);
            Object.assign(defaultSettings.notifications, parsedSettings.notifications || {});
            Object.assign(defaultSettings.privacy, parsedSettings.privacy || {});
            Object.assign(defaultSettings.learning, parsedSettings.learning || {});
            Object.assign(defaultSettings.appearance, parsedSettings.appearance || {});
          }
        } catch (error) {
          console.error('設定読み込みエラー:', error);
        }
      }

      setSettings(defaultSettings);
    } catch (error) {
      console.error('設定取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = <T extends keyof UserSettings>(
    section: T,
    key: keyof UserSettings[T],
    value: any
  ) => {
    if (!settings) return;

    setSettings({
      ...settings,
      [section]: {
        ...settings[section],
        [key]: value
      }
    });
  };

  const saveSettings = async () => {
    if (!settings || !user?.id) return;

    setSaving(true);
    try {
      // プロフィール情報を更新
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({
          display_name: settings.profile.display_name,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (profileError) {
        throw profileError;
      }

      // テーマ設定をグローバルに反映
      const themeValue = settings.appearance.theme === 'auto' ? 'system' : settings.appearance.theme as 'light' | 'dark' | 'system';
      setAppTheme(themeValue);

      // その他の設定はローカルストレージに保存（実際のアプリでは設定テーブルに保存）
      const settingsToStore = {
        notifications: settings.notifications,
        privacy: settings.privacy,
        learning: settings.learning,
        appearance: settings.appearance
      };

      if (typeof window !== 'undefined') {
        localStorage.setItem(`user_settings_${user.id}`, JSON.stringify(settingsToStore));
      }

      alert('設定が保存されました');
    } catch (error) {
      console.error('設定保存エラー:', error);
      alert('設定の保存に失敗しました');
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

    try {
      const { error } = await supabase.auth.updateUser({
        password: passwordForm.new
      });

      if (error) {
        throw error;
      }

      setPasswordForm({ current: '', new: '', confirm: '' });
      alert('パスワードが変更されました');
    } catch (error) {
      console.error('パスワード変更エラー:', error);
      alert('パスワードの変更に失敗しました');
    }
  };

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user?.id) return;

    // アバター画像のアップロード処理（実装簡略化）
    alert('アバター画像のアップロード機能は実装中です');
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

  if (!settings) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">設定を読み込めませんでした</h2>
            <Button onClick={fetchUserSettings}>再試行</Button>
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
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">設定</h1>
                <p className="text-gray-600 dark:text-gray-400">アカウントと学習環境をカスタマイズしましょう</p>
              </div>
            </div>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Sidebar */}
            <div className="lg:w-64">
              <nav className="space-y-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                      activeTab === tab.id
                        ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border-r-2 border-indigo-600 dark:border-indigo-400'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <tab.icon className={`h-5 w-5 mr-3 ${
                      activeTab === tab.id ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400 dark:text-gray-500'
                    }`} />
                    {tab.name}
                  </button>
                ))}
              </nav>
            </div>

            {/* Main Content */}
            <div className="flex-1">
              <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                
                {/* Profile Settings */}
                {activeTab === 'profile' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">プロフィール設定</h2>
                    
                    {/* Avatar Upload */}
                    <div className="flex items-center space-x-6">
                      <div className="relative">
                        <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center overflow-hidden">
                          {settings.profile.avatar_url ? (
                            <img src={settings.profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
                          ) : (
                            <UserCircleIcon className="h-12 w-12 text-gray-400" />
                          )}
                        </div>
                        <label className="absolute bottom-0 right-0 w-6 h-6 bg-indigo-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-indigo-700">
                          <PhotoIcon className="h-3 w-3 text-white" />
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarUpload}
                            className="hidden"
                          />
                        </label>
                      </div>
                      <div>
                        <h3 className="text-sm font-medium text-gray-900 dark:text-white">プロフィール画像</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400">JPG、PNG形式、最大5MBまで</p>
                      </div>
                    </div>

                    {/* Profile Fields */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Input
                        label="表示名"
                        value={settings.profile.display_name}
                        onChange={(e) => updateSetting('profile', 'display_name', e.target.value)}
                        required
                      />
                      
                      <Input
                        label="メールアドレス"
                        type="email"
                        value={settings.profile.email}
                        disabled
                        helperText="メールアドレスは変更できません"
                      />

                      <Input
                        label="電話番号"
                        value={settings.profile.phone || ''}
                        onChange={(e) => updateSetting('profile', 'phone', e.target.value)}
                        placeholder="090-1234-5678"
                      />

                      <Input
                        label="会社名"
                        value={settings.profile.company || ''}
                        onChange={(e) => updateSetting('profile', 'company', e.target.value)}
                        placeholder="株式会社サンプル"
                      />

                      <div className="md:col-span-2">
                        <Input
                          label="部署名"
                          value={settings.profile.department || ''}
                          onChange={(e) => updateSetting('profile', 'department', e.target.value)}
                          placeholder="開発部"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Notification Settings */}
                {activeTab === 'notifications' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">通知設定</h2>
                    
                    <div className="space-y-4">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">メール通知</h3>
                      {[
                        { key: 'email_course_updates', label: 'コースの更新情報' },
                        { key: 'email_assignments', label: '課題の通知' },
                        { key: 'email_messages', label: 'メッセージの通知' },
                        { key: 'email_reminders', label: '学習リマインダー' }
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between">
                          <label className="text-sm text-gray-700 dark:text-gray-300">{label}</label>
                          <button
                            onClick={() => updateSetting('notifications', key as keyof typeof settings.notifications, !settings.notifications[key as keyof typeof settings.notifications])}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              settings.notifications[key as keyof typeof settings.notifications]
                                ? 'bg-indigo-600 dark:bg-indigo-500'
                                : 'bg-gray-200 dark:bg-gray-600'
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              settings.notifications[key as keyof typeof settings.notifications]
                                ? 'translate-x-6'
                                : 'translate-x-1'
                            }`} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">プッシュ通知</h3>
                      {[
                        { key: 'push_course_updates', label: 'コースの更新情報' },
                        { key: 'push_assignments', label: '課題の通知' },
                        { key: 'push_messages', label: 'メッセージの通知' }
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between">
                          <label className="text-sm text-gray-700 dark:text-gray-300">{label}</label>
                          <button
                            onClick={() => updateSetting('notifications', key as keyof typeof settings.notifications, !settings.notifications[key as keyof typeof settings.notifications])}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              settings.notifications[key as keyof typeof settings.notifications]
                                ? 'bg-indigo-600 dark:bg-indigo-500'
                                : 'bg-gray-200 dark:bg-gray-600'
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              settings.notifications[key as keyof typeof settings.notifications]
                                ? 'translate-x-6'
                                : 'translate-x-1'
                            }`} />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-sm font-medium text-gray-900 dark:text-white">その他</h3>
                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-sm text-gray-700 dark:text-gray-300">日次ダイジェスト</label>
                          <p className="text-xs text-gray-500 dark:text-gray-400">1日の学習サマリーをメールで受け取る</p>
                        </div>
                        <button
                          onClick={() => updateSetting('notifications', 'daily_digest', !settings.notifications.daily_digest)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            settings.notifications.daily_digest ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-gray-200 dark:bg-gray-600'
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            settings.notifications.daily_digest ? 'translate-x-6' : 'translate-x-1'
                          }`} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Privacy Settings */}
                {activeTab === 'privacy' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">プライバシー設定</h2>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          プロフィールの表示範囲
                        </label>
                        <select
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                          value={settings.privacy.profile_visibility}
                          onChange={(e) => updateSetting('privacy', 'profile_visibility', e.target.value)}
                        >
                          <option value="public">すべてのユーザー</option>
                          <option value="instructors">講師・管理者のみ</option>
                          <option value="private">非公開</option>
                        </select>
                      </div>

                      {[
                        { key: 'show_progress', label: '学習進捗の表示', desc: '他のユーザーに学習進捗を表示する' },
                        { key: 'show_certificates', label: '取得証明書の表示', desc: '取得した証明書を他のユーザーに表示する' },
                        { key: 'allow_messages', label: 'メッセージの受信', desc: '他のユーザーからのメッセージを受信する' },
                        { key: 'data_collection', label: 'データ収集への同意', desc: 'サービス改善のためのデータ収集に同意する' }
                      ].map(({ key, label, desc }) => (
                        <div key={key} className="flex items-start justify-between">
                          <div className="flex-1">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{desc}</p>
                          </div>
                          <button
                            onClick={() => updateSetting('privacy', key as keyof typeof settings.privacy, !settings.privacy[key as keyof typeof settings.privacy])}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ml-4 ${
                              settings.privacy[key as keyof typeof settings.privacy]
                                ? 'bg-indigo-600 dark:bg-indigo-500'
                                : 'bg-gray-200 dark:bg-gray-600'
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              settings.privacy[key as keyof typeof settings.privacy]
                                ? 'translate-x-6'
                                : 'translate-x-1'
                            }`} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Learning Settings */}
                {activeTab === 'learning' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">学習設定</h2>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          動画品質
                        </label>
                        <select
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                          value={settings.learning.quality_preference}
                          onChange={(e) => updateSetting('learning', 'quality_preference', e.target.value)}
                        >
                          <option value="auto">自動</option>
                          <option value="high">高画質</option>
                          <option value="medium">標準画質</option>
                          <option value="low">低画質</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          字幕言語
                        </label>
                        <select
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                          value={settings.learning.subtitle_language}
                          onChange={(e) => updateSetting('learning', 'subtitle_language', e.target.value)}
                        >
                          <option value="ja">日本語</option>
                          <option value="en">英語</option>
                          <option value="none">字幕なし</option>
                        </select>
                      </div>

                      {[
                        { key: 'auto_continue', label: '自動継続再生', desc: '動画終了後、自動で次の動画を再生する' },
                        { key: 'bookmark_reminders', label: 'ブックマークリマインダー', desc: '未完了のブックマークをリマインドする' },
                        { key: 'video_preview', label: '動画プレビュー', desc: 'マウスホバー時に動画をプレビューする' },
                        { key: 'offline_downloads', label: 'オフライン視聴', desc: '動画をダウンロードしてオフラインで視聴する' }
                      ].map(({ key, label, desc }) => (
                        <div key={key} className="flex items-start justify-between">
                          <div className="flex-1">
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{desc}</p>
                          </div>
                          <button
                            onClick={() => updateSetting('learning', key as keyof typeof settings.learning, !settings.learning[key as keyof typeof settings.learning])}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ml-4 ${
                              settings.learning[key as keyof typeof settings.learning]
                                ? 'bg-indigo-600 dark:bg-indigo-500'
                                : 'bg-gray-200 dark:bg-gray-600'
                            }`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              settings.learning[key as keyof typeof settings.learning]
                                ? 'translate-x-6'
                                : 'translate-x-1'
                            }`} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Appearance Settings */}
                {activeTab === 'appearance' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">表示設定</h2>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          テーマ
                        </label>
                        <div className="grid grid-cols-3 gap-3">
                          {[
                            { value: 'light', label: 'ライト', icon: SunIcon },
                            { value: 'dark', label: 'ダーク', icon: MoonIcon },
                            { value: 'auto', label: '自動', icon: Cog6ToothIcon }
                          ].map(({ value, label, icon: Icon }) => (
                            <button
                              key={value}
                              onClick={() => {
                                updateSetting('appearance', 'theme', value);
                                // テーマをすぐに反映
                                const themeValue = value === 'auto' ? 'system' : value as 'light' | 'dark' | 'system';
                                setAppTheme(themeValue);

                                // 設定も即座にローカルストレージに保存
                                if (typeof window !== 'undefined' && user?.id) {
                                  const currentSettings = JSON.parse(localStorage.getItem(`user_settings_${user.id}`) || '{}');
                                  const updatedSettings = {
                                    ...currentSettings,
                                    appearance: {
                                      ...currentSettings.appearance,
                                      theme: value
                                    }
                                  };
                                  localStorage.setItem(`user_settings_${user.id}`, JSON.stringify(updatedSettings));
                                }
                              }}
                              className={`p-4 border rounded-lg flex flex-col items-center space-y-2 transition-colors ${
                                settings.appearance.theme === value
                                  ? 'border-indigo-600 dark:border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400'
                                  : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500 text-gray-700 dark:text-gray-300'
                              }`}
                            >
                              <Icon className="h-6 w-6" />
                              <span className="text-sm font-medium">{label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          言語
                        </label>
                        <select
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                          value={settings.appearance.language}
                          onChange={(e) => updateSetting('appearance', 'language', e.target.value)}
                        >
                          <option value="ja">日本語</option>
                          <option value="en">English</option>
                        </select>
                      </div>

                      <div className="flex items-center justify-between">
                        <div>
                          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">コンパクト表示</label>
                          <p className="text-xs text-gray-500 dark:text-gray-400">より多くの情報を画面に表示する</p>
                        </div>
                        <button
                          onClick={() => updateSetting('appearance', 'compact_view', !settings.appearance.compact_view)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                            settings.appearance.compact_view ? 'bg-indigo-600 dark:bg-indigo-500' : 'bg-gray-200 dark:bg-gray-600'
                          }`}
                        >
                          <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            settings.appearance.compact_view ? 'translate-x-6' : 'translate-x-1'
                          }`} />
                        </button>
                      </div>
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
                        />
                        <Input
                          label="新しいパスワード"
                          type="password"
                          value={passwordForm.new}
                          onChange={(e) => setPasswordForm({ ...passwordForm, new: e.target.value })}
                          helperText="6文字以上で入力してください"
                        />
                        <Input
                          label="新しいパスワード（確認）"
                          type="password"
                          value={passwordForm.confirm}
                          onChange={(e) => setPasswordForm({ ...passwordForm, confirm: e.target.value })}
                        />
                        <Button 
                          onClick={changePassword}
                          variant="outline"
                          className="w-full sm:w-auto"
                        >
                          パスワードを変更
                        </Button>
                      </div>
                    </div>

                    {/* Account Deletion */}
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-lg p-6">
                      <div className="flex items-start">
                        <ExclamationTriangleIcon className="h-6 w-6 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
                        <div className="flex-1">
                          <h3 className="text-lg font-medium text-red-900 mb-2">アカウント削除</h3>
                          <p className="text-sm text-red-800 mb-4">
                            アカウントを削除すると、すべての学習データ、進捗、証明書が永久に削除されます。この操作は元に戻せません。
                          </p>
                          <Button 
                            variant="outline" 
                            className="border-red-300 text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <TrashIcon className="h-4 w-4 mr-2" />
                            アカウントを削除
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Save Button */}
                <div className="mt-8 flex justify-end space-x-4 pt-6 border-t border-gray-200 dark:border-neutral-800">
                  <Button variant="outline" onClick={fetchUserSettings}>
                    リセット
                  </Button>
                  <Button onClick={saveSettings} loading={saving}>
                    <CheckIconSolid className="h-4 w-4 mr-2" />
                    {saving ? '保存中...' : '設定を保存'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}