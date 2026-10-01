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
  ArrowUpIcon,
  ArrowDownIcon,
  DocumentArrowDownIcon,
  PencilIcon,
} from '@heroicons/react/24/outline';
import { ColumnMenu, ColumnResizeHandle, useColumnLayout, type ColumnDef } from '@/components/table/ColumnLayout';

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
  video_duration: number;
  start_time: string;
  end_time: string;
  total_watched_time: number;
  progress_percent: number;
  status: string;
  last_updated: string;
}

type SortField =
  | 'user_name'
  | 'user_email'
  | 'company'
  | 'department'
  | 'course_title'
  | 'video_title'
  | 'progress_percent'
  | 'start_time'
  | 'end_time'
  | 'total_watched_time'
  | 'video_duration'
  | 'status'
  | 'last_updated';

// 表の列（「列」メニューで表示する列を選び、見出しの右端をドラッグして幅を変えられる）
const LOG_COLUMNS: ColumnDef[] = [
  { key: 'name', label: '氏名', fixed: true, recommended: true, width: 130, minWidth: 80 },
  { key: 'company', label: '会社名', recommended: true, width: 150 },
  { key: 'department', label: '部署', width: 120 },
  { key: 'email', label: 'メールアドレス', width: 200 },
  { key: 'course', label: 'コース', recommended: true, width: 180 },
  { key: 'video', label: '動画', recommended: true, width: 220 },
  { key: 'start', label: '開始時刻', recommended: true, width: 160 },
  { key: 'end', label: '終了時刻', recommended: true, width: 160 },
  { key: 'watched', label: '視聴時間', recommended: true, width: 100 },
  { key: 'duration', label: '動画の長さ', width: 100 },
  { key: 'progress', label: '進捗', recommended: true, width: 72 },
  { key: 'status', label: 'ステータス', recommended: true, width: 96 },
  { key: 'endDate', label: '終了日', width: 100 },
  { key: 'updated', label: '最終更新', width: 160 },
  // 編集ボタン。幅が足りないときも最後まで隠さない
  { key: 'actions', label: '操作', recommended: true, width: 64, minWidth: 56, hideRank: -1 },
];

