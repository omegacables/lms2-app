'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/database/supabase';
import {
  DocumentCheckIcon,
  ArrowDownTrayIcon,
  MagnifyingGlassIcon,
  EyeIcon,
  TrashIcon,
  FunnelIcon,
  ArrowPathIcon,
  TrophyIcon,
  CheckCircleIcon,
  DocumentArrowDownIcon,
  Cog6ToothIcon
} from '@heroicons/react/24/outline';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface Certificate {
  id: number;
  userId: string;
  courseId: number;
  courseName: string;
  studentName: string;
  studentEmail: string;
  studentCompany?: string;
  certificateId: string;
  issuedAt: string;
  completedAt: string;
  downloadCount: number;
  status: string;
}

export default function CertificatesManagement() {
  const { user, isAdmin } = useAuth();
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [sortBy, setSortBy] = useState<'name' | 'course' | 'company' | 'date'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  useEffect(() => {
    if (user && isAdmin) {
      fetchCertificates();
    }
  }, [user, isAdmin]);

  const fetchCertificates = async () => {
    try {
      setLoading(true);
      
      // まず証明書データを取得
      const { data: certificatesData, error: certError } = await supabase
        .from('certificates')
        .select(`
          *,
          courses!inner(title)
        `)
        .order('created_at', { ascending: false });

      if (certError) throw certError;

      // ユーザー情報を別途取得
      const userIds = [...new Set(certificatesData?.map(cert => cert.user_id) || [])];
      const { data: profilesData, error: profileError } = await supabase
        .from('user_profiles')
        .select('id, display_name, email, company')
        .in('id', userIds);

      if (profileError) throw profileError;

      // プロファイル情報をマップに変換
      const profileMap = new Map(
        profilesData?.map(profile => [profile.id, profile]) || []
      );

      const data = certificatesData;

      const formattedCertificates = data?.map((cert: any) => {
        const profile = profileMap.get(cert.user_id);
        return {
          id: cert.id,
          userId: cert.user_id,
          courseId: cert.course_id,
          courseName: cert.courses.title,
          studentName: profile?.display_name || profile?.email || '不明',
          studentEmail: profile?.email || '不明',
          studentCompany: profile?.company || '-',
          certificateId: cert.id || `CERT-${Date.now()}`,
          issuedAt: cert.created_at,
          completedAt: cert.completion_date || cert.created_at,
          downloadCount: 0,
          status: cert.is_active ? 'active' : 'revoked'
        };
      }) || [];

      setCertificates(formattedCertificates);
    } catch (error) {
      console.error('証明書データの取得エラー:', error);
      setCertificates([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeCertificate = async (certificateId: number) => {
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

  const handleReissueCertificate = async (certificateId: number) => {
    if (!confirm('この証明書を再発行しますか？')) return;

    try {
      const { error } = await supabase
        .from('certificates')
        .update({
          is_active: true
        })
        .eq('id', certificateId);

      if (error) throw error;

      await fetchCertificates();
      alert('証明書を再発行しました。');
    } catch (error) {
      console.error('証明書再発行エラー:', error);
      alert('証明書の再発行に失敗しました。');
    }
  };

  // PDF生成機能
  const generateCertificatePDF = async (certificate: Certificate) => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    // 背景グラデーション風の装飾
    doc.setFillColor(250, 250, 250);
    doc.rect(0, 0, 297, 210, 'F');

    // 豪華な枠線
    doc.setDrawColor(200, 180, 140);
    doc.setLineWidth(2);
    doc.rect(10, 10, 277, 190);
    doc.setLineWidth(0.5);
    doc.rect(15, 15, 267, 180);

    // タイトル
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(36);
    doc.setTextColor(50, 50, 50);
    doc.text('修了証明書', 148.5, 45, { align: 'center' });

    // Certificate of Completion
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(14);
    doc.setTextColor(100, 100, 100);
    doc.text('Certificate of Completion', 148.5, 55, { align: 'center' });

    // 受講者名
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(50, 50, 50);
    doc.text(certificate.studentName, 148.5, 80, { align: 'center' });

    // 会社名
    if (certificate.studentCompany) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(14);
      doc.setTextColor(80, 80, 80);
      doc.text(certificate.studentCompany, 148.5, 90, { align: 'center' });
    }

    // 本文
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    doc.setTextColor(80, 80, 80);
    doc.text('上記の者は、下記のコースを修了したことを証明いたします。', 148.5, 110, { align: 'center' });

    // コース名
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(30, 90, 180);
    doc.text(certificate.courseName, 148.5, 130, { align: 'center' });

    // 発行日
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(80, 80, 80);
    const issueDate = new Date(certificate.issuedAt);
    const formattedDate = `${issueDate.getFullYear()}年${issueDate.getMonth() + 1}月${issueDate.getDate()}日`;
    doc.text(`発行日: ${formattedDate}`, 148.5, 150, { align: 'center' });

    // 証明書番号
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text(`証明書番号: ${certificate.certificateId}`, 148.5, 160, { align: 'center' });

    // 署名欄
    doc.setLineWidth(0.5);
    doc.setDrawColor(150, 150, 150);
    doc.line(200, 175, 260, 175);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text('管理者署名', 230, 182, { align: 'center' });

    // 装飾的な要素
    doc.setDrawColor(200, 180, 140);
    doc.setLineWidth(0.3);
    // 左上の装飾
    doc.line(20, 20, 30, 20);
    doc.line(20, 20, 20, 30);
    // 右上の装飾
    doc.line(267, 20, 277, 20);
    doc.line(277, 20, 277, 30);
    // 左下の装飾
    doc.line(20, 185, 30, 185);
    doc.line(20, 175, 20, 185);
    // 右下の装飾
    doc.line(267, 185, 277, 185);
    doc.line(277, 175, 277, 185);

    // PDFを保存
    doc.save(`certificate_${certificate.certificateId}.pdf`);

    // ダウンロード数を更新（download_countフィールドがある場合）
    // await supabase
    //   .from('certificates')
    //   .update({ download_count: certificate.downloadCount + 1 })
    //   .eq('id', certificate.id);
  };

  // ソート機能を追加
  const toggleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('asc');
    }
  };

  // フィルタリングとソート機能
  const filteredAndSortedCertificates = certificates.filter(cert => {
    const matchesSearch = cert.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         cert.courseName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         cert.certificateId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         (cert.studentCompany?.toLowerCase() || '').includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || cert.status === statusFilter;
    
    const now = new Date();
    const certDate = new Date(cert.issuedAt);
    let matchesDate = true;
    
    if (dateFilter === 'week') {
      matchesDate = (now.getTime() - certDate.getTime()) <= (7 * 24 * 60 * 60 * 1000);
    } else if (dateFilter === 'month') {
      matchesDate = (now.getTime() - certDate.getTime()) <= (30 * 24 * 60 * 60 * 1000);
    } else if (dateFilter === 'year') {
      matchesDate = (now.getTime() - certDate.getTime()) <= (365 * 24 * 60 * 60 * 1000);
    }

    return matchesSearch && matchesStatus && matchesDate;
  }).sort((a, b) => {
    let comparison = 0;
    switch (sortBy) {
      case 'name':
        comparison = a.studentName.localeCompare(b.studentName);
        break;
      case 'course':
        comparison = a.courseName.localeCompare(b.courseName);
        break;
      case 'company':
        comparison = (a.studentCompany || '').localeCompare(b.studentCompany || '');
        break;
      case 'date':
        comparison = new Date(a.issuedAt).getTime() - new Date(b.issuedAt).getTime();
        break;
    }
    return sortOrder === 'asc' ? comparison : -comparison;
  });

  const filteredCertificates = filteredAndSortedCertificates;

  // ページネーション
  const totalPages = Math.ceil(filteredCertificates.length / itemsPerPage);
  const paginatedCertificates = filteredCertificates.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">有効</span>;
      case 'revoked':
        return <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-800">無効</span>;
      case 'expired':
        return <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-800">期限切れ</span>;
      default:
        return <span className="px-2 py-1 text-xs rounded-full bg-gray-100 dark:bg-neutral-900 text-gray-800 dark:text-gray-200">不明</span>;
    }
  };

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
        <div className="max-w-7xl mx-auto">
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
                <Link href="/admin/settings?tab=certificate">
                  <Button variant="outline" className="flex items-center">
                    <Cog6ToothIcon className="h-4 w-4 mr-2" />
                    署名設定
                  </Button>
                </Link>
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
              <div className="text-2xl font-bold">{certificates.filter(c => c.status === 'active').length}</div>
              <div className="text-green-100">有効な証明書</div>
            </div>
            <div className="bg-gradient-to-r from-blue-500 to-blue-600 rounded-lg p-6 text-white">
              <div className="text-2xl font-bold">{certificates.length}</div>
              <div className="text-blue-100">総発行数</div>
            </div>
            <div className="bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg p-6 text-white">
              <div className="text-2xl font-bold">{certificates.filter(c => {
                const now = new Date();
                const certDate = new Date(c.issuedAt);
                return (now.getTime() - certDate.getTime()) <= (7 * 24 * 60 * 60 * 1000);
              }).length}</div>
              <div className="text-purple-100">今週の発行</div>
            </div>
            <div className="bg-gradient-to-r from-red-500 to-red-600 rounded-lg p-6 text-white">
              <div className="text-2xl font-bold">{certificates.filter(c => c.status === 'revoked').length}</div>
              <div className="text-red-100">無効化済み</div>
            </div>
          </div>

          {/* フィルターセクション */}
          <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-lg border p-4 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">検索</label>
                <div className="relative">
                  <MagnifyingGlassIcon className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="学生名、コース名、証明書ID..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ステータス</label>
                <select
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  <option value="all">すべて</option>
                  <option value="active">有効</option>
                  <option value="revoked">無効</option>
                  <option value="expired">期限切れ</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">発行期間</label>
                <select
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                >
                  <option value="all">全期間</option>
                  <option value="week">過去1週間</option>
                  <option value="month">過去1ヶ月</option>
                  <option value="year">過去1年</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  className="w-full flex items-center justify-center"
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                    setDateFilter('all');
                  }}
                >
                  <FunnelIcon className="h-4 w-4 mr-2" />
                  クリア
                </Button>
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
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={() => toggleSort('name')}
                    >
                      <div className="flex items-center gap-1">
                        学生情報
                        <FunnelIcon className="h-3 w-3" />
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={() => toggleSort('company')}
                    >
                      <div className="flex items-center gap-1">
                        会社名
                        <FunnelIcon className="h-3 w-3" />
                      </div>
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={() => toggleSort('course')}
                    >
                      <div className="flex items-center gap-1">
                        コース
                        <FunnelIcon className="h-3 w-3" />
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      証明書ID
                    </th>
                    <th 
                      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                      onClick={() => toggleSort('date')}
                    >
                      <div className="flex items-center gap-1">
                        発行日
                        <FunnelIcon className="h-3 w-3" />
                      </div>
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      ステータス
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      アクション
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200">
                  {paginatedCertificates.map((certificate) => (
                    <tr key={certificate.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {certificate.studentName}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {certificate.studentEmail}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {certificate.studentCompany || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {certificate.courseName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900 dark:text-white">
                        {certificate.certificateId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        {new Date(certificate.issuedAt).toLocaleDateString('ja-JP')}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(certificate.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex space-x-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="flex items-center text-blue-600 hover:text-blue-700"
                            onClick={() => generateCertificatePDF(certificate)}
                          >
                            <DocumentArrowDownIcon className="h-4 w-4 mr-1" />
                            PDF
                          </Button>
                          {certificate.status === 'active' ? (
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

            {/* ページネーション */}
            {totalPages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 dark:border-neutral-800 flex items-center justify-between">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {((currentPage - 1) * itemsPerPage) + 1}～
                  {Math.min(currentPage * itemsPerPage, filteredCertificates.length)}件 / 
                  全{filteredCertificates.length}件
                </div>
                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(currentPage - 1)}
                  >
                    前へ
                  </Button>
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    {currentPage} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(currentPage + 1)}
                  >
                    次へ
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}