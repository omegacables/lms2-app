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
  ClipboardDocumentListIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PencilIcon,
  DocumentTextIcon,
  CalendarIcon,
  UserIcon,
  ArrowRightIcon,
  FunnelIcon,
  ChevronDownIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleIconSolid } from '@heroicons/react/24/solid';

interface Assignment {
  id: number;
  title: string;
  description: string;
  course_title: string;
  course_id: number;
  due_date: string;
  status: 'pending' | 'submitted' | 'graded';
  score?: number;
  max_score: number;
  submitted_at?: string;
  feedback?: string;
  created_at: string;
  difficulty: 'easy' | 'medium' | 'hard';
  estimated_time: number; // in minutes
}

export default function HomeworkPage() {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'submitted' | 'graded'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    submitted: 0,
    graded: 0,
    averageScore: 0
  });

  useEffect(() => {
    if (user) {
      fetchAssignments();
    }
  }, [user]);

  const fetchAssignments = async () => {
    try {
      setLoading(true);

      if (!user) return;

      // video_resourcesテーブルから課題（assignment）を取得
      const { data: homeworkResources, error } = await supabase
        .from('video_resources')
        .select(`
          *,
          videos (
            id,
            title,
            course_id,
            courses (
              id,
              title
            )
          )
        `)
        .eq('resource_type', 'assignment')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('課題取得エラー:', error);
        setAssignments([]);
        setStats({ total: 0, pending: 0, submitted: 0, graded: 0, averageScore: 0 });
        return;
      }

      console.log('取得した課題リソース数:', homeworkResources?.length || 0);
      console.log('課題リソース詳細:', homeworkResources);

      // video_resourcesデータをAssignment形式に変換
      const assignments: Assignment[] = (homeworkResources || []).map(resource => {
        // videosがオブジェクトか配列かを確認
        const video = Array.isArray(resource.videos) ? resource.videos[0] : resource.videos;
        const course = video?.courses ? (Array.isArray(video.courses) ? video.courses[0] : video.courses) : null;

        return {
          id: resource.id,
          title: resource.title || '無題の課題',
          description: resource.description || resource.content || '',
          course_title: course?.title || 'コース名不明',
          course_id: video?.course_id || course?.id || 0,
          due_date: resource.due_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // デフォルトで1週間後
          status: 'pending' as const, // TODO: 提出状況を管理するテーブルが必要
          max_score: 100,
          created_at: resource.created_at,
          difficulty: 'medium' as const,
          estimated_time: 30,
        };
      });

      // Calculate stats
      const total = assignments.length;
      const pending = assignments.filter(a => a.status === 'pending').length;
      const submitted = assignments.filter(a => a.status === 'submitted').length;
      const graded = assignments.filter(a => a.status === 'graded').length;
      const gradedAssignments = assignments.filter(a => a.status === 'graded' && a.score);
      const averageScore = gradedAssignments.length > 0
        ? Math.round(gradedAssignments.reduce((sum, a) => sum + (a.score || 0), 0) / gradedAssignments.length)
        : 0;

      setAssignments(assignments);
      setStats({ total, pending, submitted, graded, averageScore });

    } catch (error) {
      console.error('課題取得エラー:', error);
      setAssignments([]);
      setStats({ total: 0, pending: 0, submitted: 0, graded: 0, averageScore: 0 });
    } finally {
      setLoading(false);
    }
  };

  const filteredAssignments = assignments.filter(assignment => {
    if (filter === 'all') return true;
    return assignment.status === filter;
  });

  const getStatusBadge = (assignment: Assignment) => {
    const isOverdue = new Date(assignment.due_date) < new Date() && assignment.status === 'pending';
    
    switch (assignment.status) {
      case 'pending':
        return (
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
            isOverdue ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
          }`}>
            {isOverdue ? <ExclamationTriangleIcon className="h-3 w-3 mr-1" /> : <ClockIcon className="h-3 w-3 mr-1" />}
            {isOverdue ? '期限切れ' : '未提出'}
          </span>
        );
      case 'submitted':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <DocumentTextIcon className="h-3 w-3 mr-1" />
            提出済み
          </span>
        );
      case 'graded':
        return (
          <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircleIconSolid className="h-3 w-3 mr-1" />
            採点済み
          </span>
        );
      default:
        return null;
    }
  };

  const getDifficultyBadge = (difficulty: string) => {
    const colors = {
      easy: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      hard: 'bg-red-100 text-red-800'
    };
    
    const labels = {
      easy: '初級',
      medium: '中級',
      hard: '上級'
    };

    return (
      <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${colors[difficulty as keyof typeof colors]}`}>
        {labels[difficulty as keyof typeof labels]}
      </span>
    );
  };

  const formatDuration = (minutes: number) => {
    if (minutes < 60) {
      return `${minutes}分`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return remainingMinutes > 0 ? `${hours}時間${remainingMinutes}分` : `${hours}時間`;
  };

  const getTimeUntilDue = (dueDate: string) => {
    const now = new Date();
    const due = new Date(dueDate);
    const diffInHours = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 0) {
      return '期限切れ';
    }
    if (diffInHours < 24) {
      return `${diffInHours}時間後`;
    }
    const diffInDays = Math.ceil(diffInHours / 24);
    return `${diffInDays}日後`;
  };

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
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">課題・宿題</h1>
            <p className="text-lg text-gray-600 dark:text-gray-400">
              コースに関連する課題や宿題の管理・提出を行えます。
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
            <div className="bg-white dark:bg-neutral-900 dark:bg-neutral-900 rounded-xl p-6 border border-gray-200 dark:border-neutral-800">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <ClipboardDocumentListIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">総課題数</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 border border-gray-200 dark:border-neutral-800">
              <div className="flex items-center">
                <div className="p-2 bg-yellow-100 rounded-lg">
                  <ClockIcon className="h-6 w-6 text-yellow-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.pending}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">未提出</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 border border-gray-200 dark:border-neutral-800">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <DocumentTextIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.submitted}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">提出済み</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 border border-gray-200 dark:border-neutral-800">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <CheckCircleIcon className="h-6 w-6 text-green-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.graded}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">採点済み</p>
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-neutral-900 rounded-xl p-6 border border-gray-200 dark:border-neutral-800">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <UserIcon className="h-6 w-6 text-purple-600" />
                </div>
                <div className="ml-4">
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.averageScore}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">平均点</p>
                </div>
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="bg-white dark:bg-neutral-900 rounded-lg border border-gray-200 dark:border-neutral-800 p-4 shadow-sm dark:shadow-gray-900/20 mb-6">
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Filter Toggle (Mobile) */}
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center px-4 py-2 text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 lg:hidden"
              >
                <FunnelIcon className="h-4 w-4 mr-2" />
                フィルター
                <ChevronDownIcon className={`h-4 w-4 ml-2 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>

              {/* Desktop Filters */}
              <div className="hidden lg:flex items-center space-x-4">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">表示:</span>
                {[
                  { key: 'all', label: 'すべて' },
                  { key: 'pending', label: '未提出' },
                  { key: 'submitted', label: '提出済み' },
                  { key: 'graded', label: '採点済み' }
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key as typeof filter)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                      filter === key
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Mobile Filters */}
            {showFilters && (
              <div className="lg:hidden mt-4 pt-4 border-t border-gray-200 dark:border-neutral-800">
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { key: 'all', label: 'すべて' },
                    { key: 'pending', label: '未提出' },
                    { key: 'submitted', label: '提出済み' },
                    { key: 'graded', label: '採点済み' }
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setFilter(key as typeof filter)}
                      className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                        filter === key
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Results count */}
            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-neutral-800">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {filteredAssignments.length}件の課題が見つかりました
              </p>
            </div>
          </div>

          {/* Assignment List */}
          {filteredAssignments.length === 0 ? (
            <div className="text-center py-12">
              <ClipboardDocumentListIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">課題がありません</h3>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                {filter === 'all' 
                  ? 'まだ課題が割り当てられていません。コースを受講すると課題が表示されます。'
                  : `${filter === 'pending' ? '未提出' : filter === 'submitted' ? '提出済み' : '採点済み'}の課題はありません。`
                }
              </p>
              {filter === 'all' && (
                <Link href="/my-courses">
                  <Button className="bg-blue-600 hover:bg-blue-700">
                    コースを探す
                  </Button>
                </Link>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {filteredAssignments.map((assignment) => {
                const isOverdue = new Date(assignment.due_date) < new Date() && assignment.status === 'pending';
                
                return (
                  <div key={assignment.id} className={`bg-white dark:bg-neutral-900 rounded-xl border p-6 hover:shadow-lg dark:shadow-gray-900/50 transition-shadow ${
                    isOverdue ? 'border-red-200' : 'border-gray-200 dark:border-neutral-800'
                  }`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-3">
                          <h3 className="text-xl font-bold text-gray-900 dark:text-white">{assignment.title}</h3>
                          {getStatusBadge(assignment)}
                          {getDifficultyBadge(assignment.difficulty)}
                        </div>

                        <p className="text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">{assignment.description}</p>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-400 mb-4">
                          <span className="flex items-center">
                            <UserIcon className="h-4 w-4 mr-1" />
                            {assignment.course_title}
                          </span>
                          <span className="flex items-center">
                            <CalendarIcon className="h-4 w-4 mr-1" />
                            期限: {new Date(assignment.due_date).toLocaleDateString('ja-JP')}
                          </span>
                          <span className="flex items-center">
                            <ClockIcon className="h-4 w-4 mr-1" />
                            推定時間: {formatDuration(assignment.estimated_time)}
                          </span>
                          <span className={`font-medium ${
                            isOverdue ? 'text-red-600' : 
                            getTimeUntilDue(assignment.due_date) === '1日後' || getTimeUntilDue(assignment.due_date).includes('時間') 
                              ? 'text-orange-600' : 'text-gray-600 dark:text-gray-400'
                          }`}>
                            {getTimeUntilDue(assignment.due_date)}
                          </span>
                        </div>

                        {assignment.status === 'graded' && assignment.score !== undefined && (
                          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-lg p-4 mb-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium text-green-900">採点結果</span>
                              <span className="text-green-700 font-bold">
                                {assignment.score}/{assignment.max_score}点
                              </span>
                            </div>
                            {assignment.feedback && (
                              <p className="text-green-800 text-sm">{assignment.feedback}</p>
                            )}
                          </div>
                        )}

                        <div className="flex items-center space-x-4">
                          {assignment.status === 'pending' && (
                            <Button className="bg-blue-600 hover:bg-blue-700 flex items-center">
                              <PencilIcon className="h-4 w-4 mr-2" />
                              課題に取り組む
                            </Button>
                          )}
                          
                          {assignment.status === 'submitted' && (
                            <Button variant="outline" className="flex items-center">
                              <DocumentTextIcon className="h-4 w-4 mr-2" />
                              提出内容を確認
                            </Button>
                          )}

                          {assignment.status === 'graded' && (
                            <Button variant="outline" className="flex items-center">
                              <CheckCircleIcon className="h-4 w-4 mr-2" />
                              詳細を確認
                            </Button>
                          )}

                          <Link href={`/courses/${assignment.course_id}`}>
                            <Button variant="outline" className="flex items-center text-blue-700 border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20">
                              コースを見る
                              <ArrowRightIcon className="h-4 w-4 ml-2" />
                            </Button>
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}