const SORT_FIELDS: Record<string, SortField | undefined> = {
  name: 'user_name',
  email: 'user_email',
  company: 'company',
  department: 'department',
  course: 'course_title',
  video: 'video_title',
  start: 'start_time',
  end: 'end_time',
  watched: 'total_watched_time',
  duration: 'video_duration',
  progress: 'progress_percent',
  status: 'status',
  endDate: 'end_time',
  updated: 'last_updated',
};

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
  const layout = useColumnLayout('lms.labor-consultant.learning-logs.columns.v1', LOG_COLUMNS);

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
        ? await fetchAllWithPagination<{ id: number; title: string; order_index: number; duration: number }>(
            'videos',
            'id, title, order_index, duration',
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
          video_order: video?.order_index ?? 999999,
          video_duration: video?.duration ?? 0
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

  // 日時系の列は初回クリック時に新しい順（降順）から始める
  const isTimeField = (field: SortField) => field === 'start_time' || field === 'end_time' || field === 'last_updated';

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder(isTimeField(field) ? 'desc' : 'asc');
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

      // editingLogのtotal_watched_timeをそのまま使用（モーダル内で手動入力 or 自動計算済み）
      const calculatedDuration = editingLog.total_watched_time;

      const response = await fetch(`/api/admin/learning-logs/${editingLog.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
        body: JSON.stringify({
          total_watched_time: Math.round(calculatedDuration),
          progress_percent: editingLog.progress_percent,
          status: editingLog.status,
          start_time: editingLog.start_time || null,
          end_time: editingLog.end_time || null,
        }),
      });

      if (response.ok) {
        // ログ更新後、コースが完了したか確認して証明書生成を試みる
        if (editingLog.user_id && editingLog.course_id) {
          try {
            const { data: { session: certSession } } = await supabase.auth.getSession();
            const certResponse = await fetch('/api/certificates/generate', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${certSession?.access_token ?? ''}`,
              },
              body: JSON.stringify({
                userId: editingLog.user_id,
                courseId: editingLog.course_id,
                access_token: certSession?.access_token,
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


  // 列ごとのセルの中身
  const renderCell = (log: LearningLog, key: string) => {
    switch (key) {
      case 'name':
        return <span className="font-medium">{log.user_name}</span>;
      case 'email':
        return log.user_email;
      case 'company':
        return log.company;
      case 'department':
        return log.department || '—';
      case 'course':
        return log.course_title;
      case 'video':
        return log.video_title;
      case 'start':
        return <span className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(log.start_time)}</span>;
      case 'end':
        return <span className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(log.end_time)}</span>;
      case 'watched':
        return formatTime(log.total_watched_time);
      case 'duration':
        return log.video_duration ? formatTime(log.video_duration) : '—';
      case 'progress':
        return <span className="font-medium">{Math.round(log.progress_percent)}%</span>;
      case 'status':
        return (
          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(log.status)}`}>
            {getStatusLabel(log.status)}
          </span>
        );
      case 'endDate':
        return <span className="text-xs text-gray-500 dark:text-gray-400">{log.end_time ? new Date(log.end_time).toLocaleDateString('ja-JP') : '-'}</span>;
      case 'updated':
        return <span className="text-xs text-gray-500 dark:text-gray-400">{formatDateTime(log.last_updated)}</span>;
      case 'actions':
        return (
          <button
            onClick={() => setEditingLog({ ...log })}
            className="p-1 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            title="編集"
            aria-label={`${log.user_name}さんの「${log.video_title}」の学習ログを編集`}
          >
            <PencilIcon className="h-4 w-4" />
          </button>
        );
      default:
        return null;
    }
  };

  // 幅が狭くて省略されたときに、マウスを乗せると全文が見えるようにする
  const cellTitle = (log: LearningLog, key: string): string | undefined => {
    switch (key) {
      case 'name':
        return log.user_name;
      case 'email':
        return log.user_email;
      case 'company':
        return log.company;
      case 'department':
        return log.department || undefined;
      case 'course':
        return log.course_title;
      case 'video':
        return log.video_title;
      default:
        return undefined;
    }
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
      // 空の日時は常に末尾へ
      const timeValue = (value: string) => {
        const time = value ? new Date(value).getTime() : NaN;
        return Number.isNaN(time) ? null : time;
      };
      const statusRank: Record<string, number> = { not_started: 0, in_progress: 1, completed: 2 };

      let comparison = 0;

      switch (sortField) {
        case 'user_name':
          comparison = a.user_name.localeCompare(b.user_name, 'ja');
          break;
        case 'user_email':
          comparison = a.user_email.localeCompare(b.user_email, 'ja');
          break;
        case 'company':
          comparison = a.company.localeCompare(b.company, 'ja');
          break;
        case 'department':
          comparison = (a.department || '').localeCompare(b.department || '', 'ja');
          break;
        case 'video_duration':
          comparison = (a.video_duration || 0) - (b.video_duration || 0);
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
        case 'total_watched_time':
          comparison = a.total_watched_time - b.total_watched_time;
          break;
        case 'status':
          comparison = (statusRank[a.status] ?? 0) - (statusRank[b.status] ?? 0);
          break;
        case 'start_time':
        case 'end_time':
        case 'last_updated': {
          const pick = (log: LearningLog) =>
            sortField === 'start_time' ? log.start_time : sortField === 'end_time' ? log.end_time : log.last_updated;
          const tx = timeValue(pick(a));
          const ty = timeValue(pick(b));
          // 昇順・降順にかかわらず、日時が無い行は常に末尾に置く
          if (tx === null || ty === null) {
            if (tx === null && ty === null) return 0;
            return tx === null ? 1 : -1;
          }
          comparison = tx - ty;
          break;
        }
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
                <ColumnMenu layout={layout} />
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

              {/* 学習ログテーブル（列は「列」メニューで選び、見出しの右端をドラッグして幅を変えられる） */}
              <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border overflow-hidden">
                {layout.hiddenByWidth.length > 0 && (
                  <div className="px-3 py-2 text-xs text-amber-800 bg-amber-50 border-b border-amber-100 dark:bg-amber-900/20 dark:text-amber-200 dark:border-amber-900/40">
                    幅が足りないため {layout.hiddenByWidth.length} 列（{layout.hiddenByWidth.map((c) => c.label).join('・')}）を隠しています。「列」メニューから表示できます。
                  </div>
                )}
                <div ref={layout.containerRef} className="overflow-x-auto">
                  <table className="table-fixed divide-y divide-gray-200 dark:divide-gray-700" style={{ width: layout.tableWidth }}>
                    <colgroup>
                      {layout.visibleColumns.map((c) => (
                        <col key={c.key} style={{ width: layout.widthOf(c.key) }} />
                      ))}
                    </colgroup>
                    <thead className="bg-gray-50 dark:bg-neutral-800">
                      <tr>
                        {layout.visibleColumns.map((c) => {
                          const field = SORT_FIELDS[c.key];
                          const sorted = !!field && sortField === field;
                          return (
                            <th
                              key={c.key}
                              scope="col"
                              aria-sort={sorted ? (sortOrder === 'asc' ? 'ascending' : 'descending') : undefined}
                              className={`relative px-2 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 tracking-wider select-none ${
                                field ? 'cursor-pointer hover:bg-gray-100 dark:hover:bg-neutral-700' : ''
                              }`}
                              onClick={field ? () => handleSort(field) : undefined}
                            >
                              <div className="flex items-center overflow-hidden pr-1">
                                <span className="truncate">{c.label}</span>
                                {sorted &&
                                  (sortOrder === 'asc' ? (
                                    <ArrowUpIcon className="h-4 w-4 ml-1 shrink-0" />
                                  ) : (
                                    <ArrowDownIcon className="h-4 w-4 ml-1 shrink-0" />
                                  ))}
                              </div>
                              <ColumnResizeHandle layout={layout} columnKey={c.key} />
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-gray-700">
                      {filteredAndSortedLogs.length === 0 ? (
                        <tr>
                          <td colSpan={layout.visibleColumns.length} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                            学習ログが見つかりません
                          </td>
                        </tr>
                      ) : (
                        filteredAndSortedLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-neutral-800">
                            {layout.visibleColumns.map((c) => (
                              <td
                                key={c.key}
                                className="px-2 py-2.5 text-sm text-gray-900 dark:text-white whitespace-nowrap overflow-hidden text-ellipsis"
                                title={cellTitle(log, c.key)}
                              >
                                {renderCell(log, c.key)}
                              </td>
                            ))}
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

          {/* 編集モーダル */}
          {editingLog && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
              <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 max-w-2xl w-full mx-4 my-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  学習ログを編集
                </h3>

                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                  {/* ユーザー情報（読み取り専用） */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        ユーザー名
                      </label>
                      <p className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100">
                        {editingLog.user_name}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        会社名
                      </label>
                      <p className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100">
                        {editingLog.company}
                      </p>
                    </div>
                  </div>

                  {/* コース・動画情報（読み取り専用） */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        コース名
                      </label>
                      <p className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100">
                        {editingLog.course_title}
                      </p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        動画タイトル
                      </label>
                      <p className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-sm text-gray-900 dark:text-gray-100">
                        {editingLog.video_title}
                        {editingLog.video_duration > 0 && (
                          <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                            （動画時間: {formatTime(editingLog.video_duration)}）
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  {/* 開始時刻 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      開始時刻
                    </label>
                    <input
                      type="datetime-local"
                      step="1"
                      value={formatDateTimeForInput(editingLog.start_time)}
                      onChange={(e) => {
                        if (e.target.value) {
                          let dateTimeStr = e.target.value;
                          if (dateTimeStr.length === 16) {
                            dateTimeStr += ':00';
                          }
                          dateTimeStr += '.000Z';
                          setEditingLog({ ...editingLog, start_time: dateTimeStr });
                        } else {
                          setEditingLog({ ...editingLog, start_time: '' });
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  {/* 終了時刻 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      終了時刻
                    </label>
                    <input
                      type="datetime-local"
                      step="1"
                      value={formatDateTimeForInput(editingLog.end_time)}
                      onChange={(e) => {
                        if (e.target.value) {
                          let dateTimeStr = e.target.value;
                          if (dateTimeStr.length === 16) {
                            dateTimeStr += ':00';
                          }
                          dateTimeStr += '.000Z';
                          setEditingLog({ ...editingLog, end_time: dateTimeStr });
                        } else {
                          setEditingLog({ ...editingLog, end_time: '' });
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    {/* 動画時間から終了時刻を自動設定ボタン */}
                    {editingLog.start_time && editingLog.video_duration > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          const videoDuration = editingLog.video_duration;
                          if (videoDuration && editingLog.start_time) {
                            const startTimeStr = editingLog.start_time.replace('Z', '').replace('.000', '');
                            const [datePart, timePart] = startTimeStr.split('T');
                            const [year, month, day] = datePart.split('-');
                            const [hours, minutes, seconds] = timePart.split(':');

                            let totalSeconds = parseInt(seconds) + videoDuration;
                            let totalMinutes = parseInt(minutes) + Math.floor(totalSeconds / 60);
                            let totalHours = parseInt(hours) + Math.floor(totalMinutes / 60);
                            let totalDays = parseInt(day) + Math.floor(totalHours / 24);

                            const newSeconds = totalSeconds % 60;
                            const newMinutes = totalMinutes % 60;
                            const newHours = totalHours % 24;

                            let newMonth = parseInt(month);
                            let newYear = parseInt(year);
                            let newDay = totalDays;

                            const daysInMonth = new Date(newYear, newMonth, 0).getDate();
                            if (newDay > daysInMonth) {
                              newDay = newDay - daysInMonth;
                              newMonth++;
                              if (newMonth > 12) {
                                newMonth = 1;
                                newYear++;
                              }
                            }

                            const pad = (num: number) => num.toString().padStart(2, '0');
                            const endDateStr = `${newYear}-${pad(newMonth)}-${pad(newDay)}T${pad(newHours)}:${pad(newMinutes)}:${pad(newSeconds)}.000Z`;

                            setEditingLog({
                              ...editingLog,
                              end_time: endDateStr,
                              total_watched_time: videoDuration
                            });
                          }
                        }}
                        className="mt-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        動画時間から終了時刻を自動設定
                      </button>
                    )}
                  </div>

                  {/* 視聴時間（分:秒） */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      視聴時間（分:秒）
                    </label>
                    <div className="flex items-center space-x-2">
                      <div className="flex-1">
                        <div className="flex items-center">
                          <input
                            type="number"
                            min="0"
                            placeholder="分"
                            value={Math.floor(editingLog.total_watched_time / 60)}
                            onChange={(e) => {
                              const mins = parseInt(e.target.value) || 0;
                              const secs = editingLog.total_watched_time % 60;
                              setEditingLog({
                                ...editingLog,
                                total_watched_time: mins * 60 + secs
                              });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                          <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">分</span>
                        </div>
                      </div>
                      <span className="text-lg font-bold text-gray-600 dark:text-gray-400">:</span>
                      <div className="flex-1">
                        <div className="flex items-center">
                          <input
                            type="number"
                            min="0"
                            max="59"
                            placeholder="秒"
                            value={editingLog.total_watched_time % 60}
                            onChange={(e) => {
                              const secs = parseInt(e.target.value) || 0;
                              const mins = Math.floor(editingLog.total_watched_time / 60);
                              setEditingLog({
                                ...editingLog,
                                total_watched_time: mins * 60 + Math.min(59, secs)
                              });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                          <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">秒</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        現在の視聴時間: {formatTime(editingLog.total_watched_time)}
                      </p>
                      {/* 開始・終了時刻から自動計算ボタン */}
                      {editingLog.start_time && editingLog.end_time && (
                        <button
                          type="button"
                          onClick={() => {
                            const startStr = editingLog.start_time.replace('.000Z', '').replace('Z', '');
                            const endStr = editingLog.end_time.replace('.000Z', '').replace('Z', '');

                            const [startDate, startTime] = startStr.split('T');
                            const [endDate, endTime] = endStr.split('T');

                            const [, , startDay] = startDate.split('-').map(Number);
                            const [startHour, startMin, startSec] = startTime.split(':').map(Number);

                            const [, , endDay] = endDate.split('-').map(Number);
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

                            const duration = (days * 24 * 3600) + (hours * 3600) + (minutes * 60) + seconds;
                            if (duration > 0) {
                              setEditingLog({
                                ...editingLog,
                                total_watched_time: duration
                              });
                            }
                          }}
                          className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          開始・終了時刻から自動計算
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 進捗率 */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      進捗率（%）
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={Math.round(editingLog.progress_percent)}
                      onChange={(e) => setEditingLog({
                        ...editingLog,
                        progress_percent: parseInt(e.target.value) || 0
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  {/* ステータス */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      ステータス
                    </label>
                    <select
                      value={editingLog.status}
                      onChange={(e) => setEditingLog({
                        ...editingLog,
                        status: e.target.value
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="not_started">未開始</option>
                      <option value="in_progress">受講中</option>
                      <option value="completed">完了</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <button
                    onClick={() => setEditingLog(null)}
                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                  >
                    キャンセル
                  </button>
                  <button
                    onClick={handleSaveLog}
                    disabled={savingLog}
                    className="px-4 py-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 disabled:opacity-50"
                  >
                    {savingLog ? '保存中...' : '保存'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
