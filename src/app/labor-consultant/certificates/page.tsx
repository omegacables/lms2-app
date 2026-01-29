'use client';

import { useState, useEffect } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import { generateCertificatePDF, type CertificateData } from '@/lib/utils/certificatePDF';
import {
  MagnifyingGlassIcon,
  TrophyIcon,
  UserIcon,
  AcademicCapIcon,
  CalendarIcon,
  DocumentArrowDownIcon,
  PencilIcon,
  CheckIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

interface Certificate {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  company: string;
  department: string;
  course_id: number;
  course_title: string;
  completion_date: string;
  manual_issue_date: string | null;
  pdf_url: string | null;
  is_active: boolean;
  created_at: string;
}

export default function LaborConsultantCertificatesPage() {
  const { user } = useAuth();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [assignedCompanies, setAssignedCompanies] = useState<string[]>([]);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [editingIssueDateId, setEditingIssueDateId] = useState<string | null>(null);
  const [editingIssueDate, setEditingIssueDate] = useState<string>('');
  const [savingIssueDate, setSavingIssueDate] = useState(false);

  useEffect(() => {
    fetchCertificates();
  }, [user?.id]);

  const fetchCertificates = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // 担当会社を取得
      const { data: companiesData } = await supabase
        .from('labor_consultant_companies')
        .select('company')
        .eq('labor_consultant_id', user.id);

      const companies = companiesData?.map(c => c.company) || [];
      setAssignedCompanies(companies);

      if (companies.length === 0) {
        setLoading(false);
        return;
      }

      // 担当会社の生徒を取得
      const { data: studentsData } = await supabase
        .from('user_profiles')
        .select('id, display_name, email, company, department')
        .in('company', companies);

      if (!studentsData || studentsData.length === 0) {
        setLoading(false);
        return;
      }

      const studentIds = studentsData.map(s => s.id);

      // 証明書を取得
      const { data: certificatesData, error: certificatesError } = await supabase
        .from('certificates')
        .select('*')
        .in('user_id', studentIds)
        .order('created_at', { ascending: false });

      if (certificatesError) throw certificatesError;

      // コース情報を取得
      const courseIds = [...new Set(certificatesData?.map(cert => cert.course_id) || [])];
      const { data: coursesData } = await supabase
        .from('courses')
        .select('id, title')
        .in('id', courseIds);

      // データを結合
      const certificatesWithDetails = (certificatesData || []).map(cert => {
        const student = studentsData.find(s => s.id === cert.user_id);
        const course = coursesData?.find(c => c.id === cert.course_id);

        return {
          ...cert,
          user_name: student?.display_name || cert.user_name || '',
          user_email: student?.email || '',
          company: student?.company || '',
          department: student?.department || '',
          course_title: course?.title || cert.course_title || ''
        };
      });

      setCertificates(certificatesWithDetails);

    } catch (error) {
      console.error('証明書取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('ja-JP');
  };

  // 日付をISO形式から入力用形式に変換
  const formatDateForInput = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toISOString().slice(0, 10);
  };

  // 証明書の有効な発行日を取得（手動設定日を優先）
  const getEffectiveIssueDate = (cert: Certificate) => {
    return cert.manual_issue_date || cert.completion_date;
  };

  // 発行日編集を開始
  const startEditingIssueDate = (cert: Certificate) => {
    setEditingIssueDateId(cert.id);
    setEditingIssueDate(formatDateForInput(getEffectiveIssueDate(cert)));
  };

  // 発行日の保存
  const handleSaveIssueDate = async (cert: Certificate) => {
    if (!editingIssueDate) {
      setEditingIssueDateId(null);
      return;
    }

    setSavingIssueDate(true);
    try {
      // 日付を ISO 形式に変換（時刻は00:00:00を設定）
      const newIssueDate = new Date(editingIssueDate + 'T00:00:00').toISOString();

      const { error } = await supabase
        .from('certificates')
        .update({ manual_issue_date: newIssueDate })
        .eq('id', cert.id);

      if (error) {
        console.error('発行日更新エラー:', error);
        alert('発行日の更新に失敗しました。');
      } else {
        alert('発行日を更新しました。');
        setEditingIssueDateId(null);
        fetchCertificates();
      }
    } catch (error) {
      console.error('発行日更新エラー:', error);
      alert('発行日の更新に失敗しました。');
    } finally {
      setSavingIssueDate(false);
    }
  };

  // 証明書署名設定を取得
  const fetchCertificateSettings = async () => {
    try {
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
        console.error('証明書設定取得エラー:', error);
        return null;
      }

      const settings = {
        company_name: '',
        signer_name: '',
        signer_title: '',
        stamp_image_url: ''
      };

      settingsData?.forEach(item => {
        const key = item.setting_key.split('.')[1];
        if (key) {
          settings[key as keyof typeof settings] = item.setting_value || '';
        }
      });

      return settings;
    } catch (err) {
      console.error('証明書設定取得エラー:', err);
      return null;
    }
  };

  // PDFダウンロード処理
  const handleDownloadCertificate = async (cert: Certificate) => {
    if (downloadingId === cert.id) return;

    setDownloadingId(cert.id);

    try {
      console.log('=== 証明書PDFをダウンロード（社労士画面） ===');

      // 証明書設定を取得
      const settings = await fetchCertificateSettings();

      // 視聴ログを取得して総視聴時間を計算
      const { data: viewLogs } = await supabase
        .from('video_view_logs')
        .select('*')
        .eq('course_id', cert.course_id)
        .eq('user_id', cert.user_id);

      const totalWatchTime = viewLogs?.reduce((sum, log) => sum + (log.total_watched_time || 0), 0) || 0;

      // 動画数を取得
      const { data: videos } = await supabase
        .from('videos')
        .select('id')
        .eq('course_id', cert.course_id)
        .eq('status', 'active');

      const totalVideos = videos?.length || 0;

      // コース情報を取得
      const { data: courseData } = await supabase
        .from('courses')
        .select('description')
        .eq('id', cert.course_id)
        .single();

      // 手動設定日があればそれを優先、なければcompletion_dateを使用
      const effectiveIssueDate = cert.manual_issue_date || cert.completion_date;

      const certificateData: CertificateData = {
        certificateId: cert.id,
        courseName: cert.course_title || 'コース名',
        userName: cert.user_name || 'ユーザー名',
        completionDate: new Date(effectiveIssueDate).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        issueDate: new Date(cert.created_at).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        totalVideos: totalVideos,
        totalWatchTime: Math.round(totalWatchTime / 60),
        courseDescription: courseData?.description || '',
        organization: '企業研修LMS',
        company: cert.company || undefined,
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
      cert.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cert.course_title.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCompany = filterCompany === 'all' || cert.company === filterCompany;

    return matchesSearch && matchesCompany;
  });

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
        <div className="container mx-auto px-4 py-8">
          {/* ヘッダー */}
          <div className="mb-8">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center mr-4">
                <TrophyIcon className="h-6 w-6 text-yellow-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">証明書管理</h1>
                <p className="text-gray-600 dark:text-gray-400">担当生徒の取得済み証明書一覧</p>
              </div>
            </div>
          </div>

          {assignedCompanies.length === 0 ? (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 text-center">
              <p className="text-yellow-800 dark:text-yellow-200">
                現在、担当会社が割り当てられていません。管理者にお問い合わせください。
              </p>
            </div>
          ) : (
            <>
              {/* 検索・フィルター */}
              <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-4 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* 検索 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      検索
                    </label>
                    <div className="relative">
                      <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <Input
                        type="text"
                        placeholder="名前、コース名で検索..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10"
                      />
                    </div>
                  </div>

                  {/* 会社フィルター */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      会社
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                      value={filterCompany}
                      onChange={(e) => setFilterCompany(e.target.value)}
                    >
                      <option value="all">すべて</option>
                      {assignedCompanies.map((company) => (
                        <option key={company} value={company}>{company}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* 統計サマリー */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">総証明書数</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">{filteredCertificates.length}</p>
                    </div>
                    <TrophyIcon className="h-8 w-8 text-yellow-500" />
                  </div>
                </div>

                <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">今月の発行数</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {filteredCertificates.filter(cert => {
                          const certDate = new Date(cert.created_at);
                          const now = new Date();
                          return certDate.getMonth() === now.getMonth() &&
                                 certDate.getFullYear() === now.getFullYear();
                        }).length}
                      </p>
                    </div>
                    <CalendarIcon className="h-8 w-8 text-blue-500" />
                  </div>
                </div>

                <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">アクティブ証明書</p>
                      <p className="text-2xl font-bold text-gray-900 dark:text-white">
                        {filteredCertificates.filter(cert => cert.is_active).length}
                      </p>
                    </div>
                    <DocumentArrowDownIcon className="h-8 w-8 text-green-500" />
                  </div>
                </div>
              </div>

              {/* 証明書一覧テーブル */}
              <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-neutral-800">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          生徒
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
                          操作
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-gray-700">
                      {filteredCertificates.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                            証明書が見つかりません
                          </td>
                        </tr>
                      ) : (
                        filteredCertificates.map((cert) => (
                          <tr key={cert.id} className="hover:bg-gray-50 dark:hover:bg-neutral-800">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <UserIcon className="h-5 w-5 text-gray-400 mr-2" />
                                <div>
                                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                                    {cert.user_name}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {cert.company}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center">
                                <AcademicCapIcon className="h-5 w-5 text-gray-400 mr-2" />
                                <div className="text-sm text-gray-900 dark:text-white">
                                  {cert.course_title}
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {editingIssueDateId === cert.id ? (
                                <div className="flex items-center space-x-2">
                                  <input
                                    type="date"
                                    value={editingIssueDate}
                                    onChange={(e) => setEditingIssueDate(e.target.value)}
                                    className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-neutral-800 text-gray-900 dark:text-white w-36"
                                  />
                                  <button
                                    onClick={() => handleSaveIssueDate(cert)}
                                    disabled={savingIssueDate}
                                    className="p-1 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50"
                                    title="保存"
                                  >
                                    <CheckIcon className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => setEditingIssueDateId(null)}
                                    disabled={savingIssueDate}
                                    className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                                    title="キャンセル"
                                  >
                                    <XMarkIcon className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <div className="flex items-center space-x-2">
                                  <span className="text-sm text-gray-900 dark:text-white">
                                    {formatDate(getEffectiveIssueDate(cert))}
                                  </span>
                                  {cert.manual_issue_date && (
                                    <span className="text-xs text-blue-600 dark:text-blue-400">(手動)</span>
                                  )}
                                  <button
                                    onClick={() => startEditingIssueDate(cert)}
                                    className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                    title="発行日を編集"
                                  >
                                    <PencilIcon className="h-4 w-4" />
                                  </button>
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span
                                className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                                  cert.is_active
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400'
                                }`}
                              >
                                {cert.is_active ? 'アクティブ' : '無効'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm">
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex items-center text-blue-600 hover:text-blue-700"
                                onClick={() => handleDownloadCertificate(cert)}
                                disabled={downloadingId === cert.id}
                              >
                                <DocumentArrowDownIcon className="h-4 w-4 mr-1" />
                                {downloadingId === cert.id ? '生成中...' : 'PDF'}
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
