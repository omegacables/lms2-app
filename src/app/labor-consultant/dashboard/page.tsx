'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuth } from '@/stores/auth';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import {
  UserGroupIcon,
  AcademicCapIcon,
  ClockIcon,
  TrophyIcon,
  ChartBarIcon,
  BuildingOfficeIcon
} from '@heroicons/react/24/outline';

interface DashboardStats {
  totalStudents: number;
  totalCompanies: number;
  totalCourses: number;
  totalLearningTime: number;
  completedCertificates: number;
  activeStudents: number;
}

export default function LaborConsultantDashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalStudents: 0,
    totalCompanies: 0,
    totalCourses: 0,
    totalLearningTime: 0,
    completedCertificates: 0,
    activeStudents: 0
  });
  const [assignedCompanies, setAssignedCompanies] = useState<string[]>([]);

  useEffect(() => {
    fetchDashboardData();
  }, [user?.id]);

  const fetchDashboardData = async () => {
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
        .select('*')
        .in('company', companies);

      const studentIds = studentsData?.map(s => s.id) || [];

      // 学習統計を取得
      const { data: logsData } = await supabase
        .from('video_view_logs')
        .select('user_id, total_watched_time, status')
        .in('user_id', studentIds);

      // 証明書数を取得
      const { data: certificatesData } = await supabase
        .from('certificates')
        .select('id')
        .in('user_id', studentIds);

      // コース数を取得
      const { data: coursesData } = await supabase
        .from('courses')
        .select('id')
        .eq('status', 'active');

      // アクティブな生徒（過去30日以内にログインした生徒）
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const activeStudents = studentsData?.filter(s => {
        if (!s.last_login_at) return false;
        return new Date(s.last_login_at) >= thirtyDaysAgo;
      }).length || 0;

      // 総学習時間を計算
      const totalLearningTime = logsData?.reduce((sum, log) => sum + (log.total_watched_time || 0), 0) || 0;

      setStats({
        totalStudents: studentsData?.length || 0,
        totalCompanies: companies.length,
        totalCourses: coursesData?.length || 0,
        totalLearningTime: Math.floor(totalLearningTime / 60), // 分に変換
        completedCertificates: certificatesData?.length || 0,
        activeStudents
      });

    } catch (error) {
      console.error('ダッシュボードデータ取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (minutes: number) => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}時間${mins}分`;
  };

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

  const statCards = [
    {
      title: '担当会社数',
      value: stats.totalCompanies,
      icon: BuildingOfficeIcon,
      color: 'bg-blue-500',
      link: '/labor-consultant/students'
    },
    {
      title: '担当生徒数',
      value: stats.totalStudents,
      icon: UserGroupIcon,
      color: 'bg-green-500',
      link: '/labor-consultant/students'
    },
    {
      title: 'アクティブ生徒',
      value: stats.activeStudents,
      icon: UserGroupIcon,
      color: 'bg-purple-500',
      link: '/labor-consultant/students'
    },
    {
      title: '利用可能コース',
      value: stats.totalCourses,
      icon: AcademicCapIcon,
      color: 'bg-orange-500',
      link: '/courses'
    },
    {
      title: '総学習時間',
      value: formatTime(stats.totalLearningTime),
      icon: ClockIcon,
      color: 'bg-cyan-500',
      link: '/labor-consultant/learning-logs'
    },
    {
      title: '発行証明書',
      value: stats.completedCertificates,
      icon: TrophyIcon,
      color: 'bg-yellow-500',
      link: '/labor-consultant/certificates'
    }
  ];

  return (
    <AuthGuard>
      <MainLayout>
        <div className="container mx-auto px-4 py-8">
          {/* ヘッダー */}
          <div className="mb-8">
            <div className="flex items-center">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                <ChartBarIcon className="h-6 w-6 text-blue-600" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900 dark:text-white">社労士事務所ダッシュボード</h1>
                <p className="text-gray-600 dark:text-gray-400">担当会社・生徒の学習状況を確認できます。</p>
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
              {/* 統計カード */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                {statCards.map((stat, index) => (
                  <Link key={index} href={stat.link}>
                    <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6 hover:shadow-md transition-shadow cursor-pointer">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">{stat.title}</p>
                          <p className="text-2xl font-bold text-gray-900 dark:text-white">
                            {typeof stat.value === 'number' ? stat.value.toLocaleString() : stat.value}
                          </p>
                        </div>
                        <div className={`w-12 h-12 ${stat.color} rounded-lg flex items-center justify-center`}>
                          <stat.icon className="h-6 w-6 text-white" />
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>

              {/* 担当会社一覧 */}
              <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm dark:shadow-gray-900/20 border p-6">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">担当会社一覧</h2>
                <div className="space-y-2">
                  {assignedCompanies.map((company, index) => (
                    <div
                      key={index}
                      className="flex items-center p-3 bg-gray-50 dark:bg-neutral-800 rounded-lg"
                    >
                      <BuildingOfficeIcon className="h-5 w-5 text-gray-500 dark:text-gray-400 mr-3" />
                      <span className="text-gray-900 dark:text-white">{company}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
