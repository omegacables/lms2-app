'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import { useAuth } from '@/stores/auth';
import {
  TrophyIcon,
  BookOpenIcon,
  DocumentCheckIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

/**
 * コース受講完了ページ。
 * 最後の動画を視聴完了した時に遷移してくる。
 * 未完了ユーザーが直接URLを開いた場合はコース詳細へ戻す。
 */
export default function CourseCompletePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const courseId = parseInt(params.id as string);

  const [loading, setLoading] = useState(true);
  const [courseTitle, setCourseTitle] = useState('');
  const [hasCertificate, setHasCertificate] = useState(false);

  useEffect(() => {
    if (!user || !courseId) return;

    const verify = async () => {
      try {
        // コース情報
        const { data: course } = await supabase
          .from('courses')
          .select('id, title')
          .eq('id', courseId)
          .single();

        if (!course) {
          router.replace('/my-courses');
          return;
        }
        setCourseTitle(course.title || '');

        // 本当に全動画を完了しているか確認（未完了なら直リンク対策でコースへ戻す）
        const { data: courseVideos } = await supabase
          .from('videos')
          .select('id')
          .eq('course_id', courseId)
          .eq('status', 'active');

        const { data: completedLogs } = await supabase
          .from('video_view_logs')
          .select('video_id')
          .eq('user_id', user.id)
          .eq('course_id', courseId)
          .eq('status', 'completed');

        const completedIds = new Set((completedLogs || []).map((l) => l.video_id));
        const total = courseVideos?.length || 0;
        const done = (courseVideos || []).filter((v) => completedIds.has(v.id)).length;

        if (total === 0 || done < total) {
          router.replace(`/courses/${courseId}`);
          return;
        }

        // 証明書の有無
        const { data: cert } = await supabase
          .from('certificates')
          .select('id')
          .eq('user_id', user.id)
          .eq('course_id', courseId)
          .maybeSingle();
        setHasCertificate(!!cert);

        setLoading(false);
      } catch (err) {
        console.error('受講完了ページ確認エラー:', err);
        router.replace(`/courses/${courseId}`);
      }
    };

    verify();
  }, [user, courseId, router]);

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
        <div className="max-w-2xl mx-auto py-6 sm:py-16 px-2">
          <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden text-center">
            {/* 上部の帯 */}
            <div className="h-2 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-400" />

            <div className="p-6 sm:p-12">
              <div className="mx-auto mb-5 sm:mb-6 flex h-20 w-20 sm:h-24 sm:w-24 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/20">
                <TrophyIcon className="h-11 w-11 sm:h-14 sm:w-14 text-amber-500" />
              </div>

              <p className="text-sm sm:text-base font-semibold text-amber-600 dark:text-amber-400 mb-1">
                受講完了
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-3">
                お疲れさまでした！
              </h1>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 mb-2">
                コースのすべての動画を視聴完了しました。
              </p>
              <p className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white bg-gray-50 dark:bg-neutral-800 rounded-lg px-4 py-3 mb-6 sm:mb-8">
                {courseTitle}
              </p>

              {hasCertificate && (
                <p className="flex items-center justify-center gap-1.5 text-sm text-green-600 dark:text-green-400 mb-6">
                  <DocumentCheckIcon className="h-5 w-5" />
                  修了証明書が発行されています
                </p>
              )}

              <div className="flex flex-col sm:flex-row justify-center gap-2 sm:gap-3">
                {hasCertificate && (
                  <Link href="/certificates">
                    <Button className="w-full sm:w-auto">
                      <TrophyIcon className="h-4 w-4 mr-2" />
                      証明書を確認する
                    </Button>
                  </Link>
                )}
                <Link href="/my-courses">
                  <Button variant={hasCertificate ? 'outline' : 'primary'} className="w-full sm:w-auto">
                    <BookOpenIcon className="h-4 w-4 mr-2" />
                    マイコースへ
                  </Button>
                </Link>
                <Link href={`/courses/${courseId}`}>
                  <Button variant="outline" className="w-full sm:w-auto">
                    コース詳細
                    <ArrowRightIcon className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
