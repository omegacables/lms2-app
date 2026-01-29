'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/database/supabase';
import { certificatesClient } from '@/lib/database/supabase-no-cache';
import { generateCertificatePDF, type CertificateData } from '@/lib/utils/certificatePDF';
import { generateCertificateId } from '@/lib/utils';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import {
  DocumentCheckIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  DocumentArrowDownIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';

interface Certificate {
  id: string;
  user_id: string;
  course_id: number;
  user_name: string;
  course_title: string;
  completion_date: string;
  pdf_url?: string | null;
  is_active: boolean;
  created_at: string;
  // ユーザー情報
  user_profiles?: {
    display_name?: string;
    email?: string;
    company?: string;
    department?: string;
  };
  // コース情報
  courses?: {
    title?: string;
    description?: string;
  };
}

export default function CertificatesManagement() {
  const { user, isAdmin } = useAuth();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [reissuingId, setReissuingId] = useState<string | null>(null);

  useEffect(() => {
    if (user && isAdmin) {
      fetchCertificates();
    }
  }, [user, isAdmin]);

  // 証明書署名設定を取得
  const fetchCertificateSettings = async () => {
    try {
      console.log('=== 証明書設定を取得中（管理者画面） ===');
      const { data: settingsData, error } = await supabase
        .from('system_settings')
        .select('*')
        .in('setting_key', [
          'certificate.company_name',
          'certificate.signer_name',
          'certificate.signer_title',
          'certificate.stamp_image_url'
        ]);

      if (error) {
        console.error('❌ 証明書設定取得エラー:', error);
        return null;
      }

      console.log('取得した設定データ（生データ）:', settingsData);

      // 設定を整形
      const settings = {
        company_name: '',
        signer_name: '',
        signer_title: '',
        stamp_image_url: ''
      };

      settingsData?.forEach(item => {
        console.log(`設定項目: ${item.setting_key} = ${item.setting_value}`);
        const key = item.setting_key.split('.')[1];
        if (key) {
          settings[key as keyof typeof settings] = item.setting_value || '';
        }
      });

      console.log('✅ 証明書設定を取得しました:', settings);
      return settings;
    } catch (err) {
      console.error('❌ 証明書設定取得エラー:', err);
      return null;
    }
  };

  // コース完了日付を再計算（status='completed'の動画の最終日時、受講状況ページと同じ判定）
  const recalculateCompletionDate = async (userId: string, courseId: number) => {
    try {
      console.log('=== コース完了日付を再計算中（管理者画面） ===');
      console.log('ユーザーID:', userId);
      console.log('コースID:', courseId);

      // 完了した視聴ログを取得（status = 'completed'）
      const { data: logsData, error: logsError } = await supabase
        .from('video_view_logs')
        .select('*')
        .eq('course_id', courseId)
        .eq('user_id', userId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false });

      if (logsError) {
        console.error('❌ 視聴ログ取得エラー:', logsError);
        return new Date();
      }

      console.log('完了済み視聴ログ件数:', logsData?.length || 0);

      // 最後に完了した動画の日時を取得
      if (logsData && logsData.length > 0) {
        const lastCompletedLog = logsData.reduce((latest, log) => {
          const logDate = new Date(log.completed_at || log.last_updated || log.created_at);
          const latestDate = new Date(latest.completed_at || latest.last_updated || latest.created_at);
          return logDate > latestDate ? log : latest;
        }, logsData[0]);

        const completionDate = new Date(lastCompletedLog.completed_at || lastCompletedLog.last_updated || lastCompletedLog.created_at);
        console.log('✅ 再計算した完了日付:', completionDate.toISOString());
        return completionDate;
      }

      console.log('⚠️ 完了済みログがありません。現在時刻を使用します');
      return new Date();
    } catch (err) {
      console.error('❌ 完了日付再計算エラー:', err);
      return new Date();
    }
  };

  const fetchCertificates = async () => {
    try {
      setLoading(true);
      console.log('管理者画面: 証明書を取得中...');

      // 直接Supabaseから取得
      const { data: certificatesData, error: certError } = await supabase
        .from('certificates')
        .select(`
          *,
          user_profiles (
            id,
            display_name,
            email,
            company,
            department
          ),
          courses (
            id,
            title,
            description
          )
        `)
        .order('created_at', { ascending: false });

      if (certError) {
        console.error('証明書取得エラー:', certError);

        // エラー時はフォールバックとして個別に取得
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('certificates')
          .select('*')
          .order('created_at', { ascending: false });

        if (fallbackError) {
          console.error('フォールバッククエリも失敗:', fallbackError);
          setCertificates([]);
        } else if (fallbackData) {
          console.log('フォールバックで取得した証明書:', fallbackData);

          // ユーザー情報とコース情報を個別に取得
          const enrichedCertificates = await Promise.all(
            fallbackData.map(async (cert) => {
              const { data: userProfile } = await supabase
                .from('user_profiles')
                .select('id, display_name, email, company, department')
                .eq('id', cert.user_id)
                .single();

              const { data: courseData } = await supabase
                .from('courses')
                .select('id, title, description')
                .eq('id', cert.course_id)
                .single();

              return {
                ...cert,
                user_profiles: userProfile,
                courses: courseData
              };
            })
          );

          setCertificates(enrichedCertificates);
          console.log('管理者画面: 証明書データ（フォールバック）:', enrichedCertificates);
        }
      } else {
        console.log('管理者画面: 取得した証明書:', certificatesData);
        setCertificates(certificatesData || []);
      }
    } catch (error) {
      console.error('証明書データの取得エラー:', error);
      setCertificates([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeCertificate = async (certificateId: string) => {
    if (!confirm('この証明書を無効化しますか？')) return;

    try {
      const { error } = await supabase
        .from('certificates')
        .update({ is_active: false })
        .eq('id', certificateId);

      if (error) throw error;

      await fetchCertificates();
      alert('証明書を無効化しました。');
    } catch (error) {
      console.error('証明書無効化エラー:', error);
      alert('証明書の無効化に失敗しました。');
    }
  };

  const handleReissueCertificate = async (certificate: Certificate) => {
    if (!confirm('既存の証明書を削除して、新しい証明書番号で再発行します。完了日付は視聴ログから再計算されます。よろしいですか？')) return;

    setReissuingId(certificate.id);

    try {
      console.log('=== 証明書を削除して再発行します（管理者画面） ===');
      console.log('既存証明書ID:', certificate.id);
      console.log('ユーザーID:', certificate.user_id);
      console.log('コースID:', certificate.course_id);

      // 1. 完了日付を再計算
      console.log('ステップ1: 完了日付を再計算');
      const newCompletionDate = await recalculateCompletionDate(certificate.user_id, certificate.course_id);

      // 2. 証明書設定を取得
      console.log('ステップ2: 証明書設定を取得');
      const settings = await fetchCertificateSettings();

      console.log('再発行時の証明書設定:', settings);
      console.log('再発行時の完了日付:', newCompletionDate);

      // 3. 既存の証明書を削除
      console.log('ステップ3: 既存証明書を削除');
      const { error: deleteError } = await certificatesClient.delete(certificate.id);

      if (deleteError) {
        console.error('証明書削除エラー:', deleteError);
        throw new Error('既存の証明書の削除に失敗しました');
      }

      console.log('✅ 既存証明書を削除しました');

      // 4. 新しい証明書を生成
      console.log('ステップ4: 新しい証明書を生成');
      await new Promise(resolve => setTimeout(resolve, 500)); // 少し待機

      const newCertificateId = generateCertificateId();

      // ユーザー情報を取得
      const { data: userProfile } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', certificate.user_id)
        .single();

      // コース情報を取得
      const { data: courseData } = await supabase
        .from('courses')
        .select('*')
        .eq('id', certificate.course_id)
        .single();

      // 視聴ログを取得して総視聴時間を計算
      const { data: viewLogs } = await supabase
        .from('video_view_logs')
        .select('*')
        .eq('course_id', certificate.course_id)
        .eq('user_id', certificate.user_id);

      const totalWatchTime = viewLogs?.reduce((sum, log) => sum + (log.total_watched_time || 0), 0) || 0;

      // 動画数を取得
      const { data: videos } = await supabase
        .from('videos')
        .select('id')
        .eq('course_id', certificate.course_id)
        .eq('status', 'active');

      const totalVideos = videos?.length || 0;

      // データベースに保存
      const insertData = {
        id: newCertificateId,
        user_id: certificate.user_id,
        course_id: certificate.course_id,
        user_name: userProfile?.display_name || userProfile?.email || 'ユーザー',
        course_title: courseData?.title || 'コース名',
        completion_date: newCompletionDate.toISOString(),
        pdf_url: null,
        is_active: true,
        created_at: new Date().toISOString()
      };

      console.log('新規証明書データ:', insertData);

      const { data: newCertificate, error: dbError } = await certificatesClient
        .insert(insertData)
        .then(result => result.single());

      if (dbError) {
        console.error('証明書保存エラー:', dbError);
        throw new Error('新しい証明書の保存に失敗しました');
      }

      console.log('✅ 新しい証明書を生成しました:', newCertificate);

      // 5. PDFダウンロード（最新の設定と完了日付を使用）
      console.log('ステップ5: PDFを生成してダウンロード');
      const certificateData: CertificateData = {
        certificateId: newCertificate.id,
        courseName: courseData?.title || 'コース名',
        userName: userProfile?.display_name || userProfile?.email || 'ユーザー',
        completionDate: format(newCompletionDate, 'yyyy年MM月dd日', { locale: ja }),
        issueDate: format(new Date(), 'yyyy年MM月dd日', { locale: ja }),
        totalVideos: totalVideos,
        totalWatchTime: Math.round(totalWatchTime / 60),
        courseDescription: courseData?.description || '',
        organization: '企業研修LMS',
        company: userProfile?.company || undefined,
        issuerCompanyName: settings?.company_name || undefined,
        signerName: settings?.signer_name || undefined,
        signerTitle: settings?.signer_title || undefined,
        stampImageUrl: settings?.stamp_image_url || undefined,
      };

      console.log('=== 再発行証明書PDFデータ（署名情報・完了日付含む） ===');
      console.log(certificateData);
      await generateCertificatePDF(certificateData);

      console.log('✅ 証明書を再発行しました:', newCertificate.id);

      // 証明書一覧を更新
      await fetchCertificates();
      alert('証明書を再発行しました。PDFがダウンロードされます。');

    } catch (error) {
      console.error('❌ 証明書再発行エラー:', error);
      alert('証明書の再発行に失敗しました: ' + (error instanceof Error ? error.message : '不明なエラー'));
      // エラー時は証明書一覧を再取得
      await fetchCertificates();
    } finally {
      setReissuingId(null);
    }
  };

  const handleDownloadCertificate = async (certificate: Certificate) => {
    if (downloadingId === certificate.id) return;

    setDownloadingId(certificate.id);

    try {
      console.log('=== 証明書PDFをダウンロード（管理者画面） ===');

      // 証明書設定を取得
      const settings = await fetchCertificateSettings();

      // 視聴ログを取得して総視聴時間を計算
      const { data: viewLogs } = await supabase
        .from('video_view_logs')
        .select('*')
        .eq('course_id', certificate.course_id)
        .eq('user_id', certificate.user_id);

      const totalWatchTime = viewLogs?.reduce((sum, log) => sum + (log.total_watched_time || 0), 0) || 0;

      // 動画数を取得
      const { data: videos } = await supabase
        .from('videos')
        .select('id')
        .eq('course_id', certificate.course_id)
        .eq('status', 'active');

      const totalVideos = videos?.length || 0;

      // 手動設定日があればそれを優先、なければcompletion_dateを使用
      const effectiveIssueDate = certificate.manual_issue_date || certificate.completion_date;

      const certificateData: CertificateData = {
        certificateId: certificate.id,
        courseName: certificate.course_title || certificate.courses?.title || 'コース名',
        userName: certificate.user_name || certificate.user_profiles?.display_name || certificate.user_profiles?.email || 'ユーザー名',
        completionDate: new Date(effectiveIssueDate).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        issueDate: new Date(certificate.created_at).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        totalVideos: totalVideos,
        totalWatchTime: Math.round(totalWatchTime / 60),
        courseDescription: certificate.courses?.description || '',
        organization: '企業研修LMS',
        company: certificate.user_profiles?.company || undefined,
        issuerCompanyName: settings?.company_name || undefined,
        signerName: settings?.signer_name || undefined,
        signerTitle: settings?.signer_title || undefined,
        stampImageUrl: settings?.stamp_image_url || undefined,
      };

      console.log('証明書PDFデータ（署名情報含む）:', certificateData);
      await generateCertificatePDF(certificateData);
    } catch (error) {
      console.error('ダウンロードエラー:', error);
      alert('ダウンロードに失敗しました。');
    } finally {
      setDownloadingId(null);
    }
  };

  // フィルタリング
  const filteredCertificates = certificates.filter(cert => {
    const matchesSearch =
      cert.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.user_profiles?.display_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.user_profiles?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.course_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.courses?.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.user_profiles?.company?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' ||
      (statusFilter === 'active' && cert.is_active) ||
      (statusFilter === 'inactive' && !cert.is_active);

    return matchesSearch && matchesStatus;
  });

  if (!user || !isAdmin) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="max-w-2xl mx-auto px-4 py-16 text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">アクセス権限がありません</h1>
            <p className="text-gray-600 dark:text-gray-400 mb-6">このページは管理者のみアクセス可能です。</p>
            <Link href="/dashboard">
              <Button>ダッシュボードに戻る</Button>
            </Link>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

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
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* ヘッダーセクション */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center mr-4">
                  <DocumentCheckIcon className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">証明書管理</h1>
                  <p className="text-gray-600 dark:text-gray-400">発行された証明書の管理・監視ができます。</p>
                </div>
              </div>
              <div className="flex space-x-3">
                <Button onClick={fetchCertificates} variant="outline" className="flex items-center">
                  <ArrowPathIcon className="h-4 w-4 mr-2" />
                  更新
                </Button>
                <Link href="/admin">
                  <Button variant="outline">
                    ダッシュボードに戻る
                  </Button>
                </Link>
              </div>
            </div>
          </div>

          {/* 統計サマリー */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-gradient-to-r from-green-500 to-green-600 rounded-lg p-6 text-white">
              <div className="text-2xl font-bold">{certificates.filter(c => c.is_active).length}</div>
              <div className="text-green-100">有効な証明書</div>
            </div>
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
              <div className="text-2xl font-bold">{certificates.length}</div>
              <div className="text-blue-100">総発行数</div>
            </div>
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white">
              <div className="text-2xl font-bold">{certificates.filter(c => {
                const now = new Date();
                const certDate = new Date(c.created_at);
                return (now.getTime() - certDate.getTime()) <= (7 * 24 * 60 * 60 * 1000);
              }).length}</div>
              <div className="text-purple-100">今週の発行</div>
            </div>
            <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-lg p-6 text-white">
              <div className="text-2xl font-bold">{certificates.filter(c => !c.is_active).length}</div>
              <div className="text-red-100">無効化済み</div>
            </div>
          </div>

          {/* フィルターセクション */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg border p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">検索</label>
                <div className="relative">
                  <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="学生名、コース名、証明書ID..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ステータス</label>
                <select
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-neutral-800 text-gray-900 dark:text-gray-100"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
                >
                  <option value="all">すべて</option>
                  <option value="active">有効</option>
                  <option value="inactive">無効</option>
                </select>
              </div>
            </div>
          </div>

          {/* 証明書一覧 */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border">
            <div className="p-6 border-b border-gray-200 dark:border-neutral-800">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                証明書一覧 ({filteredCertificates.length}件)
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50 dark:bg-black">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      証明書ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      受講者
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      コース
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      発行日
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      ステータス
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      アクション
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-gray-700">
                  {filteredCertificates.map((certificate) => (
                    <tr key={certificate.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-gray-100">
                        {certificate.id.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {certificate.user_name || certificate.user_profiles?.display_name || certificate.user_profiles?.email}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {certificate.user_profiles?.email}
                          </div>
                          {certificate.user_profiles?.company && (
                            <div className="text-xs text-gray-400">
                              {certificate.user_profiles.company}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {certificate.course_title || certificate.courses?.title}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {new Date(certificate.manual_issue_date || certificate.completion_date).toLocaleDateString('ja-JP')}
                        {certificate.manual_issue_date && (
                          <span className="ml-1 text-xs text-blue-600 dark:text-blue-400">(手動)</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          certificate.is_active
                            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                        }`}>
                          {certificate.is_active ? '有効' : '無効'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex items-center text-blue-600 hover:text-blue-700"
                            onClick={() => handleDownloadCertificate(certificate)}
                            disabled={downloadingId === certificate.id}
                          >
                            <DocumentArrowDownIcon className="h-4 w-4 mr-1" />
                            {downloadingId === certificate.id ? '生成中...' : 'PDF'}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-orange-600 hover:text-orange-700"
                            onClick={() => handleReissueCertificate(certificate)}
                            disabled={reissuingId === certificate.id}
                          >
                            {reissuingId === certificate.id ? '再発行中...' : '再発行'}
                          </Button>
                          {certificate.is_active ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleRevokeCertificate(certificate.id)}
                            >
                              無効化
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {filteredCertificates.length === 0 && (
              <div className="text-center py-12">
                <DocumentCheckIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">証明書がありません</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {searchTerm || statusFilter !== 'all' ? '検索条件に一致する証明書が見つかりません。' : '発行された証明書がありません。'}
                </p>
              </div>
            )}
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}