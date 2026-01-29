'use client';

import { useState, useEffect } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import {
  MagnifyingGlassIcon,
  ChartBarIcon,
  ClockIcon,
  AcademicCapIcon,
  UserIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  DocumentArrowDownIcon,
  PencilIcon,
  XMarkIcon,
  CheckIcon,
  Cog6ToothIcon,
  EyeIcon,
  EyeSlashIcon
} from '@heroicons/react/24/outline';

interface LearningLog {
  id: number;
  user_id: string;
  user_name: string;
  user_email: string;
  company: string;
  department: string;
  course_id: number;
  course_title: string;
  course_order: number;
  video_id: number;
  video_title: string;
  video_order: number;
  start_time: string;
  end_time: string;
  total_watched_time: number;
  progress_percent: number;
  status: string;
  last_updated: string;
}

type SortField = 'user_name' | 'company' | 'course_title' | 'video_title' | 'progress_percent' | 'start_time';

export default function LaborConsultantLearningLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<LearningLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [filterCourse, setFilterCourse] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('start_time');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [exportingCSV, setExportingCSV] = useState(false);
  const [assignedCompanies, setAssignedCompanies] = useState<string[]>([]);
  const [courses, setCourses] = useState<{ id: number; title: string }[]>([]);
  const [editingLog, setEditingLog] = useState<LearningLog | null>(null);
  const [savingLog, setSavingLog] = useState(false);
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [columnVisibility, setColumnVisibility] = useState({
    startTime: true,
    endTime: true,
    watchedTime: true,
    progress: true,
    status: true,
    actions: true
  });
  
  useEffect(() => {
    fetchLearningLogs();
  }, [user?.id]);

  // Supabaseの1000件制限を回避するためのページネーション取得関数
  const fetchAllWithPagination = async <T,>(
    tableName: string,
    selectQuery: string,
    filters?: { column: string; operator: string; value: unknown }[],
    orderBy?: { column: string; ascending: boolean }
  ): Promise<T[]> => {
    const PAGE_SIZE = 1000;
    let allData: T[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from(tableName)
        .select(selectQuery)
        .range(offset, offset + PAGE_SIZE - 1);

      if (filters) {
        for (const filter of filters) {
          if (filter.operator === 'eq') {
            query = query.eq(filter.column, filter.value);
          } else if (filter.operator === 'in') {
            query = query.in(filter.column, filter.value as unknown[]);
          }
        }
      }

      if (orderBy) {
        query = query.order(orderBy.column, { ascending: orderBy.ascending });
      }

      const { data, error } = await query;

      if (error) throw error;

      if (data && data.length > 0) {
        allData = [...allData, ...(data as T[])];
        offset += PAGE_SIZE;
        hasMore = data.length === PAGE_SIZE;
      } else {
        hasMore = false;
      }
    }

    return allData;
  };

  const fetchLearningLogs = async () => {
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

      // 担当会社の生徒を取得（ページネーションで全件取得）
      const studentsData = await fetchAllWithPagination<{
        id: string;
        display_name: string;
        email: string;
        company: string;
        department: string;
      }>(
        'user_profiles',
        'id, display_name, email, company, department',
        [{ column: 'company', operator: 'in', value: companies }]
      );

      if (!studentsData || studentsData.length === 0) {
        setLoading(false);
        return;
      }

      const studentIds = studentsData.map(s => s.id);

      // 学習ログを取得（ページネーションで全件取得）
      const logsData = await fetchAllWithPagination<{
        id: number;
        user_id: string;
        course_id: number;
        video_id: number;
        start_time: string;
        end_time: string;
        total_watched_time: number;
        progress_percent: number;
        status: string;
        last_updated: string;
      }>(
        'video_view_logs',
        '*',
        [{ column: 'user_id', operator: 'in', value: studentIds }],
        { column: 'last_updated', ascending: false }
      );

      // コース情報を取得（order_indexを含む）
      const courseIds = [...new Set(logsData?.map(log => log.course_id) || [])];
      const coursesData = courseIds.length > 0
        ? await fetchAllWithPagination<{ id: number; title: string; order_index: number }>(
            'courses',
            'id, title, order_index',
            [{ column: 'id', operator: 'in', value: courseIds }]
          )
        : [];

      setCourses(coursesData || []);

      // 動画情報を取得（order_indexを含む）
      const videoIds = [...new Set(logsData?.map(log => log.video_id) || [])];
      const videosData = videoIds.length > 0
        ? await fetchAllWithPagination<{ id: number; title: string; order_index: number }>(
            'videos',
            'id, title, order_index',
            [{ column: 'id', operator: 'in', value: videoIds }]
          )
        : [];

      // データを結合
      const logsWithDetails = (logsData || []).map(log => {
        const student = studentsData.find(s => s.id === log.user_id);
        const course = coursesData?.find(c => c.id === log.course_id);
        const video = videosData?.find(v => v.id === log.video_id);

        return {
          ...log,
          user_name: student?.display_name || '',
          user_email: student?.email || '',
          company: student?.company || '',
          department: student?.department || '',
          course_title: course?.title || '',
          course_order: course?.order_index ?? 999999,
          video_title: video?.title || '',
          video_order: video?.order_index ?? 999999
        };
      });

      setLogs(logsWithDetails);

    } catch (error) {
      console.error('学習ログ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hours > 0) {
      return `${hours}時間${minutes}分`;
    }
    return `${minutes}分${secs}秒`;
  };

  const formatDateTime = (dateString: string) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP');
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return '完了';
      case 'in_progress':
        return '進行中';
      case 'not_started':
        return '未開始';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'in_progress':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'not_started':
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-400';
    }
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const exportToCSV = async () => {
    setExportingCSV(true);
    try {
      const headers = [
        '氏名',
        'メールアドレス',
        '会社名',
        '部署',
        'コース名',
        '動画名',
        '開始時刻',
        '終了時刻',
        '視聴時間',
        '進捗率（%）',
        '受講状況'
      ];

      const csvData = filteredAndSortedLogs.map(log => [
        log.user_name,
        log.user_email,
        log.company,
        log.department,
        log.course_title,
        log.video_title,
        formatDateTime(log.start_time),
        formatDateTime(log.end_time),
        formatTime(log.total_watched_time),
        Math.round(log.progress_percent).toString(),
        getStatusLabel(log.status)
      ]);

      const csvContent = [headers, ...csvData]
        .map(row => row.map(cell => `"${cell}"`).join(','))
        .join('\n');

      const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `学習ログ_${new Date().toISOString().slice(0, 10)}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      alert('学習ログをCSVファイルとしてエクスポートしました。');
    } catch (error) {
      console.error('CSV出力エラー:', error);
      alert('CSV出力に失敗しました。');
    } finally {
      setExportingCSV(false);
    }
  };

  // 学習ログの編集保存
  const handleSaveLog = async () => {
    if (!editingLog) return;

    setSavingLog(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();

      // 開始時刻と終了時刻から視聴時間を計算（設定されている場合）
      let calculatedDuration = editingLog.total_watched_time;
      if (editingLog.start_time && editingLog.end_time) {
        const calculateDurationFromTimes = () => {
          const startStr = editingLog.start_time.replace('.000Z', '').replace('Z', '');
          const endStr = editingLog.end_time.replace('.000Z', '').replace('Z', '');

          const [startDate, startTime] = startStr.split('T');
          const [endDate, endTime] = endStr.split('T');

          const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
          const [startHour, startMin, startSec] = startTime.split(':').map(Number);

          const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
          const [endHour, endMin, endSec] = endTime.split(':').map(Number);

          let seconds = endSec - startSec;
          let minutes = endMin - startMin;
          let hours = endHour - startHour;
          let days = endDay - startDay;

          if (seconds < 0) {
            seconds += 60;
            minutes -= 1;
          }
          if (minutes < 0) {
            minutes += 60;
            hours -= 1;
          }
          if (hours < 0) {
            hours += 24;
            days -= 1;
          }

          return (days * 24 * 3600) + (hours * 3600) + (minutes * 60) + seconds;
        };

        const duration = calculateDurationFromTimes();
        if (duration > 0) {
          calculatedDuration = duration;
        }
      }

      const response = await fetch(`/api/admin/learning-logs/${editingLog.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
        body: JSON.stringify({
          total_watched_time: Math.round(calculatedDuration),
          progress_percent: editingLog.progress_percent,
          start_time: editingLog.start_time || null,
          end_time: editingLog.end_time || null,
        }),
      });

      if (response.ok) {
        // ログ更新後、コースが完了したか確認して証明書生成を試みる
        if (editingLog.user_id && editingLog.course_id) {
          try {
            const certResponse = await fetch('/api/certificates/generate', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                userId: editingLog.user_id,
                courseId: editingLog.course_id
              })
            });
            const certResult = await certResponse.json();
            if (certResult.success) {
              alert('学習ログを更新しました。コース完了により証明書が発行されました。');
            } else {
              alert('学習ログを更新しました');
            }
          } catch (certError) {
            alert('学習ログを更新しました');
          }
        } else {
          alert('学習ログを更新しました');
        }
        setEditingLog(null);
        fetchLearningLogs();
      } else {
        const data = await response.json();
        alert(`更新に失敗しました: ${data.error || 'エラーが発生しました'}`);
      }
    } catch (error) {
      console.error('更新エラー:', error);
      alert('更新中にエラーが発生しました');
    } finally {
      setSavingLog(false);
    }
  };

  // 日時を入力用形式に変換（タイムゾーン変換なし）
  const formatDateTimeForInput = (dateString: string) => {
    if (!dateString) return '';
    // データベースの時刻をローカル時刻として扱う（Zや.000を除去）
    const dateStr = dateString.replace('Z', '').replace('.000', '');
    // 秒を含む完全な日時を返す（YYYY-MM-DDTHH:mm:ss）
    return dateStr.substring(0, 19);
  };

  
  // カラム表示設定の切り替え
  const toggleColumnVisibility = (column: keyof typeof columnVisibility) => {
    setColumnVisibility(prev => ({
      ...prev,
      [column]: !prev[column]
    }));
  };

  // フィルタリング
  const filteredAndSortedLogs = logs
    .filter(log => {
      const matchesSearch =
        log.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.course_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.video_title.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = filterStatus === 'all' || log.status === filterStatus;
      const matchesCompany = filterCompany === 'all' || log.company === filterCompany;
      const matchesCourse = filterCourse === 'all' || log.course_id.toString() === filterCourse;

      return matchesSearch && matchesStatus && matchesCompany && matchesCourse;
    })
    .sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case 'user_name':
          comparison = a.user_name.localeCompare(b.user_name);
          break;
        case 'company':
          comparison = a.company.localeCompare(b.company);
          break;
        case 'course_title':
          // コース順でソートし、同じコース内では動画順でソート
          comparison = a.course_order - b.course_order;
          if (comparison === 0) {
            comparison = a.video_order - b.video_order;
          }
          break;
        case 'video_title':
          // 動画順でソート（コースをまたいで動画順で並べる）
          comparison = a.video_order - b.video_order;
          break;
        case 'progress_percent':
          comparison = a.progress_percent - b.progress_percent;
          break;
        case 'start_time':
          comparison = new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
          break;
      }

      return sortOrder === 'asc' ? comparison : -comparison;
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
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-cyan-100 rounded-lg flex items-center justify-center mr-4">
                  <ChartBarIcon className="h-6 w-6 text-cyan-600" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">学習ログ</h1>
                  <p className="text-gray-600 dark:text-gray-400">担当生徒の学習履歴を確認できます。</p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <div className="relative">
                  <button
                    onClick={() => setShowColumnSettings(!showColumnSettings)}
                    className="px-4 py-2 bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-neutral-700 flex items-center border border-gray-300 dark:border-gray-600"
                  >
                    <Cog6ToothIcon className="h-5 w-5 mr-2" />
                    表示設定
                  </button>
                  {showColumnSettings && (
                    <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-neutral-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50">
                      <div className="p-3">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">カラム表示設定</h3>
                        <div className="space-y-2">
                          <label className="flex items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-700 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={columnVisibility.startTime}
                              onChange={() => toggleColumnVisibility('startTime')}
                              className="form-checkbox h-4 w-4 text-blue-600 rounded border-gray-300 dark:border-gray-600"
                            />
                            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">開始時刻</span>
                          </label>
                          <label className="flex items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-700 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={columnVisibility.endTime}
                              onChange={() => toggleColumnVisibility('endTime')}
                              className="form-checkbox h-4 w-4 text-blue-600 rounded border-gray-300 dark:border-gray-600"
                            />
                            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">終了時刻</span>
                          </label>
                          <label className="flex items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-700 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={columnVisibility.progress}
                              onChange={() => toggleColumnVisibility('progress')}
                              className="form-checkbox h-4 w-4 text-blue-600 rounded border-gray-300 dark:border-gray-600"
                            />
                            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">進捗</span>
                          </label>
                          <label className="flex items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-700 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={columnVisibility.watchedTime}
                              onChange={() => toggleColumnVisibility('watchedTime')}
                              className="form-checkbox h-4 w-4 text-blue-600 rounded border-gray-300 dark:border-gray-600"
                            />
                            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">視聴時間</span>
                          </label>
                          <label className="flex items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-700 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={columnVisibility.status}
                              onChange={() => toggleColumnVisibility('status')}
                              className="form-checkbox h-4 w-4 text-blue-600 rounded border-gray-300 dark:border-gray-600"
                            />
                            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">ステータス</span>
                          </label>
                          <label className="flex items-center cursor-pointer hover:bg-gray-50 dark:hover:bg-neutral-700 p-1 rounded">
                            <input
                              type="checkbox"
                              checked={columnVisibility.actions}
                              onChange={() => toggleColumnVisibility('actions')}
                              className="form-checkbox h-4 w-4 text-blue-600 rounded border-gray-300 dark:border-gray-600"
                            />
                            <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">操作</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={exportToCSV}
                  disabled={exportingCSV || filteredAndSortedLogs.length === 0}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 flex items-center"
                >
                  <DocumentArrowDownIcon className="h-5 w-5 mr-2" />
                  {exportingCSV ? 'エクスポート中...' : 'CSVエクスポート'}
                </button>
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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  {/* 検索 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      検索
                    </label>
                    <div className="relative">
                      <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                      <input
                        type="text"
                        placeholder="名前、コース名で検索..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </div>

                  {/* ステータスフィルター */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      ステータス
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                    >
                      <option value="all">すべて</option>
                      <option value="completed">完了</option>
                      <option value="in_progress">進行中</option>
                      <option value="not_started">未開始</option>
                    </select>
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

                  {/* コースフィルター */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      コース
                    </label>
                    <select
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                      value={filterCourse}
                      onChange={(e) => setFilterCourse(e.target.value)}
                    >
                      <option value="all">すべて</option>
                      {courses.map((course) => (
                        <option key={course.id} value={course.id.toString()}>{course.title}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* 学習ログテーブル */}
              <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-neutral-800">
                      <tr>
                        <th
                          className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-neutral-700"
                          onClick={() => handleSort('user_name')}
                        >
                          <div className="flex items-center">
                            生徒
                            {sortField === 'user_name' && (
                              sortOrder === 'asc' ? <ArrowUpIcon className="h-4 w-4 ml-1" /> : <ArrowDownIcon className="h-4 w-4 ml-1" />
                            )}
                          </div>
                        </th>
                        <th
                          className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-neutral-700"
                          onClick={() => handleSort('company')}
                        >
                          <div className="flex items-center">
                            会社名
                            {sortField === 'company' && (
                              sortOrder === 'asc' ? <ArrowUpIcon className="h-4 w-4 ml-1" /> : <ArrowDownIcon className="h-4 w-4 ml-1" />
                            )}
                          </div>
                        </th>
                        <th
                          className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-neutral-700"
                          onClick={() => handleSort('course_title')}
                        >
                          <div className="flex items-center">
                            コース・動画
                            {sortField === 'course_title' && (
                              sortOrder === 'asc' ? <ArrowUpIcon className="h-4 w-4 ml-1" /> : <ArrowDownIcon className="h-4 w-4 ml-1" />
                            )}
                          </div>
                        </th>
                        {columnVisibility.startTime && (
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            開始時刻
                          </th>
                        )}
                        {columnVisibility.endTime && (
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            終了時刻
                          </th>
                        )}
                        {columnVisibility.progress && (
                          <th
                            className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-neutral-700"
                            onClick={() => handleSort('progress_percent')}
                          >
                            <div className="flex items-center">
                              進捗
                              {sortField === 'progress_percent' && (
                                sortOrder === 'asc' ? <ArrowUpIcon className="h-4 w-4 ml-1" /> : <ArrowDownIcon className="h-4 w-4 ml-1" />
                              )}
                            </div>
                          </th>
                        )}
                        {columnVisibility.watchedTime && (
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            視聴時間
                          </th>
                        )}
                        {columnVisibility.status && (
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            ステータス
                          </th>
                        )}
                        <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          終了日
                        </th>
                        {columnVisibility.actions && (
                          <th className="px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            操作
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-gray-700">
                      {filteredAndSortedLogs.length === 0 ? (
                        <tr>
                          <td colSpan={4 + (columnVisibility.startTime ? 1 : 0) + (columnVisibility.endTime ? 1 : 0) + (columnVisibility.progress ? 1 : 0) + (columnVisibility.watchedTime ? 1 : 0) + (columnVisibility.status ? 1 : 0) + (columnVisibility.actions ? 1 : 0)} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                            学習ログが見つかりません
                          </td>
                        </tr>
                      ) : (
                        filteredAndSortedLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-neutral-800">
                            <td className="px-2 py-3 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {log.user_name}
                              </div>
                            </td>
                            <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                              {log.company}
                            </td>
                            <td className="px-2 py-3">
                              <div className="text-sm text-gray-900 dark:text-white max-w-[140px] truncate" title={log.course_title}>
                                {log.course_title}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400 max-w-[140px] truncate" title={log.video_title}>
                                {log.video_title}
                              </div>
                            </td>
                            {columnVisibility.startTime && (
                              <td className="px-2 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                {editingLog?.id === log.id ? (
                                  <input
                                    type="datetime-local"
                                    step="1"
                                    value={formatDateTimeForInput(editingLog.start_time)}
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        // YYYY-MM-DDTHH:mm:ss形式の入力を処理
                                        let dateTimeStr = e.target.value;
                                        // 秒がない場合は:00を追加
                                        if (dateTimeStr.length === 16) {
                                          dateTimeStr += ':00';
                                        }
                                        dateTimeStr += '.000Z';
                                        setEditingLog({ ...editingLog, start_time: dateTimeStr });
                                      } else {
                                        setEditingLog({ ...editingLog, start_time: '' });
                                      }
                                    }}
                                    className="px-1 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-neutral-800 text-gray-900 dark:text-white w-36"
                                  />
                                ) : (
                                  formatDateTime(log.start_time)
                                )}
                              </td>
                            )}
                            {columnVisibility.endTime && (
                              <td className="px-2 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                                {editingLog?.id === log.id ? (
                                  <input
                                    type="datetime-local"
                                    step="1"
                                    value={formatDateTimeForInput(editingLog.end_time)}
                                    onChange={(e) => {
                                      if (e.target.value) {
                                        // YYYY-MM-DDTHH:mm:ss形式の入力を処理
                                        let dateTimeStr = e.target.value;
                                        // 秒がない場合は:00を追加
                                        if (dateTimeStr.length === 16) {
                                          dateTimeStr += ':00';
                                        }
                                        dateTimeStr += '.000Z';
                                        setEditingLog({ ...editingLog, end_time: dateTimeStr });
                                      } else {
                                        setEditingLog({ ...editingLog, end_time: '' });
                                      }
                                    }}
                                    className="px-1 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs bg-white dark:bg-neutral-800 text-gray-900 dark:text-white w-36"
                                  />
                                ) : (
                                  formatDateTime(log.end_time)
                                )}
                              </td>
                            )}
                            {columnVisibility.progress && (
                              <td className="px-2 py-3 whitespace-nowrap">
                                {editingLog?.id === log.id ? (
                                  <div className="flex items-center">
                                    <input
                                      type="number"
                                      min="0"
                                      max="100"
                                      value={Math.round(editingLog.progress_percent)}
                                      onChange={(e) => setEditingLog({ ...editingLog, progress_percent: parseInt(e.target.value) || 0 })}
                                      className="w-14 px-1 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-neutral-800 text-gray-900 dark:text-white"
                                    />
                                    <span className="ml-1 text-sm text-gray-900 dark:text-white">%</span>
                                  </div>
                                ) : (
                                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    {Math.round(log.progress_percent)}%
                                  </span>
                                )}
                              </td>
                            )}
                            {columnVisibility.watchedTime && (
                              <td className="px-2 py-3 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                {formatTime(log.total_watched_time)}
                              </td>
                            )}
                            {columnVisibility.status && (
                              <td className="px-2 py-3 whitespace-nowrap">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(log.status)}`}>
                                  {getStatusLabel(log.status)}
                                </span>
                              </td>
                            )}
                            <td className="px-2 py-3 whitespace-nowrap text-xs text-gray-500 dark:text-gray-400">
                              {log.end_time ? new Date(log.end_time).toLocaleDateString('ja-JP') : '-'}
                            </td>
                            {columnVisibility.actions && (
                              <td className="px-2 py-3 whitespace-nowrap text-sm">
                                {editingLog?.id === log.id ? (
                                  <div className="flex items-center space-x-1">
                                    <button
                                      onClick={handleSaveLog}
                                      disabled={savingLog}
                                      className="p-1 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 disabled:opacity-50"
                                      title="保存"
                                    >
                                      <CheckIcon className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => setEditingLog(null)}
                                      disabled={savingLog}
                                      className="p-1 text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300 disabled:opacity-50"
                                      title="キャンセル"
                                    >
                                      <XMarkIcon className="h-4 w-4" />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setEditingLog(log)}
                                    className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                                    title="編集"
                                  >
                                    <PencilIcon className="h-4 w-4" />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* 件数表示 */}
              <div className="mt-4 text-sm text-gray-600 dark:text-gray-400">
                {filteredAndSortedLogs.length} 件の学習ログ
              </div>
            </>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
