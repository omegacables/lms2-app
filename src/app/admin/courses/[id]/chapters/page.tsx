'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import SimpleChapterManager from '@/components/admin/SimpleChapterManager';
import { ArrowLeftIcon } from '@heroicons/react/24/outline';

interface Course {
  id: string;
  title: string;
  description: string;
}

export default function ChapterManagementPage() {
  const router = useRouter();
  const params = useParams();
  const courseId = params.id as string;
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (courseId) {
      fetchCourse();
    }
  }, [courseId]);

  const fetchCourse = async () => {
    try {
      // Supabaseを直接使用してコース情報を取得
      const { supabase } = await import('@/lib/database/supabase');
      const { data: courseData, error } = await supabase
        .from('courses')
        .select('id, title, description')
        .eq('id', courseId)
        .single();

      if (error) {
        console.error('Failed to fetch course:', error);
      } else if (courseData) {
        setCourse(courseData);
      }
    } catch (error) {
      console.error('Error fetching course:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="flex justify-center items-center min-h-64">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  if (!course) {
    return (
      <AuthGuard>
        <MainLayout>
          <div className="text-center py-12">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">コースが見つかりません</h2>
            <Link href="/admin/courses">
              <button className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
                コース一覧に戻る
              </button>
            </Link>
          </div>
        </MainLayout>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center space-x-4 mb-4">
              <Link
                href={`/admin/courses/${courseId}/edit`}
                className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <ArrowLeftIcon className="h-5 w-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">章管理</h1>
                <p className="text-gray-600 dark:text-gray-400">コースの章構成を管理します</p>
              </div>
            </div>
          </div>

          {/* Chapter Manager Component */}
          <SimpleChapterManager courseId={courseId} courseTitle={course.title} />
        </div>
      </MainLayout>
    </AuthGuard>
  );
}