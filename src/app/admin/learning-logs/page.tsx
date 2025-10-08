'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  DocumentArrowDownIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ChartBarIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  CalendarIcon,
  UserIcon,
  AcademicCapIcon,
  VideoCameraIcon,
  BuildingOfficeIcon,
  PencilIcon,
  TrashIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';
import {
  CheckCircleIcon as CheckCircleIconSolid
} from '@heroicons/react/24/solid';

interface LearningLog {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  company: string;
  department: string;
  course_id: string;
  course_title: string;
  video_id: string;
  video_title: string;
  start_time: string;
  end_time: string;
  watch_duration: number;
  progress: number;
  status: 'not_started' | 'in_progress' | 'completed';
  created_at: string;
  updated_at: string;
}

type SortField = 'user_name' | 'company' | 'course_title' | 'video_title' | 'progress' | 'created_at';
type SortOrder = 'asc' | 'desc';

export default function LearningLogsPage() {
  const { user } = useAuth();
  const [learningLogs, setLearningLogs] = useState<LearningLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'in_progress' | 'not_started'>('all');
  const [filterCompany, setFilterCompany] = useState<string>('all');
  const [filterCourse, setFilterCourse] = useState<string>('all');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [exportingCSV, setExportingCSV] = useState(false);
  const [companies, setCompanies] = useState<string[]>([]);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [dateRange, setDateRange] = useState({ start: '', end: '' });
  const [currentPage, setCurrentPage] = useState(1);
  const [editingLog, setEditingLog] = useState<LearningLog | null>(null);
  const [deletingLogId, setDeletingLogId] = useState<string | null>(null);
  const [allVideos, setAllVideos] = useState<{ id: string; title: string; course_id: string; duration?: number }[]>([]);
  const [selectedCourseForEdit, setSelectedCourseForEdit] = useState<string>('');
  const [selectedVideoForEdit, setSelectedVideoForEdit] = useState<string>('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newLog, setNewLog] = useState<Partial<LearningLog>>({
    user_name: '',
    user_email: '',
    company: '',
    department: '',
    course_id: '',
    course_title: '',
    video_id: '',
    video_title: '',
    start_time: '',
    end_time: '',
    watch_duration: 0,
    progress: 0,
    status: 'not_started'
  });
  const [allUsers, setAllUsers] = useState<{ id: string; display_name: string; email: string; company?: string; department?: string }[]>([]);
  const itemsPerPage = 50;

  useEffect(() => {
    fetchLearningLogs();
    fetchFilters();
    fetchAllVideos();
    fetchAllUsers();
  }, []);

  const fetchAllVideos = async () => {
    try {
      const { data, error } = await supabase
        .from('videos')
        .select('id, title, course_id, duration')
        .order('title');

      if (data) {
        setAllVideos(data);
      }
    } catch (error) {
      console.error('動画リスト取得エラー:', error);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, display_name, email, company, department')
        .order('display_name');

      if (data) {
        setAllUsers(data);
      }
    } catch (error) {
      console.error('ユーザーリスト取得エラー:', error);
    }
  };

  const fetchLearningLogs = async () => {
    try {
      setLoading(true);
      
      // まず学習ログを取得
      const { data: logsData, error: logsError } = await supabase
        .from('video_view_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (logsError) {
        console.error('学習ログ取得エラー:', logsError);
        setLearningLogs([]);
        setLoading(false);
        return;
      }

      if (!logsData || logsData.length === 0) {
        setLearningLogs([]);
        setLoading(false);
        return;
      }

      // ユーザーIDのリストを取得
      const userIds = [...new Set(logsData.map(log => log.user_id))];
      const courseIds = [...new Set(logsData.map(log => log.course_id))];
      const videoIds = [...new Set(logsData.map(log => log.video_id))];

      // ユーザー情報を取得
      const { data: users } = await supabase
        .from('user_profiles')
        .select('id, display_name, email, company, department')
        .in('id', userIds);

      // コース情報を取得
      const { data: courses } = await supabase
        .from('courses')
        .select('id, title')
        .in('id', courseIds);

      // ビデオ情報を取得
      const { data: videos } = await supabase
        .from('videos')
        .select('id, title')
        .in('id', videoIds);

      // データをマップに変換
      const userMap = new Map(users?.map(u => [u.id, u]) || []);
      const courseMap = new Map(courses?.map(c => [c.id, c]) || []);
      const videoMap = new Map(videos?.map(v => [v.id, v]) || []);

      // ログデータを整形
      const formattedLogs = logsData.map((log: any) => {
        const user = userMap.get(log.user_id);
        const course = courseMap.get(log.course_id);
        const video = videoMap.get(log.video_id);

        return {
          id: log.id,
          user_id: log.user_id,
          user_name: user?.display_name || 'Unknown',
          user_email: user?.email || '',
          company: user?.company || '',
          department: user?.department || '',
          course_id: log.course_id,
          course_title: course?.title || 'Unknown Course',
          video_id: log.video_id,
          video_title: video?.title || 'Unknown Video',
          start_time: log.start_time || log.created_at,
          end_time: log.end_time || '',
          watch_duration: log.total_watched_time || 0,
          progress: log.progress_percent || 0,
          status: log.status || 'not_started',
          created_at: log.created_at,
          updated_at: log.last_updated || log.created_at
        };
      });

      setLearningLogs(formattedLogs);
    } catch (error) {
      console.error('学習ログ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFilters = async () => {
    try {
      // 会社名一覧を取得
      const { data: companiesData } = await supabase
        .from('user_profiles')
        .select('company')
        .not('company', 'is', null)
        .not('company', 'eq', '');
      
      if (companiesData) {
        const uniqueCompanies = [...new Set(companiesData.map(item => item.company))].filter(Boolean);
        setCompanies(uniqueCompanies);
      }

      // コース一覧を取得
      const { data: coursesData } = await supabase
        .from('courses')
        .select('id, title')
        .eq('status', 'active')
        .order('title');
      
      if (coursesData) {
        setCourses(coursesData);
      }
    } catch (error) {
      console.error('フィルター情報取得エラー:', error);
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

  const handleDeleteLog = async (logId: string) => {
    if (!confirm('この学習ログを削除してもよろしいですか？')) {
      return;
    }

    setDeletingLogId(logId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`/api/admin/learning-logs/${logId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': session?.access_token ? `Bearer ${session.access_token}` : '',
        },
      });

      if (response.ok) {
        alert('学習ログを削除しました');
        fetchLearningLogs();
      } else {
        const data = await response.json();
        alert(`削除に失敗しました: ${data.error}`);
      }
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除中にエラーが発生しました');
    } finally {
      setDeletingLogId(null);
    }
  };

  const handleEditLog = async (log: LearningLog) => {
    setEditingLog(log);
    setSelectedCourseForEdit(log.course_id);
    setSelectedVideoForEdit(log.video_id);
  };

  const handleAddLog = async () => {
    if (!newLog.user_id || !newLog.video_id || !newLog.course_id) {
      alert('ユーザー、コース、動画を選択してください');
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();

      // 開始時刻と終了時刻から視聴時間を計算（設定されている場合）
      let calculatedDuration = newLog.watch_duration || 0;
      if (newLog.start_time && newLog.end_time) {
        const calculateDurationFromTimes = () => {
          const startStr = newLog.start_time!.replace('.000Z', '').replace('Z', '');
          const endStr = newLog.end_time!.replace('.000Z', '').replace('Z', '');

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

      // video_view_logsテーブルに直接挿入
      const { data, error } = await supabase
        .from('video_view_logs')
        .insert({
          user_id: newLog.user_id,
          video_id: newLog.video_id,
          course_id: newLog.course_id,
          start_time: newLog.start_time || new Date().toISOString(),
          end_time: newLog.end_time || null,
          total_watched_time: Math.round(calculatedDuration),
          progress_percent: newLog.progress || 0,
          status: newLog.status || 'not_started',
        });

      if (error) {
        console.error('追加エラー:', error);
        alert(`追加に失敗しました: ${error.message}`);
      } else {
        alert('学習ログを追加しました');
        setShowAddModal(false);
        setNewLog({
          user_name: '',
          user_email: '',
          company: '',
          department: '',
          course_id: '',
          course_title: '',
          video_id: '',
          video_title: '',
          start_time: '',
          end_time: '',
          watch_duration: 0,
          progress: 0,
          status: 'not_started'
        });
        fetchLearningLogs();
      }
    } catch (error) {
      console.error('追加エラー:', error);
      alert('追加中にエラーが発生しました');
    }
  };

  const handleSaveLog = async () => {
    if (!editingLog) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();

      // 開始時刻と終了時刻から視聴時間を計算（設定されている場合）
      let calculatedDuration = editingLog.watch_duration;
      if (editingLog.start_time && editingLog.end_time) {
        // データベースの時刻文字列をローカル時刻として扱い、差分を計算
        const calculateDurationFromTimes = () => {
          // .000Zを削除して純粋な時刻文字列にする
          const startStr = editingLog.start_time.replace('.000Z', '').replace('Z', '');
          const endStr = editingLog.end_time.replace('.000Z', '').replace('Z', '');

          // 時刻要素を抽出
          const [startDate, startTime] = startStr.split('T');
          const [endDate, endTime] = endStr.split('T');

          const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
          const [startHour, startMin, startSec] = startTime.split(':').map(Number);

          const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
          const [endHour, endMin, endSec] = endTime.split(':').map(Number);

          // 各要素の差を計算
          let seconds = endSec - startSec;
          let minutes = endMin - startMin;
          let hours = endHour - startHour;
          let days = endDay - startDay;

          // 繰り下がり処理
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

          // 合計秒数を計算
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
          total_watched_time: Math.round(calculatedDuration), // 整数に丸める
          progress_percent: editingLog.progress,
          status: editingLog.status,
          start_time: editingLog.start_time || null,
          end_time: editingLog.end_time || null,
          user_name: editingLog.user_name,
          user_email: editingLog.user_email,
          company: editingLog.company,
          department: editingLog.department,
          course_title: editingLog.course_title,
          video_title: editingLog.video_title,
        }),
      });

      if (response.ok) {
        alert('学習ログを更新しました');
        setEditingLog(null);
        setSelectedCourseForEdit('');
        setSelectedVideoForEdit('');
        fetchLearningLogs();
      } else {
        const data = await response.json();
        console.error('更新エラー詳細:', data);
        alert(`更新に失敗しました: ${data.error || 'エラーが発生しました'}`);
      }
    } catch (error) {
      console.error('更新エラー:', error);
      alert('更新中にエラーが発生しました');
    }
  };

  const exportToCSV = async () => {
    setExportingCSV(true);
    try {
      const headers = [
        '記録日時',
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
        new Date(log.created_at).toLocaleString('ja-JP'),
        log.user_name,
        log.user_email,
        log.company,
        log.department,
        log.course_title,
        log.video_title,
        log.start_time ? new Date(log.start_time).toLocaleString('ja-JP') : '',
        log.end_time ? new Date(log.end_time).toLocaleString('ja-JP') : '',
        formatTime(log.watch_duration),
        Math.round(log.progress),
        log.status === 'completed' ? '完了' : 
        log.status === 'in_progress' ? '受講中' : '未開始'
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

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}時間${minutes}分${secs.toString().padStart(2, '0')}秒`;
    } else {
      return `${minutes}分${secs.toString().padStart(2, '0')}秒`;
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      'completed': { text: '完了', color: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300', icon: CheckCircleIconSolid },
      'in_progress': { text: '受講中', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300', icon: ClockIcon },
      'not_started': { text: '未開始', color: 'bg-gray-100 text-gray-800 dark:bg-neutral-900 dark:text-gray-300', icon: ExclamationTriangleIcon }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.not_started;
    const IconComponent = config.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.color}`}>
        <IconComponent className="h-3 w-3 mr-1" />
        {config.text}
      </span>
    );
  };

  // フィルタリングとソート
  const filteredAndSortedLogs = learningLogs
    .filter(log => {
      const matchesSearch = 
        log.user_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.company.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.course_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.video_title.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = filterStatus === 'all' || log.status === filterStatus;
      const matchesCompany = filterCompany === 'all' || log.company === filterCompany;
      const matchesCourse = filterCourse === 'all' || log.course_id === filterCourse;
      
      let matchesDate = true;
      if (dateRange.start && dateRange.end) {
        const logDate = new Date(log.created_at);
        const startDate = new Date(dateRange.start);
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59, 999);
        matchesDate = logDate >= startDate && logDate <= endDate;
      }

      return matchesSearch && matchesStatus && matchesCompany && matchesCourse && matchesDate;
    })
    .sort((a, b) => {
      let compareValue = 0;
      
      switch (sortField) {
        case 'user_name':
          compareValue = a.user_name.localeCompare(b.user_name);
          break;
        case 'company':
          compareValue = (a.company || '').localeCompare(b.company || '');
          break;
        case 'course_title':
          compareValue = (a.course_title || '').localeCompare(b.course_title || '', 'ja');
          break;
        case 'video_title':
          compareValue = a.video_title.localeCompare(b.video_title);
          break;
        case 'progress':
          compareValue = a.progress - b.progress;
          break;
        case 'created_at':
          compareValue = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      
      return sortOrder === 'asc' ? compareValue : -compareValue;
    });

  // ページネーション
  const totalPages = Math.ceil(filteredAndSortedLogs.length / itemsPerPage);
  const paginatedLogs = filteredAndSortedLogs.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

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
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center">
                <div className="w-12 h-12 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg flex items-center justify-center mr-4">
                  <ChartBarIcon className="h-6 w-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900 dark:text-white">学習ログ</h1>
                  <p className="text-gray-600 dark:text-gray-400">全ユーザーの学習履歴を管理・分析します</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <Button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center justify-center w-full sm:w-auto bg-green-600 hover:bg-green-700 whitespace-nowrap"
                >
                  <PencilIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="whitespace-nowrap">ログを追加</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!confirm('すべての学習ログを削除してもよろしいですか？\nこの操作は取り消せません。')) {
                      return;
                    }
                    const { error } = await supabase
                      .from('video_view_logs')
                      .delete()
                      .neq('id', '0');
                    if (!error) {
                      alert('すべての学習ログを削除しました');
                      fetchLearningLogs();
                    } else {
                      alert('削除に失敗しました');
                    }
                  }}
                  className="flex items-center justify-center w-full sm:w-auto text-red-600 hover:text-red-700 whitespace-nowrap"
                >
                  <TrashIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="whitespace-nowrap">全ログリセット</span>
                </Button>
                <Button
                  onClick={exportToCSV}
                  disabled={exportingCSV}
                  className="flex items-center justify-center w-full sm:w-auto whitespace-nowrap"
                >
                  <DocumentArrowDownIcon className="h-4 w-4 mr-2 flex-shrink-0" />
                  <span className="whitespace-nowrap">{exportingCSV ? 'エクスポート中...' : 'CSVエクスポート'}</span>
                </Button>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6 mb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {/* Search */}
              <div className="lg:col-span-2">
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="氏名、会社名、コース名、動画名で検索..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              {/* Date Range */}
              <div>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                  value={dateRange.start}
                  onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                />
              </div>
              <div>
                <input
                  type="date"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                  value={dateRange.end}
                  onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Status Filter */}
              <select
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
              >
                <option value="all">全ステータス</option>
                <option value="completed">完了</option>
                <option value="in_progress">受講中</option>
                <option value="not_started">未開始</option>
              </select>

              {/* Company Filter */}
              <select
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                value={filterCompany}
                onChange={(e) => setFilterCompany(e.target.value)}
              >
                <option value="all">全ての会社</option>
                {companies.map(company => (
                  <option key={company} value={company}>{company}</option>
                ))}
              </select>

              {/* Course Filter */}
              <select
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-neutral-900 text-gray-900 dark:text-gray-100"
                value={filterCourse}
                onChange={(e) => setFilterCourse(e.target.value)}
              >
                <option value="all">全てのコース</option>
                {courses.map(course => (
                  <option key={course.id} value={course.id}>{course.title}</option>
                ))}
              </select>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {filteredAndSortedLogs.length}件の学習ログが見つかりました
              </p>
              {(searchTerm || filterStatus !== 'all' || filterCompany !== 'all' || filterCourse !== 'all' || dateRange.start || dateRange.end) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    setFilterStatus('all');
                    setFilterCompany('all');
                    setFilterCourse('all');
                    setDateRange({ start: '', end: '' });
                  }}
                >
                  フィルターをクリア
                </Button>
              )}
            </div>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
            {paginatedLogs.length === 0 ? (
              <div className="text-center py-12">
                <ClockIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  {searchTerm || filterStatus !== 'all' || filterCompany !== 'all' || filterCourse !== 'all' ? '検索結果がありません' : '学習ログがありません'}
                </h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {searchTerm || filterStatus !== 'all' || filterCompany !== 'all' || filterCourse !== 'all' ? '別の条件で検索してみてください' : '学習が開始されるとここに表示されます'}
                </p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 dark:divide-neutral-800">
                    <thead className="bg-gray-50 dark:bg-black">
                      <tr>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                          onClick={() => handleSort('user_name')}
                        >
                          <div className="flex items-center">
                            氏名
                            {sortField === 'user_name' && (
                              sortOrder === 'asc' ? <ArrowUpIcon className="h-3 w-3 ml-1" /> : <ArrowDownIcon className="h-3 w-3 ml-1" />
                            )}
                          </div>
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                          onClick={() => handleSort('company')}
                        >
                          <div className="flex items-center">
                            会社・部署
                            {sortField === 'company' && (
                              sortOrder === 'asc' ? <ArrowUpIcon className="h-3 w-3 ml-1" /> : <ArrowDownIcon className="h-3 w-3 ml-1" />
                            )}
                          </div>
                        </th>
                        <th
                          className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                          onClick={() => handleSort('course_title')}
                        >
                          <div className="flex items-center">
                            コース
                            {sortField === 'course_title' && (
                              sortOrder === 'asc' ? <ArrowUpIcon className="h-3 w-3 ml-1" /> : <ArrowDownIcon className="h-3 w-3 ml-1" />
                            )}
                          </div>
                        </th>
                        <th
                          className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                          onClick={() => handleSort('video_title')}
                        >
                          <div className="flex items-center">
                            動画
                            {sortField === 'video_title' && (
                              sortOrder === 'asc' ? <ArrowUpIcon className="h-3 w-3 ml-1" /> : <ArrowDownIcon className="h-3 w-3 ml-1" />
                            )}
                          </div>
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          開始時刻
                        </th>
                        <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          終了時刻
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          視聴時間
                        </th>
                        <th 
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                          onClick={() => handleSort('progress')}
                        >
                          <div className="flex items-center">
                            進捗
                            {sortField === 'progress' && (
                              sortOrder === 'asc' ? <ArrowUpIcon className="h-3 w-3 ml-1" /> : <ArrowDownIcon className="h-3 w-3 ml-1" />
                            )}
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
                    <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-neutral-800">
                      {paginatedLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {log.user_name}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {log.user_email}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div>
                              <div className="text-sm text-gray-900 dark:text-white">
                                {log.company || '-'}
                              </div>
                              {log.department && (
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {log.department}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-900 dark:text-white max-w-[180px] break-words">
                              {log.course_title}
                            </div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-gray-900 dark:text-white max-w-[200px] break-words">
                              {log.video_title}
                            </div>
                          </td>
                          <td className="px-3 py-4 text-sm text-gray-900 dark:text-white">
                            {log.start_time ? new Date(log.start_time).toLocaleString('ja-JP', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            }) : '-'}
                          </td>
                          <td className="px-3 py-4 text-sm text-gray-900 dark:text-white">
                            {log.end_time ? new Date(log.end_time).toLocaleString('ja-JP', {
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit'
                            }) : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                            {formatTime(log.watch_duration)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center">
                              <div className="flex-1">
                                <div className="text-sm font-medium text-gray-900 dark:text-white">
                                  {Math.round(log.progress)}%
                                </div>
                                <div className="w-20 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-1">
                                  <div 
                                    className="bg-blue-600 h-1.5 rounded-full" 
                                    style={{ width: `${log.progress}%` }}
                                  />
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {getStatusBadge(log.status)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <div className="flex items-center space-x-2">
                              <button
                                onClick={() => handleEditLog(log)}
                                className="p-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded"
                                title="編集"
                              >
                                <PencilIcon className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => handleDeleteLog(log.id)}
                                disabled={deletingLogId === log.id}
                                className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded disabled:opacity-50"
                                title="削除"
                              >
                                {deletingLogId === log.id ? (
                                  <LoadingSpinner size="sm" />
                                ) : (
                                  <TrashIcon className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="px-6 py-4 border-t border-gray-200 dark:border-neutral-800">
                    <div className="flex items-center justify-between">
                      <div className="text-sm text-gray-700 dark:text-gray-300">
                        全{filteredAndSortedLogs.length}件中 {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredAndSortedLogs.length)}件を表示
                      </div>
                      <div className="flex space-x-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          disabled={currentPage === 1}
                        >
                          前へ
                        </Button>
                        <div className="flex items-center space-x-1">
                          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                            const page = currentPage <= 3 ? i + 1 : currentPage + i - 2;
                            if (page < 1 || page > totalPages) return null;
                            return (
                              <button
                                key={page}
                                onClick={() => setCurrentPage(page)}
                                className={`px-3 py-1 text-sm rounded ${
                                  page === currentPage
                                    ? 'bg-indigo-600 text-white'
                                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                              >
                                {page}
                              </button>
                            );
                          })}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                          disabled={currentPage === totalPages}
                        >
                          次へ
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
          
          {/* 編集モーダル */}
          {editingLog && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
              <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 max-w-2xl w-full mx-4 my-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  学習ログを編集
                </h3>
                
                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        ユーザー名
                      </label>
                      <input
                        type="text"
                        value={editingLog.user_name}
                        onChange={(e) => setEditingLog({
                          ...editingLog,
                          user_name: e.target.value
                        })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        メールアドレス
                      </label>
                      <input
                        type="email"
                        value={editingLog.user_email}
                        onChange={(e) => setEditingLog({
                          ...editingLog,
                          user_email: e.target.value
                        })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        会社名
                      </label>
                      <input
                        type="text"
                        value={editingLog.company}
                        onChange={(e) => setEditingLog({
                          ...editingLog,
                          company: e.target.value
                        })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        部署
                      </label>
                      <input
                        type="text"
                        value={editingLog.department}
                        onChange={(e) => setEditingLog({
                          ...editingLog,
                          department: e.target.value
                        })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      コース名
                    </label>
                    <select
                      value={selectedCourseForEdit || editingLog.course_id}
                      onChange={(e) => {
                        const courseId = e.target.value;
                        const course = courses.find(c => c.id === courseId);
                        setSelectedCourseForEdit(courseId);
                        setEditingLog({
                          ...editingLog,
                          course_id: courseId,
                          course_title: course?.title || ''
                        });
                        // コースが変更されたら動画もリセット
                        setSelectedVideoForEdit('');
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">コースを選択</option>
                      {courses.map(course => (
                        <option key={course.id} value={course.id}>{course.title}</option>
                      ))}
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      動画タイトル
                    </label>
                    <div className="space-y-2">
                      <select
                        value={selectedVideoForEdit || editingLog.video_id}
                        onChange={(e) => {
                          const videoId = e.target.value;
                          const video = allVideos.find(v => v.id === videoId);
                          setSelectedVideoForEdit(videoId);
                          setEditingLog({
                            ...editingLog,
                            video_id: videoId,
                            video_title: video?.title || ''
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        disabled={!selectedCourseForEdit && !editingLog.course_id}
                      >
                        <option value="">動画を選択</option>
                        {allVideos
                          .filter(v => v.course_id === (selectedCourseForEdit || editingLog.course_id))
                          .map(video => (
                            <option key={video.id} value={video.id}>{video.title}</option>
                          ))}
                      </select>
                      {editingLog.start_time && selectedVideoForEdit && (
                        <button
                          type="button"
                          onClick={() => {
                            const video = allVideos.find(v => v.id === selectedVideoForEdit);
                            if (video?.duration && editingLog.start_time) {
                              // start_timeからZ付きの時刻文字列を抽出
                              const startTimeStr = editingLog.start_time.replace('Z', '').replace('.000', '');
                              const [datePart, timePart] = startTimeStr.split('T');
                              const [year, month, day] = datePart.split('-');
                              const [hours, minutes, seconds] = timePart.split(':');

                              // 動画時間（秒）を追加
                              let totalSeconds = parseInt(seconds) + video.duration;
                              let totalMinutes = parseInt(minutes) + Math.floor(totalSeconds / 60);
                              let totalHours = parseInt(hours) + Math.floor(totalMinutes / 60);
                              let totalDays = parseInt(day) + Math.floor(totalHours / 24);

                              // 各単位を調整
                              const newSeconds = totalSeconds % 60;
                              const newMinutes = totalMinutes % 60;
                              const newHours = totalHours % 24;

                              // 月の日数を考慮
                              let newMonth = parseInt(month);
                              let newYear = parseInt(year);
                              let newDay = totalDays;

                              // 月末を超える場合の処理（簡略化版）
                              const daysInMonth = new Date(newYear, newMonth, 0).getDate();
                              if (newDay > daysInMonth) {
                                newDay = newDay - daysInMonth;
                                newMonth++;
                                if (newMonth > 12) {
                                  newMonth = 1;
                                  newYear++;
                                }
                              }

                              // フォーマット
                              const pad = (num: number) => num.toString().padStart(2, '0');
                              const endDateStr = `${newYear}-${pad(newMonth)}-${pad(newDay)}T${pad(newHours)}:${pad(newMinutes)}:${pad(newSeconds)}.000Z`;

                              setEditingLog({
                                ...editingLog,
                                end_time: endDateStr,
                                watch_duration: video.duration
                              });
                            }
                          }}
                          className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          動画時間から終了時刻を自動設定
                        </button>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      開始時刻
                    </label>
                    <input
                      type="datetime-local"
                      step="1"
                      value={(() => {
                        if (!editingLog.start_time) return '';
                        // データベースの時刻をローカル時刻として扱う
                        const dateStr = editingLog.start_time.replace('Z', '').replace('.000', '');
                        // 秒を含む完全な日時を返す
                        return dateStr.substring(0, 19);
                      })()}
                      onChange={(e) => {
                        if (e.target.value) {
                          // YYYY-MM-DDTHH:mm:ss形式の入力を処理
                          let dateTimeStr = e.target.value;
                          // 秒がない場合は:00を追加
                          if (dateTimeStr.length === 16) {
                            dateTimeStr += ':00';
                          }
                          dateTimeStr += '.000Z';
                          setEditingLog({
                            ...editingLog,
                            start_time: dateTimeStr
                          });
                        } else {
                          setEditingLog({
                            ...editingLog,
                            start_time: ''
                          });
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      終了時刻
                    </label>
                    <input
                      type="datetime-local"
                      step="1"
                      value={(() => {
                        if (!editingLog.end_time) return '';
                        // データベースの時刻をローカル時刻として扱う
                        const dateStr = editingLog.end_time.replace('Z', '').replace('.000', '');
                        // 秒を含む完全な日時を返す
                        return dateStr.substring(0, 19);
                      })()}
                      onChange={(e) => {
                        if (e.target.value) {
                          // YYYY-MM-DDTHH:mm:ss形式の入力を処理
                          let dateTimeStr = e.target.value;
                          // 秒がない場合は:00を追加
                          if (dateTimeStr.length === 16) {
                            dateTimeStr += ':00';
                          }
                          dateTimeStr += '.000Z';
                          setEditingLog({
                            ...editingLog,
                            end_time: dateTimeStr
                          });
                        } else {
                          setEditingLog({
                            ...editingLog,
                            end_time: ''
                          });
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  
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
                            value={Math.floor(editingLog.watch_duration / 60)}
                            onChange={(e) => {
                              const minutes = parseInt(e.target.value) || 0;
                              const seconds = editingLog.watch_duration % 60;
                              setEditingLog({
                                ...editingLog,
                                watch_duration: minutes * 60 + seconds
                              });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
                            value={editingLog.watch_duration % 60}
                            onChange={(e) => {
                              const seconds = parseInt(e.target.value) || 0;
                              const minutes = Math.floor(editingLog.watch_duration / 60);
                              setEditingLog({
                                ...editingLog,
                                watch_duration: minutes * 60 + Math.min(59, seconds)
                              });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                          <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">秒</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        現在の視聴時間: {formatTime(editingLog.watch_duration)}
                      </p>
                      {editingLog.start_time && editingLog.end_time && (
                        <button
                          type="button"
                          onClick={() => {
                            // datetime-localの入力値から直接計算
                            // editingLogには"YYYY-MM-DDTHH:mm:ss.000Z"形式で保存されているが、
                            // これはローカル時刻として扱う
                            const calculateDuration = () => {
                              // .000Zを削除して純粋な時刻文字列にする
                              const startStr = editingLog.start_time.replace('.000Z', '').replace('Z', '');
                              const endStr = editingLog.end_time.replace('.000Z', '').replace('Z', '');

                              // 時刻要素を抽出
                              const [startDate, startTime] = startStr.split('T');
                              const [endDate, endTime] = endStr.split('T');

                              const [startYear, startMonth, startDay] = startDate.split('-').map(Number);
                              const [startHour, startMin, startSec] = startTime.split(':').map(Number);

                              const [endYear, endMonth, endDay] = endDate.split('-').map(Number);
                              const [endHour, endMin, endSec] = endTime.split(':').map(Number);

                              // 各要素の差を計算
                              let seconds = endSec - startSec;
                              let minutes = endMin - startMin;
                              let hours = endHour - startHour;
                              let days = endDay - startDay;

                              // 繰り下がり処理
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

                              // 合計秒数を計算
                              return (days * 24 * 3600) + (hours * 3600) + (minutes * 60) + seconds;
                            };

                            const duration = calculateDuration();
                            if (duration > 0) {
                              setEditingLog({
                                ...editingLog,
                                watch_duration: duration
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
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      進捗率（%）
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={editingLog.progress}
                      onChange={(e) => setEditingLog({
                        ...editingLog,
                        progress: parseInt(e.target.value) || 0
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      ステータス
                    </label>
                    <select
                      value={editingLog.status}
                      onChange={(e) => setEditingLog({
                        ...editingLog,
                        status: e.target.value as any
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="not_started">未開始</option>
                      <option value="in_progress">受講中</option>
                      <option value="completed">完了</option>
                    </select>
                  </div>
                </div>
                
                <div className="flex justify-end space-x-3 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingLog(null);
                      setSelectedCourseForEdit('');
                      setSelectedVideoForEdit('');
                    }}
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleSaveLog}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    保存
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* 追加モーダル */}
          {showAddModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
              <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 max-w-2xl w-full mx-4 my-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  学習ログを追加
                </h3>

                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      ユーザーを選択 <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={newLog.user_id || ''}
                      onChange={(e) => {
                        const userId = e.target.value;
                        const user = allUsers.find(u => u.id === userId);
                        setNewLog({
                          ...newLog,
                          user_id: userId,
                          user_name: user?.display_name || '',
                          user_email: user?.email || '',
                          company: user?.company || '',
                          department: user?.department || ''
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">ユーザーを選択してください</option>
                      {allUsers.map(user => (
                        <option key={user.id} value={user.id}>
                          {user.display_name} ({user.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      コース <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={newLog.course_id || ''}
                      onChange={(e) => {
                        const courseId = e.target.value;
                        const course = courses.find(c => c.id === courseId);
                        setNewLog({
                          ...newLog,
                          course_id: courseId,
                          course_title: course?.title || '',
                          video_id: '',
                          video_title: ''
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">コースを選択してください</option>
                      {courses.map(course => (
                        <option key={course.id} value={course.id}>{course.title}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      動画 <span className="text-red-500">*</span>
                    </label>
                    <div className="space-y-2">
                      <select
                        value={newLog.video_id || ''}
                        onChange={(e) => {
                          const videoId = e.target.value;
                          const video = allVideos.find(v => v.id === videoId);
                          setNewLog({
                            ...newLog,
                            video_id: videoId,
                            video_title: video?.title || ''
                          });
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                        disabled={!newLog.course_id}
                      >
                        <option value="">動画を選択してください</option>
                        {allVideos
                          .filter(v => String(v.course_id) === String(newLog.course_id))
                          .map(video => (
                            <option key={video.id} value={video.id}>{video.title}</option>
                          ))}
                      </select>
                      {newLog.start_time && newLog.video_id && (
                        <button
                          type="button"
                          onClick={() => {
                            const video = allVideos.find(v => String(v.id) === String(newLog.video_id));
                            console.log('選択された動画:', video);
                            console.log('動画ID:', newLog.video_id);
                            console.log('動画の長さ:', video?.duration);

                            if (video?.duration && newLog.start_time) {
                              const startTimeStr = newLog.start_time.replace('Z', '').replace('.000', '');
                              const [datePart, timePart] = startTimeStr.split('T');
                              const [year, month, day] = datePart.split('-');
                              const [hours, minutes, seconds] = timePart.split(':');

                              let totalSeconds = parseInt(seconds) + video.duration;
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

                              console.log('計算された終了時刻:', endDateStr);
                              console.log('視聴時間（秒）:', video.duration);

                              setNewLog({
                                ...newLog,
                                end_time: endDateStr,
                                watch_duration: video.duration
                              });
                            } else {
                              console.error('動画が見つからないか、durationが存在しません');
                            }
                          }}
                          className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          動画時間から終了時刻を自動設定
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      開始時刻
                    </label>
                    <div className="space-y-2">
                      <input
                        type="datetime-local"
                        step="1"
                        value={(() => {
                          if (!newLog.start_time) return '';
                          const dateStr = newLog.start_time.replace('Z', '').replace('.000', '');
                          return dateStr.substring(0, 19);
                        })()}
                        onChange={(e) => {
                          if (e.target.value) {
                            let dateTimeStr = e.target.value;
                            if (dateTimeStr.length === 16) {
                              dateTimeStr += ':00';
                            }
                            dateTimeStr += '.000Z';
                            setNewLog({
                              ...newLog,
                              start_time: dateTimeStr
                            });

                            // 動画が選択されている場合、自動的に終了時刻を計算
                            if (newLog.video_id) {
                              const video = allVideos.find(v => String(v.id) === String(newLog.video_id));
                              if (video?.duration) {
                                const startTimeStr = dateTimeStr.replace('Z', '').replace('.000', '');
                                const [datePart, timePart] = startTimeStr.split('T');
                                const [year, month, day] = datePart.split('-');
                                const [hours, minutes, seconds] = timePart.split(':');

                                let totalSeconds = parseInt(seconds) + video.duration;
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

                                setNewLog({
                                  ...newLog,
                                  start_time: dateTimeStr,
                                  end_time: endDateStr,
                                  watch_duration: video.duration
                                });
                              }
                            }
                          } else {
                            setNewLog({
                              ...newLog,
                              start_time: ''
                            });
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      />
                      {newLog.video_id && (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          ※ 開始時刻を設定すると、選択された動画の長さに基づいて終了時刻が自動計算されます
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      終了時刻
                    </label>
                    <input
                      type="datetime-local"
                      step="1"
                      value={(() => {
                        if (!newLog.end_time) return '';
                        const dateStr = newLog.end_time.replace('Z', '').replace('.000', '');
                        return dateStr.substring(0, 19);
                      })()}
                      onChange={(e) => {
                        if (e.target.value) {
                          let dateTimeStr = e.target.value;
                          if (dateTimeStr.length === 16) {
                            dateTimeStr += ':00';
                          }
                          dateTimeStr += '.000Z';
                          setNewLog({
                            ...newLog,
                            end_time: dateTimeStr
                          });
                        } else {
                          setNewLog({
                            ...newLog,
                            end_time: ''
                          });
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>

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
                            value={Math.floor((newLog.watch_duration || 0) / 60)}
                            onChange={(e) => {
                              const minutes = parseInt(e.target.value) || 0;
                              const seconds = (newLog.watch_duration || 0) % 60;
                              setNewLog({
                                ...newLog,
                                watch_duration: minutes * 60 + seconds
                              });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
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
                            value={(newLog.watch_duration || 0) % 60}
                            onChange={(e) => {
                              const seconds = parseInt(e.target.value) || 0;
                              const minutes = Math.floor((newLog.watch_duration || 0) / 60);
                              setNewLog({
                                ...newLog,
                                watch_duration: minutes * 60 + Math.min(59, seconds)
                              });
                            }}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          />
                          <span className="ml-2 text-sm text-gray-600 dark:text-gray-400">秒</span>
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 space-y-1">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        現在の視聴時間: {formatTime(newLog.watch_duration || 0)}
                      </p>
                      {newLog.start_time && newLog.end_time && (
                        <button
                          type="button"
                          onClick={() => {
                            const calculateDuration = () => {
                              const startStr = newLog.start_time!.replace('.000Z', '').replace('Z', '');
                              const endStr = newLog.end_time!.replace('.000Z', '').replace('Z', '');

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

                            const duration = calculateDuration();
                            if (duration > 0) {
                              setNewLog({
                                ...newLog,
                                watch_duration: duration
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

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      進捗率（%）
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={newLog.progress || 0}
                      onChange={(e) => setNewLog({
                        ...newLog,
                        progress: parseInt(e.target.value) || 0
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      ステータス
                    </label>
                    <select
                      value={newLog.status || 'not_started'}
                      onChange={(e) => setNewLog({
                        ...newLog,
                        status: e.target.value as any
                      })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="not_started">未開始</option>
                      <option value="in_progress">受講中</option>
                      <option value="completed">完了</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end space-x-3 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowAddModal(false);
                      setNewLog({
                        user_name: '',
                        user_email: '',
                        company: '',
                        department: '',
                        course_id: '',
                        course_title: '',
                        video_id: '',
                        video_title: '',
                        start_time: '',
                        end_time: '',
                        watch_duration: 0,
                        progress: 0,
                        status: 'not_started'
                      });
                    }}
                  >
                    キャンセル
                  </Button>
                  <Button
                    onClick={handleAddLog}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    追加
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}