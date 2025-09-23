'use client';

import { useState, useEffect } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/database/supabase';
import { 
  AcademicCapIcon,
  DocumentTextIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  CheckCircleIcon,
  EyeIcon,
  ShareIcon,
  TrophyIcon,
  DocumentArrowDownIcon
} from '@heroicons/react/24/outline';
import type { Tables } from '@/lib/database/supabase';
import { generateCertificatePDF } from '@/lib/utils/certificatePDF';

type Certificate = Tables<'certificates'> & {
  courses?: {
    title: string;
    category_id: number;
    description?: string;
  };
  user_profile?: {
    display_name: string;
    company?: string;
  };
};

export default function CertificatesPage() {
  const { user } = useAuth();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedYear, setSelectedYear] = useState<string>('all');

  // モック証明書データ
  const mockCertificates: Certificate[] = [
    {
      id: 1,
      user_id: user?.id || 'mock-user',
      course_id: 1,
      certificate_number: 'LMS-2024-001',
      issued_at: '2024-01-15T10:00:00Z',
      expires_at: null,
      is_active: true,
      verification_code: 'ABC123DEF456',
      pdf_url: null,
      template_id: null,
      created_at: '2024-01-15T10:00:00Z',
      updated_at: '2024-01-15T10:00:00Z',
      courses: {
        title: 'JavaScript基礎講座',
        category_id: 1,
      }
    },
    {
      id: 2,
      user_id: user?.id || 'mock-user',
      course_id: 3,
      certificate_number: 'LMS-2024-002',
      issued_at: '2024-01-20T14:30:00Z',
      expires_at: null,
      is_active: true,
      verification_code: 'XYZ789GHI012',
      pdf_url: null,
      template_id: null,
      created_at: '2024-01-20T14:30:00Z',
      updated_at: '2024-01-20T14:30:00Z',
      courses: {
        title: 'データベース設計',
        category_id: 2,
      }
    },
  ];

  useEffect(() => {
    // モックデータを使用
    setCertificates(mockCertificates);
    setLoading(false);
  }, []);

  const fetchCertificates = async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('certificates')
        .select(`
          *,
          courses(title, category_id)
        `)
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('issued_at', { ascending: false });

      if (error) {
        console.error('証明書取得エラー:', error);
        return;
      }

      setCertificates(data || []);
    } catch (error) {
      console.error('証明書取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (certificate: Certificate) => {
    try {
      const userName = user?.profile?.display_name || user?.email || '受講者名';
      const company = user?.profile?.company;

      const doc = generateCertificatePDF(certificate, userName, company);
      doc.save(`certificate_${certificate.certificate_number}.pdf`);
    } catch (error) {
      console.error('ダウンロードエラー:', error);
      alert('ダウンロードに失敗しました。');
    }
  };

  const handleShare = (certificate: Certificate) => {
    const shareUrl = `${window.location.origin}/certificates/verify/${certificate.verification_code}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      alert('証明書の検証URLをクリップボードにコピーしました。');
    }).catch(() => {
      alert('コピーに失敗しました。');
    });
  };

  const filteredCertificates = certificates.filter(cert => {
    const matchesSearch = cert.courses?.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         cert.certificate_number.toLowerCase().includes(searchQuery.toLowerCase());
    
    const certYear = new Date(cert.issued_at).getFullYear().toString();
    const matchesYear = selectedYear === 'all' || certYear === selectedYear;
    
    return matchesSearch && matchesYear;
  });

  const availableYears = Array.from(new Set(certificates.map(cert => 
    new Date(cert.issued_at).getFullYear().toString()
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
            <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircleIcon className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">取得済み証明書</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{certificates.length}</p>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <CalendarIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">今年の取得数</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {certificates.filter(cert => 
                      new Date(cert.issued_at).getFullYear() === new Date().getFullYear()
                    ).length}
                  </p>
                </div>
              </div>
            </div>
            
            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <DocumentTextIcon className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">有効な証明書</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">
                    {certificates.filter(cert => cert.is_active).length}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* 検索・フィルターセクション */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6 mb-8">
            <div className="grid gap-4 md:grid-cols-2">
              {/* 検索 */}
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="証明書を検索..."
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* 年フィルター */}
              <select
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                <option value="all">すべての年</option>
                {availableYears.map(year => (
                  <option key={year} value={year}>{year}年</option>
                ))}
              </select>
            </div>
          </div>

          {/* 証明書一覧 */}
          {filteredCertificates.length === 0 ? (
            <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-8 text-center">
              <AcademicCapIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                {certificates.length === 0 ? '証明書がありません' : '検索結果が見つかりません'}
              </h3>
              <p className="text-gray-600 dark:text-gray-400">
                {certificates.length === 0 
                  ? 'コースを完了すると証明書が発行されます。'
                  : '検索条件を変更して再度お試しください。'
                }
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCertificates.map(certificate => (
                <div key={certificate.id} className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border overflow-hidden hover:shadow-md transition-shadow">
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start space-x-4">
                        <div className="w-16 h-16 bg-gradient-to-br from-yellow-100 to-yellow-200 rounded-lg flex items-center justify-center flex-shrink-0">
                          <TrophyIcon className="h-8 w-8 text-yellow-600" />
                        </div>
                        
                        <div className="min-w-0 flex-1">
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                            {certificate.courses?.title || 'コース名未設定'}
                          </h3>
                          <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400 mb-3">
                            <div className="flex items-center">
                              <DocumentTextIcon className="h-4 w-4 mr-1" />
                              証明書番号: {certificate.certificate_number}
                            </div>
                            <div className="flex items-center">
                              <CalendarIcon className="h-4 w-4 mr-1" />
                              発行日: {new Date(certificate.issued_at).toLocaleDateString('ja-JP')}
                            </div>
                          </div>
                          
                          <div className="flex items-center">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              <CheckCircleIcon className="h-3 w-3 mr-1" />
                              有効
                            </span>
                            {certificate.expires_at && (
                              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                有効期限: {new Date(certificate.expires_at).toLocaleDateString('ja-JP')}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleShare(certificate)}
                          className="flex items-center"
                        >
                          <ShareIcon className="h-4 w-4 mr-1" />
                          共有
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex items-center"
                        >
                          <EyeIcon className="h-4 w-4 mr-1" />
                          プレビュー
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => handleDownload(certificate)}
                          className="bg-blue-600 hover:bg-blue-700 flex items-center"
                        >
                          <DocumentArrowDownIcon className="h-4 w-4 mr-1" />
                          PDF
                        </Button>
                      </div>
                    </div>
                    
                    {/* 検証コード */}
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">検証コード</p>
                          <p className="text-sm font-mono text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-black px-2 py-1 rounded mt-1">
                            {certificate.verification_code}
                          </p>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          このコードを使って証明書の真正性を確認できます
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 証明書について */}
          <div className="mt-12 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-4">証明書について</h3>
            <div className="space-y-2 text-sm text-blue-700">
              <p>• 証明書は、コースを規定の完了率で修了した際に自動発行されます。</p>
              <p>• 発行された証明書はPDF形式でダウンロードできます。</p>
              <p>• 各証明書には固有の検証コードが付与され、真正性を確認できます。</p>
              <p>• 証明書の有効期限がある場合は、期限前に再受講をお願いします。</p>
            </div>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}