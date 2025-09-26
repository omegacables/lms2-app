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

  useEffect(() => {
    if (user && isAdmin) {
      fetchCertificates();
    }
  }, [user, isAdmin]);

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

  const handleReissueCertificate = async (certificateId: string) => {
    if (!confirm('この証明書を再発行しますか？')) return;

    try {
      const { error } = await supabase
        .from('certificates')
        .update({ is_active: true })
        .eq('id', certificateId);

      if (error) throw error;

      await fetchCertificates();
      alert('証明書を再発行しました。');
    } catch (error) {
      console.error('証明書再発行エラー:', error);
      alert('証明書の再発行に失敗しました。');
    }
  };

  const handleDownloadCertificate = async (certificate: Certificate) => {
    if (downloadingId === certificate.id) return;

    setDownloadingId(certificate.id);

    try {
      const certificateData: CertificateData = {
        certificateId: certificate.id,
        courseName: certificate.course_title || certificate.courses?.title || 'コース名',
        userName: certificate.user_name || certificate.user_profiles?.display_name || certificate.user_profiles?.email || 'ユーザー名',
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
        totalVideos: 0,
        totalWatchTime: 0,
        courseDescription: certificate.courses?.description || '',
        organization: '企業研修LMS',
        company: certificate.user_profiles?.company || undefined,
      };

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
                      完了日
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
                        {new Date(certificate.completion_date).toLocaleDateString('ja-JP')}
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
                          {certificate.is_active ? (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 hover:text-red-700"
                              onClick={() => handleRevokeCertificate(certificate.id)}
                            >
                              無効化
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 hover:text-green-700"
                              onClick={() => handleReissueCertificate(certificate.id)}
                            >
                              再発行
                            </Button>
                          )}
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