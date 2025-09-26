'use client';

import { useState, useEffect } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/database/supabase';
import { certificatesClient } from '@/lib/database/supabase-no-cache';
import { fetchAllCertificatesAdmin } from '@/lib/database/test-certificates';
import {
  AcademicCapIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  CheckCircleIcon,
  TrophyIcon,
} from '@heroicons/react/24/outline';
import { generateCertificatePDF, type CertificateData } from '@/lib/utils/certificatePDF';

type Certificate = {
  id: string;
  user_id: string;
  course_id: number;
  user_name: string;
  course_title: string;
  completion_date: string;
  pdf_url?: string | null;
  is_active: boolean;
  created_at: string;
  courses?: {
    id: number;
    title: string;
    description?: string | null;
    thumbnail_url?: string | null;
  };
};

export default function CertificatesPage() {
  const { user } = useAuth();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [userProfile, setUserProfile] = useState<any>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any>(null);

  const fetchUserProfile = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (error) throw error;
      setUserProfile(data);
    } catch (err) {
      console.error('Error fetching user profile:', err);
    }
  };

  useEffect(() => {
    if (user) {
      fetchCertificates();
      fetchUserProfile();
    }
  }, [user]);

  const fetchCertificates = async () => {
    if (!user) return;

    try {
      setLoading(true);
      console.log('証明書を取得中... ユーザーID:', user.id);

      // まず管理者権限でデータを確認（デバッグ用）
      if (process.env.NODE_ENV === 'development') {
        const adminResult = await fetchAllCertificatesAdmin(user.id);
        console.log('Admin権限での取得結果:', adminResult);
        setDebugInfo({
          adminFetch: adminResult,
          userId: user.id,
          timestamp: new Date().toISOString()
        });
      }

      // シンプルな直接クエリで証明書を取得
      const { data, error } = await supabase
        .from('certificates')
        .select(`
          *,
          courses (
            id,
            title,
            description,
            thumbnail_url
          )
        `)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('completion_date', { ascending: false });

      if (error) {
        console.error('証明書取得エラー:', error);
        setDebugInfo((prev: any) => ({
          ...prev,
          normalFetchError: error,
          errorMessage: error.message,
          errorCode: error.code
        }));

        // エラー時は別の方法で試す
        const { data: fallbackData, error: fallbackError } = await supabase
          .from('certificates')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('completion_date', { ascending: false });

        if (fallbackError) {
          console.error('フォールバッククエリも失敗:', fallbackError);
          setCertificates([]);
        } else if (fallbackData) {
          console.log('フォールバッククエリで取得:', fallbackData);

          // コース情報を個別に取得
          const certificatesWithCourses = await Promise.all(
            fallbackData.map(async (cert) => {
              const { data: courseData } = await supabase
                .from('courses')
                .select('id, title, description, thumbnail_url')
                .eq('id', cert.course_id)
                .single();

              return {
                ...cert,
                courses: courseData
              };
            })
          );

          setCertificates(certificatesWithCourses);
          console.log('証明書データ（フォールバック）:', certificatesWithCourses);
        }
      } else {
        console.log('取得した証明書:', data);
        setCertificates(data || []);
        setDebugInfo((prev: any) => ({
          ...prev,
          normalFetchSuccess: true,
          certificateCount: data?.length || 0
        }));

        // データがない場合、デバッグ用に全証明書を確認
        if (!data || data.length === 0) {
          const { data: allCerts } = await supabase
            .from('certificates')
            .select('user_id, course_id, is_active')
            .eq('user_id', user.id);

          console.log('該当ユーザーの全証明書（デバッグ）:', allCerts);
          setDebugInfo((prev: any) => ({
            ...prev,
            allUserCertificates: allCerts
          }));
        }
      }
    } catch (error) {
      console.error('予期しないエラー:', error);
      setCertificates([]);
      setDebugInfo((prev: any) => ({
        ...prev,
        unexpectedError: error
      }));
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (certificate: Certificate) => {
    if (downloadingId === certificate.id) return;

    setDownloadingId(certificate.id);

    try {
      // 証明書データを準備
      const certificateData: CertificateData = {
        certificateId: certificate.id,
        courseName: certificate.course_title || certificate.courses?.title || 'コース名',
        userName: certificate.user_name || userProfile?.display_name || user?.email || 'ユーザー名',
        completionDate: new Date(certificate.completion_date).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        issueDate: new Date(certificate.created_at).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        totalVideos: 0, // 実際の動画数を取得する必要がある場合は別途クエリ
        totalWatchTime: 0, // 実際の視聴時間を取得する必要がある場合は別途クエリ
        courseDescription: certificate.courses?.description || '',
        organization: '企業研修LMS',
        company: userProfile?.company || undefined,
      };

      await generateCertificatePDF(certificateData);
    } catch (error) {
      console.error('ダウンロードエラー:', error);
      alert('ダウンロードに失敗しました。');
    } finally {
      setDownloadingId(null);
    }
  };

  const filteredCertificates = certificates.filter(cert => {
    const matchesSearch = cert.course_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         cert.courses?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         cert.id.toLowerCase().includes(searchQuery.toLowerCase());

    const certYear = new Date(cert.completion_date).getFullYear().toString();
    const matchesYear = selectedYear === 'all' || certYear === selectedYear;

    return matchesSearch && matchesYear;
  });

  const availableYears = Array.from(new Set(certificates.map(cert =>
    new Date(cert.completion_date).getFullYear().toString()
  ))).sort().reverse();

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
            <div className="flex items-center mb-4">
              <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mr-4">
                <AcademicCapIcon className="h-6 w-6 text-purple-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">証明書</h1>
                <p className="text-gray-600 dark:text-gray-400">取得した証明書を管理・ダウンロードできます。</p>
              </div>
            </div>
          </div>

          {/* 統計サマリー */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircleIcon className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-500">取得済み証明書</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {certificates.length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <CalendarIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-500">今年度取得</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {certificates.filter(cert =>
                      new Date(cert.completion_date).getFullYear() === new Date().getFullYear()
                    ).length}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <TrophyIcon className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm text-gray-500">最新取得</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {certificates.length > 0 ?
                      new Date(certificates[0].completion_date).toLocaleDateString('ja-JP') :
                      '-'
                    }
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 検索・フィルターセクション */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6 mb-8">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white dark:bg-neutral-800 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                    placeholder="コース名、証明書IDで検索..."
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="block px-4 py-2 border border-gray-300 rounded-md leading-5 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-1 focus:ring-purple-500 focus:border-purple-500 sm:text-sm"
                >
                  <option value="all">全期間</option>
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}年</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* デバッグ情報（開発環境のみ） */}
          {process.env.NODE_ENV === 'development' && debugInfo && (
            <div className="mb-8 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-300 dark:border-yellow-700 rounded-lg">
              <h3 className="text-sm font-medium text-yellow-800 dark:text-yellow-300 mb-2">デバッグ情報</h3>
              <pre className="text-xs text-gray-600 dark:text-gray-400 overflow-x-auto">
                {JSON.stringify(debugInfo, null, 2)}
              </pre>
            </div>
          )}

          {/* 証明書リスト */}
          {filteredCertificates.length === 0 ? (
            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-12">
              <div className="text-center">
                <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">証明書がありません</h3>
                <p className="mt-1 text-sm text-gray-500">
                  {searchQuery || selectedYear !== 'all' ? '検索条件に一致する証明書が見つかりません。' : 'コースを完了すると証明書が発行されます。'}
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredCertificates.map((certificate) => (
                <div key={certificate.id} className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border overflow-hidden hover:shadow-md transition-shadow">
                  {/* サムネイル */}
                  {certificate.courses?.thumbnail_url ? (
                    <img
                      src={certificate.courses.thumbnail_url}
                      alt={certificate.course_title}
                      className="w-full h-48 object-cover"
                    />
                  ) : (
                    <div className="w-full h-48 bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                      <AcademicCapIcon className="h-24 w-24 text-white opacity-50" />
                    </div>
                  )}

                  {/* 証明書情報 */}
                  <div className="p-6">
                    <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                      {certificate.course_title || certificate.courses?.title}
                    </h3>

                    <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
                      <div className="flex items-center">
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        <span>完了日: {new Date(certificate.completion_date).toLocaleDateString('ja-JP')}</span>
                      </div>
                      <div className="flex items-center">
                        <DocumentTextIcon className="h-4 w-4 mr-2" />
                        <span>証明書ID: {certificate.id.substring(0, 8)}...</span>
                      </div>
                    </div>

                    {/* アクションボタン */}
                    <div className="mt-4 flex gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        className="flex-1"
                        onClick={() => handleDownload(certificate)}
                        disabled={downloadingId === certificate.id}
                      >
                        {downloadingId === certificate.id ? (
                          <>
                            <LoadingSpinner size="sm" className="mr-2" />
                            生成中...
                          </>
                        ) : (
                          <>
                            <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                            ダウンロード
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}