'use client';

import { useState, useEffect } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import { PasswordChangeForm } from '@/components/settings/PasswordChangeForm';
import {
  Cog6ToothIcon,
  ServerIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
  BellIcon,
  ChartBarIcon,
  UserGroupIcon,
  AcademicCapIcon,
  KeyIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  DocumentDuplicateIcon,
  PhotoIcon
} from '@heroicons/react/24/outline';
import {
  CheckCircleIcon as CheckCircleIconSolid,
  ExclamationTriangleIcon as ExclamationTriangleIconSolid
} from '@heroicons/react/24/solid';

interface SystemSettings {
  general: {
    site_name: string;
    site_description: string;
    admin_email: string;
    default_language: 'ja' | 'en';
    timezone: string;
    maintenance_mode: boolean;
  };
  learning: {
    default_completion_threshold: number;
    auto_certificate_generation: boolean;
    enable_progress_tracking: boolean;
    min_watch_time_percent: number;
  };
  certificate: {
    company_name: string;
    signer_name: string;
    signer_title: string;
    stamp_image_url: string;
  };
}

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');
  const [fixingRoles, setFixingRoles] = useState(false);
  const [uploadingStamp, setUploadingStamp] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      
      // データベースから設定を取得
      const { data: settingsData, error } = await supabase
        .from('system_settings')
        .select('*');

      if (error) {
        console.error('設定取得エラー:', error);
      }

      // 設定をカテゴリ別に整理
      const loadedSettings: SystemSettings = {
        general: {
          site_name: 'SKILLUP LMS',
          site_description: '企業向け学習管理システム',
          admin_email: 'admin@skillup-lms.com',
          default_language: 'ja',
          timezone: 'Asia/Tokyo',
          maintenance_mode: false
        },
        learning: {
          default_completion_threshold: 80,
          auto_certificate_generation: true,
          enable_progress_tracking: true,
          min_watch_time_percent: 70
        },
        certificate: {
          company_name: '株式会社SkillUp',
          signer_name: '',
          signer_title: '研修担当',
          stamp_image_url: ''
        }
      };

      // データベースから取得した設定で上書き
      if (settingsData && settingsData.length > 0) {
        settingsData.forEach(item => {
          const [category, key] = item.setting_key.split('.');
          if (category && key && loadedSettings[category as keyof SystemSettings]) {
            const value = item.setting_type === 'json' 
              ? JSON.parse(item.setting_value || '[]')
              : item.setting_type === 'boolean'
              ? item.setting_value === 'true'
              : item.setting_type === 'number'
              ? parseInt(item.setting_value || '0')
              : item.setting_value;
            
            (loadedSettings[category as keyof SystemSettings] as any)[key] = value;
          }
        });
      }

      setSettings(loadedSettings);
    } catch (error) {
      console.error('設定取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    if (!settings || !user) return;

    setSaving(true);
    try {
      // 設定をフラット化してデータベースに保存
      const settingsToSave: Array<{
        setting_key: string;
        setting_value: string;
        setting_type: string;
        category: string;
        updated_by: string;
      }> = [];

      // 各カテゴリの設定をフラット化
      Object.entries(settings).forEach(([category, categorySettings]) => {
        Object.entries(categorySettings).forEach(([key, value]) => {
          let settingType = 'string';
          let settingValue = String(value);

          if (typeof value === 'boolean') {
            settingType = 'boolean';
            settingValue = value ? 'true' : 'false';
          } else if (typeof value === 'number') {
            settingType = 'number';
            settingValue = String(value);
          } else if (Array.isArray(value)) {
            settingType = 'json';
            settingValue = JSON.stringify(value);
          }

          settingsToSave.push({
            setting_key: `${category}.${key}`,
            setting_value: settingValue,
            setting_type: settingType,
            category: category,
            updated_by: user.id
          });
        });
      });

      // 各設定をupsert
      for (const setting of settingsToSave) {
        const { error } = await supabase
          .from('system_settings')
          .upsert(setting, {
            onConflict: 'setting_key'
          });

        if (error) {
          console.error(`設定保存エラー (${setting.setting_key}):`, error);
        }
      }
      
      alert('設定が保存されました');
    } catch (error) {
      console.error('設定保存エラー:', error);
      alert('設定の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const fixUserRoles = async () => {
    setFixingRoles(true);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch('/api/admin/fix-user-roles', {
        method: 'POST',
        headers: {
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'ユーザーロールの修正に失敗しました');
      }

      console.log('Fix user roles results:', result);
      
      // 結果を表示
      const updatedCount = result.updates.filter((u: any) => u.status === 'updated').length;
      const skippedCount = result.updates.filter((u: any) => u.status === 'skipped').length;
      const errorCount = result.updates.filter((u: any) => u.status === 'error').length;
      
      alert(`ユーザーロール修正結果:\n更新: ${updatedCount}件\nスキップ: ${skippedCount}件\nエラー: ${errorCount}件\n\n現在のユーザーは管理者権限に設定されました。`);
    } catch (error) {
      console.error('Fix user roles error:', error);
      alert(`ユーザーロールの修正に失敗しました: ${error instanceof Error ? error.message : 'エラーが発生しました'}`);
    } finally {
      setFixingRoles(false);
    }
  };

  const updateSetting = (section: keyof SystemSettings, key: string, value: any) => {
    if (!settings) return;

    setSettings({
      ...settings,
      [section]: {
        ...settings[section],
        [key]: value
      }
    });
  };

  const tabs = [
    { id: 'general', name: '一般設定', icon: Cog6ToothIcon },
    { id: 'security', name: 'セキュリティ', icon: ShieldCheckIcon },
    { id: 'learning', name: '学習設定', icon: AcademicCapIcon },
    { id: 'certificate', name: '証明書署名', icon: DocumentDuplicateIcon }
  ];

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

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">システム設定</h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              LMSシステムの各種設定を管理できます。
            </p>
          </div>

          <div className="flex flex-col lg:flex-row gap-8">
            {/* Tabs Sidebar */}
            <div className="lg:w-64">
              <nav className="space-y-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                      activeTab === tab.id
                        ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 border-r-2 border-blue-600'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    <tab.icon className={`h-5 w-5 mr-3 ${
                      activeTab === tab.id ? 'text-blue-600' : 'text-gray-400'
                    }`} />
                    {tab.name}
                  </button>
                ))}
              </nav>
            </div>

            {/* Settings Content */}
            <div className="flex-1">
              <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                {/* General Settings */}
                {activeTab === 'general' && settings && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">一般設定</h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Input
                        label="サイト名"
                        value={settings.general.site_name}
                        onChange={(e) => updateSetting('general', 'site_name', e.target.value)}
                      />
                      
                      <Input
                        label="管理者メール"
                        type="email"
                        value={settings.general.admin_email}
                        onChange={(e) => updateSetting('general', 'admin_email', e.target.value)}
                      />

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          デフォルト言語
                        </label>
                        <select
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                          value={settings.general.default_language}
                          onChange={(e) => updateSetting('general', 'default_language', e.target.value)}
                        >
                          <option value="ja">日本語</option>
                          <option value="en">English</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          タイムゾーン
                        </label>
                        <select
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                          value={settings.general.timezone}
                          onChange={(e) => updateSetting('general', 'timezone', e.target.value)}
                        >
                          <option value="Asia/Tokyo">東京</option>
                          <option value="America/New_York">ニューヨーク</option>
                          <option value="Europe/London">ロンドン</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        サイト説明
                      </label>
                      <textarea
                        rows={3}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                        value={settings.general.site_description}
                        onChange={(e) => updateSetting('general', 'site_description', e.target.value)}
                      />
                    </div>

                    <div className="flex items-center">
                      <input
                        id="maintenance_mode"
                        type="checkbox"
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                        checked={settings.general.maintenance_mode}
                        onChange={(e) => updateSetting('general', 'maintenance_mode', e.target.checked)}
                      />
                      <label htmlFor="maintenance_mode" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                        メンテナンスモード
                      </label>
                    </div>
                    {settings.general.maintenance_mode && (
                      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 rounded-lg p-4">
                        <div className="flex items-center">
                          <ExclamationTriangleIconSolid className="h-5 w-5 text-yellow-600 mr-2" />
                          <div className="text-sm text-yellow-800">
                            メンテナンスモードが有効です。管理者以外はサイトにアクセスできません。
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Security Settings（自分のパスワード変更。受講者の「設定 → セキュリティ」と同じ） */}
                {activeTab === 'security' && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">セキュリティ</h2>
                    <PasswordChangeForm email={user?.email || ''} />
                  </div>
                )}

                {/* Learning Settings */}
                {activeTab === 'learning' && settings && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">学習設定</h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          デフォルト完了閾値 (%)
                        </label>
                        <input
                          type="number"
                          min="50"
                          max="100"
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                          value={settings.learning.default_completion_threshold}
                          onChange={(e) => updateSetting('learning', 'default_completion_threshold', parseInt(e.target.value))}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          新しいコースのデフォルト完了判定基準
                        </p>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          最小視聴時間 (%)
                        </label>
                        <input
                          type="number"
                          min="30"
                          max="100"
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                          value={settings.learning.min_watch_time_percent}
                          onChange={(e) => updateSetting('learning', 'min_watch_time_percent', parseInt(e.target.value))}
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          進捗として記録する最小視聴時間の割合
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center">
                        <input
                          id="auto_certificate_generation"
                          type="checkbox"
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                          checked={settings.learning.auto_certificate_generation}
                          onChange={(e) => updateSetting('learning', 'auto_certificate_generation', e.target.checked)}
                        />
                        <label htmlFor="auto_certificate_generation" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                          コース完了時に自動で証明書を生成
                        </label>
                      </div>

                      <div className="flex items-center">
                        <input
                          id="enable_progress_tracking"
                          type="checkbox"
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                          checked={settings.learning.enable_progress_tracking}
                          onChange={(e) => updateSetting('learning', 'enable_progress_tracking', e.target.checked)}
                        />
                        <label htmlFor="enable_progress_tracking" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                          詳細な進捗トラッキングを有効にする
                        </label>
                      </div>
                    </div>
                  </div>
                )}

                {/* Certificate Settings */}
                {activeTab === 'certificate' && settings && (
                  <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">証明書署名設定</h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      証明書に表示される署名情報を設定します。
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Input
                        label="会社名"
                        value={settings.certificate.company_name}
                        onChange={(e) => updateSetting('certificate', 'company_name', e.target.value)}
                        placeholder="株式会社SkillUp"
                      />

                      <Input
                        label="署名者の役職"
                        value={settings.certificate.signer_title}
                        onChange={(e) => updateSetting('certificate', 'signer_title', e.target.value)}
                        placeholder="研修担当部長"
                      />

                      <div className="md:col-span-2">
                        <Input
                          label="署名者氏名"
                          value={settings.certificate.signer_name}
                          onChange={(e) => updateSetting('certificate', 'signer_name', e.target.value)}
                          placeholder="山田 太郎"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        印鑑画像
                      </label>
                      {settings.certificate.stamp_image_url ? (
                        <div className="space-y-4">
                          <div className="flex items-center space-x-4">
                            <div className="w-24 h-24 border-2 border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white">
                              <img
                                src={settings.certificate.stamp_image_url}
                                alt="印鑑"
                                className="w-full h-full object-contain"
                              />
                            </div>
                            <div className="flex-1">
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                現在の印鑑画像
                              </p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-2"
                                onClick={() => updateSetting('certificate', 'stamp_image_url', '')}
                              >
                                画像を削除
                              </Button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-lg">
                            <div className="space-y-1 text-center">
                              <PhotoIcon className="mx-auto h-12 w-12 text-gray-400" />
                              <div className="flex text-sm text-gray-600">
                                <label
                                  htmlFor="stamp-upload"
                                  className="relative cursor-pointer rounded-md font-medium text-blue-600 hover:text-blue-500 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-blue-500"
                                >
                                  <span>ファイルを選択</span>
                                  <input
                                    id="stamp-upload"
                                    name="stamp-upload"
                                    type="file"
                                    className="sr-only"
                                    accept="image/*"
                                    onChange={async (e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        setUploadingStamp(true);
                                        try {
                                          const { data: { session } } = await supabase.auth.getSession();
                                          if (!session?.user?.id) {
                                            throw new Error('認証エラー: ログインが必要です');
                                          }

                                          // ユーザーIDを使用したパスに変更（RLS対応）
                                          const fileName = `${session.user.id}/stamps/stamp_${Date.now()}.${file.name.split('.').pop()}`;

                                          // まず既存のファイルを削除（あれば）
                                          if (settings?.certificate?.stamp_image_url) {
                                            const urlParts = settings.certificate.stamp_image_url.split('/');
                                            const oldFileName = urlParts[urlParts.length - 1];
                                            const oldPath = urlParts[urlParts.length - 2];
                                            if (oldFileName && oldFileName.startsWith('stamp_')) {
                                              try {
                                                await supabase.storage
                                                  .from('avatars')
                                                  .remove([`${session.user.id}/${oldPath}/${oldFileName}`]);
                                              } catch (e) {
                                                // 古いファイルの削除に失敗しても続行
                                                console.log('古いファイルの削除をスキップ');
                                              }
                                            }
                                          }

                                          const { data, error } = await supabase.storage
                                            .from('avatars')
                                            .upload(fileName, file, {
                                              upsert: true,
                                              cacheControl: '3600'
                                            });

                                          if (error) throw error;

                                          const { data: { publicUrl } } = supabase.storage
                                            .from('avatars')
                                            .getPublicUrl(fileName);

                                          updateSetting('certificate', 'stamp_image_url', publicUrl);
                                        } catch (error) {
                                          console.error('印鑑画像アップロードエラー:', error);
                                          alert('印鑑画像のアップロードに失敗しました。\n\nSupabaseのStorageバケット設定を確認してください：\n1. avatarsバケットが存在すること\n2. RLSポリシーが適切に設定されていること\n3. 管理者権限でログインしていること');
                                        } finally {
                                          setUploadingStamp(false);
                                        }
                                      }
                                    }}
                                  />
                                </label>
                                <p className="pl-1">またはドラッグ＆ドロップ</p>
                              </div>
                              <p className="text-xs text-gray-500">
                                PNG, JPG, GIF 最大10MB
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 rounded-lg p-4">
                      <div className="flex">
                        <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 mt-0.5" />
                        <div className="ml-3">
                          <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                            署名設定に関する注意
                          </h3>
                          <p className="mt-1 text-sm text-yellow-700 dark:text-yellow-300">
                            ここで設定した署名情報は、全ての証明書に適用されます。印鑑画像は背景が透明なPNG形式を推奨します。
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Save Button */}
                {activeTab !== 'security' && (
                <div className="mt-8 flex justify-end space-x-4 pt-6 border-t border-gray-200 dark:border-neutral-800">
                  <Button
                    variant="outline"
                    onClick={fetchSettings}
                  >
                    リセット
                  </Button>
                  <Button
                    onClick={saveSettings}
                    loading={saving}
                  >
                    <CheckCircleIcon className="h-4 w-4 mr-2" />
                    {saving ? '保存中...' : '設定を保存'}
                  </Button>
                </div>
                )}
              </div>
            </div>
          </div>

          {/* System Version */}
          <div className="mt-8 bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">システムバージョン</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">SKILLUP LMS</p>
              </div>
              <div className="text-right">
                <p className="text-lg font-semibold text-gray-900 dark:text-white">v0.1.0</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">2025-11-07</p>
              </div>
            </div>
          </div>

          {/* Help Information */}
          <div className="mt-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-xl p-6">
            <div className="flex items-start">
              <InformationCircleIcon className="h-6 w-6 text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold text-blue-900 mb-2">
                  システム設定に関する注意事項
                </h3>
                <div className="text-sm text-blue-800 space-y-1">
                  <p>• 設定変更後は必ず「設定を保存」ボタンをクリックしてください</p>
                  <p>• メンテナンスモード中は管理者以外はサイトにアクセスできません</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}