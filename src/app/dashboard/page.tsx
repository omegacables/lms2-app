"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { MainLayout } from "@/components/layout/MainLayout";
import { useAuth } from "@/stores/auth";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { supabase } from "@/lib/database/supabase";
import { difficultyLabel, difficultyBadgeClass, sortCoursesByDifficulty } from "@/lib/constants/difficulty";
import {
  PlayIcon,
  BookOpenIcon,
  AcademicCapIcon,
  TrophyIcon,
  ClockIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  CheckCircleIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";
import type { Tables } from "@/lib/database/supabase";

type Course = Tables<"courses">;
type VideoViewLog = Tables<"video_view_logs"> & {
  videos?: {
    title: string;
    course_id: number;
  };
  courses?: {
    title: string;
  };
};

interface DashboardStats {
  totalCourses: number;
  completedCourses: number;
  inProgressCourses: number;
  totalCertificates: number;
  totalWatchTime: number;
  recentActivity: VideoViewLog[];
  currentCourse?: {
    id: number;
    title: string;
    description: string;
    progress: number;
    nextVideo?: string;
  };
  assignedCourses: Course[];
  notStartedCourses: number;
  continueWatching?: {
    videoId: number;
    videoTitle: string;
    courseId: number;
    courseTitle: string;
    position: number; // 前回の再生位置（秒）
    progressPercent: number;
    isNext: boolean; // true: 未視聴の「次の動画」への案内（前回分はすべて完了済み）
  };
}

export default function DashboardPage() {
  const { user, signOut, initialized } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [shouldShowContent, setShouldShowContent] = useState(false);
  const router = useRouter();

  // 認証チェック
  useEffect(() => {
    if (initialized) {
      if (!user) {
        console.log("[Dashboard] No authenticated user, redirecting to login");
        router.replace("/auth/login?redirectTo=/dashboard");
        setShouldShowContent(false);
      } else {
        setShouldShowContent(true);
        console.log("[Dashboard] User state:", user);
        // 実際のデータを取得
        fetchDashboardStats();
      }
    }
  }, [initialized, user, router]);

  const fetchDashboardStats = async () => {
    if (!user) return;

    try {
      setLoading(true);

      // ユーザーに割り当てられたコースIDを取得
      const { data: assignments, error: assignError } = await supabase
        .from("user_courses")
        .select("course_id")
        .eq("user_id", user.id);

      if (assignError) {
        console.error("割り当てコース取得エラー:", assignError);
      }

      // 割り当てられたコースの詳細を取得
      let userCourses: any[] = [];
      if (assignments && assignments.length > 0) {
        const courseIds = assignments.map((a) => a.course_id);
        const { data: coursesData } = await supabase
          .from("courses")
          .select("*")
          .in("id", courseIds);

        // 各コースの動画情報を取得して総時間を計算
        if (coursesData) {
          for (const course of coursesData) {
            // APIエンドポイントから動画情報を取得（非公開動画も含む）
            let videoCount = 0;
            let calculatedDuration = 0;

            try {
              const response = await fetch(`/api/courses/${course.id}/video-count`);
              if (response.ok) {
                const { data } = await response.json();
                videoCount = data.totalCount;
                calculatedDuration = data.totalDuration;
              } else {
                // フォールバック: 直接クエリ
                const { data: videos } = await supabase
                  .from("videos")
                  .select("duration")
                  .eq("course_id", course.id);
                calculatedDuration = videos?.reduce((sum, video) => sum + (video.duration || 0), 0) || 0;
                videoCount = videos?.length || 0;
              }
            } catch (error) {
              console.error(`コース${course.id}の動画情報取得エラー:`, error);
              videoCount = 0;
              calculatedDuration = 0;
            }

            // 動画の総時間を計算（秒）
            // estimated_durationが設定されていればそれを使用、なければ動画の合計時間を使用
            const totalDuration = course.estimated_duration || calculatedDuration;

            // ユーザーの視聴ログを取得
            const { data: userViewLogs } = await supabase
              .from("video_view_logs")
              .select("total_watched_time, status")
              .eq("user_id", user.id)
              .eq("course_id", course.id);

            const totalWatchedTime = userViewLogs?.reduce((sum, log) => sum + (log.total_watched_time || 0), 0) || 0;

            // コースのステータスを判定
            let status = "not_started";
            if (userViewLogs && userViewLogs.length > 0) {
              const completedCount = userViewLogs.filter(log => log.status === "completed").length;
              if (completedCount === videoCount && videoCount > 0) {
                status = "completed";
              } else {
                status = "in_progress";
              }
            }

            userCourses.push({
              ...course,
              totalDuration, // 動画の総時間（秒）
              videoCount,    // 動画の数
              totalWatchedTime, // ユーザーの視聴時間（秒）
              status        // コースのステータス
            });
          }
        }
      }

      const totalCourses = userCourses?.length || 0;

      // ユーザーの視聴ログを取得
      const { data: viewLogs } = await supabase
        .from("video_view_logs")
        .select(
          `
          *,
          videos(title, course_id),
          courses(title)
        `,
        )
        .eq("user_id", user.id)
        .order("last_updated", { ascending: false });

      // 完了したコースの数を計算
      const courseProgress = new Map<
        number,
        { total: number; completed: number }
      >();

      viewLogs?.forEach((log) => {
        const courseId = log.course_id;
        if (!courseProgress.has(courseId)) {
          courseProgress.set(courseId, { total: 0, completed: 0 });
        }
        const progress = courseProgress.get(courseId)!;
        progress.total++;
        if (log.status === "completed") {
          progress.completed++;
        }
      });

      // 完了コース数を計算（95%以上完了）
      let completedCourses = 0;
      let inProgressCourses = 0;

      courseProgress.forEach(({ total, completed }) => {
        const completionRate = (completed / total) * 100;
        if (completionRate >= 95) {
          completedCourses++;
        } else if (completionRate > 0) {
          inProgressCourses++;
        }
      });

      // 総視聴時間を計算
      const totalWatchTime =
        viewLogs?.reduce((sum, log) => sum + log.total_watched_time, 0) || 0;

      // 証明書数を取得
      const { count: totalCertificates } = await supabase
        .from("certificates")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_active", true);

      // 「前回の続きから」: 最後に視聴した未完了の動画。
      // すべて完了済みの場合は、最後に視聴したコースの「次の未視聴動画」を案内する
      let continueWatching = undefined;
      if (viewLogs && viewLogs.length > 0) {
        const resumeLog = viewLogs.find(
          (log) => log.status !== "completed" && log.video_id
        );
        if (resumeLog?.video_id && resumeLog.course_id) {
          // 未完了の動画がある → 続きから再生
          continueWatching = {
            videoId: resumeLog.video_id,
            videoTitle: resumeLog.videos?.title || "動画",
            courseId: resumeLog.course_id,
            courseTitle: resumeLog.courses?.title || "コース",
            position: resumeLog.current_position || 0,
            progressPercent: Math.min(
              100,
              Math.round(resumeLog.progress_percent || 0)
            ),
            isNext: false,
          };
        } else if (viewLogs[0]?.course_id) {
          // 視聴済みはすべて完了 → 最後に視聴したコースの次の未視聴動画を探す
          const latestLog = viewLogs[0];
          const { data: courseVideos } = await supabase
            .from("videos")
            .select("id, title, order_index")
            .eq("course_id", latestLog.course_id)
            .eq("status", "active")
            .order("order_index", { ascending: true });

          const completedVideoIds = new Set(
            viewLogs
              .filter(
                (log) =>
                  log.course_id === latestLog.course_id &&
                  log.status === "completed"
              )
              .map((log) => log.video_id)
          );
          const nextVideo = (courseVideos || []).find(
            (v) => !completedVideoIds.has(v.id)
          );

          if (nextVideo) {
            continueWatching = {
              videoId: nextVideo.id,
              videoTitle: nextVideo.title || "動画",
              courseId: latestLog.course_id,
              courseTitle: latestLog.courses?.title || "コース",
              position: 0,
              progressPercent: 0,
              isNext: true,
            };
          }
          // コースを最後まで完了している場合はカードを出さない
        }
      }

      // 現在受講中のコースを取得（最も最近アクセスしたコース）
      let currentCourse = undefined;
      if (viewLogs && viewLogs.length > 0) {
        const latestLog = viewLogs[0];
        if (latestLog.course_id && latestLog.progress < 100) {
          const { data: courseData } = await supabase
            .from("courses")
            .select("*")
            .eq("id", latestLog.course_id)
            .single();

          if (courseData) {
            // コース全体の進捗を計算
            const courseLogs = viewLogs.filter(
              (log) => log.course_id === courseData.id,
            );
            const courseProgress =
              courseLogs.length > 0
                ? Math.round(
                    courseLogs.reduce((sum, log) => sum + log.progress, 0) /
                      courseLogs.length,
                  )
                : 0;

            currentCourse = {
              id: courseData.id,
              title: courseData.title || "コース名未設定",
              description: courseData.description || "",
              progress: courseProgress,
              nextVideo: latestLog.videos?.title,
            };
          }
        }
      }

      // 割り当てられたコースのリストを作成（進捗情報付き）
      const assignedCourses = await Promise.all(
        (userCourses?.slice(0, 4) || []).map(async (uc) => {
          // uc自体がコースデータ
          const course = uc;
          if (!course) return null;

          // 動画数を取得（全体の動画数）
          const { count: videoCount } = await supabase
            .from("videos")
            .select("*", { count: "exact", head: true })
            .eq("course_id", course.id)
            .eq("status", "active");

          // このコースの進捗を計算
          const courseLogs =
            viewLogs?.filter((log) => log.course_id === course.id) || [];
          let progress = 0;
          let totalWatchedTime = 0;

          if (videoCount && videoCount > 0) {
            // 完了した動画の数を全動画数で割って進捗率を計算
            const completedCount = courseLogs.filter(
              (log) => log.status === "completed",
            ).length;
            progress = Math.round((completedCount / videoCount) * 100);
            totalWatchedTime = courseLogs.reduce(
              (sum, log) => sum + (log.total_watched_time || 0),
              0,
            );
          }

          return {
            ...course,
            progress,
            totalWatchedTime: course.totalWatchedTime || totalWatchedTime,
            totalDuration: course.totalDuration || 0,
            videoCount: course.videoCount || videoCount || 0,
            status:
              progress === 100
                ? "completed"
                : progress > 0
                  ? "in_progress"
                  : "not_started",
          };
        }),
      );

      // レベル順（入門→エキスパート）で表示
      const validAssignedCourses = sortCoursesByDifficulty(
        assignedCourses.filter(Boolean) as any[]
      );

      // 未開始のコース数を計算
      const startedCourseIds = new Set(viewLogs?.map((log) => log.course_id));
      const notStartedCourses = validAssignedCourses.filter(
        (course) => !startedCourseIds.has(course.id),
      ).length;

      // 最近のアクティビティに進捗情報を追加
      const recentActivityWithProgress = viewLogs?.slice(0, 5).map(log => {
        // 各ビデオログに対して、そのビデオの視聴進捗を計算
        let videoProgress = 0;

        if (log.status === 'completed') {
          videoProgress = 100;
        } else if (log.video_duration && log.video_duration > 0 && log.total_watched_time) {
          // 視聴時間を動画の長さで割って進捗率を計算
          videoProgress = Math.min(100, Math.round((log.total_watched_time / log.video_duration) * 100));
        } else {
          // フォールバック：progressフィールドを使用（存在する場合）
          videoProgress = log.progress || 0;
        }

        return {
          ...log,
          progress: videoProgress
        };
      }) || [];

      setStats({
        totalCourses: totalCourses || 0,
        completedCourses,
        inProgressCourses,
        totalCertificates: totalCertificates || 0,
        totalWatchTime,
        recentActivity: recentActivityWithProgress,
        currentCourse,
        assignedCourses: validAssignedCourses,
        notStartedCourses,
        continueWatching,
      });
    } catch (error) {
      console.error("ダッシュボード統計取得エラー:", error);
    } finally {
      setLoading(false);
    }
  };

  // 時間帯に応じたあいさつ
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 11) return "おはようございます";
    if (hour >= 11 && hour < 18) return "こんにちは";
    return "こんばんは";
  };

  const formatWatchTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}時間${minutes}分`;
    }
    return `${minutes}分`;
  };

  const getOverallProgress = () => {
    if (!stats || stats.totalCourses === 0) return 0;
    return Math.round(
      ((stats.completedCourses + stats.inProgressCourses * 0.5) /
        stats.totalCourses) *
        100,
    );
  };

  return (
    <AuthGuard>
      <MainLayout>
        {!initialized || !shouldShowContent || loading ? (
          <div className="flex justify-center items-center min-h-64">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <div className="max-w-7xl mx-auto">
            {/* あいさつカード（時間帯あいさつ + 実績サマリー） */}
            <div className="mb-4 sm:mb-6 bg-white dark:bg-neutral-900 rounded-xl sm:rounded-2xl border border-gray-200 dark:border-neutral-800 overflow-hidden">
              <div className="flex flex-col sm:flex-row">
                {/* 左: あいさつ */}
                <div className="flex items-center gap-3 sm:gap-4 p-4 sm:p-6 flex-1 min-w-0">
                  <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-blue-50 dark:bg-blue-900/30 overflow-hidden flex items-center justify-center shrink-0">
                    {user?.profile?.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <UserCircleIcon className="h-8 w-8 sm:h-9 sm:w-9 text-blue-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-400">
                      {getGreeting()}
                    </p>
                    <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                      ようこそ、{user?.profile?.display_name || "ゲスト"}さん
                    </h1>
                    <p className="hidden sm:block text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                      今日も学習を続けましょう
                    </p>
                  </div>
                </div>
                {/* 右: 実績タイル */}
                <div className="grid grid-cols-3 border-t sm:border-t-0 sm:border-l border-gray-200 dark:border-neutral-800 divide-x divide-gray-200 dark:divide-neutral-800 sm:flex">
                  {[
                    { label: "受講コース", value: String(stats?.totalCourses ?? 0), color: "text-blue-600 dark:text-blue-400" },
                    { label: "完了", value: String(stats?.completedCourses ?? 0), color: "text-green-600 dark:text-green-400" },
                    { label: "学習時間", value: formatWatchTime(stats?.totalWatchTime || 0), color: "text-purple-600 dark:text-purple-400" },
                  ].map(({ label, value, color }) => (
                    <div
                      key={label}
                      className="flex flex-col items-center justify-center px-2 py-2.5 sm:px-6 sm:py-4 text-center sm:min-w-[110px]"
                    >
                      <p className={`text-base sm:text-2xl font-bold ${color} truncate max-w-full`}>{value}</p>
                      <p className="text-[10px] sm:text-xs font-medium tracking-wide text-gray-500 dark:text-gray-400">
                        {label}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 前回の続きから */}
            {stats?.continueWatching && (
              <Link
                href={`/courses/${stats.continueWatching.courseId}/videos/${stats.continueWatching.videoId}`}
                className="block mb-4 sm:mb-8 group"
              >
                <div className="bg-neutral-950 hover:bg-neutral-900 dark:bg-black dark:hover:bg-neutral-950 border border-neutral-800 rounded-xl sm:rounded-2xl p-4 sm:p-7 text-white transition-colors">
                  <div className="flex items-center gap-4 sm:gap-6">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold tracking-widest text-amber-400 mb-1.5 sm:mb-2">
                        <PlayIcon className="h-3.5 w-3.5" />
                        {stats.continueWatching.isNext ? "次の動画" : "受講中"}
                      </p>
                      <h2 className="text-lg sm:text-2xl font-bold truncate mb-0.5">
                        {stats.continueWatching.videoTitle}
                      </h2>
                      <p className="text-xs sm:text-sm text-neutral-400 truncate mb-3">
                        {stats.continueWatching.courseTitle}
                      </p>
                      {/* 進捗バー（次の動画案内のときは非表示） */}
                      {!stats.continueWatching.isNext && (
                        <div className="flex items-center gap-3 max-w-md">
                          <span className="text-[11px] sm:text-xs text-neutral-400 shrink-0">学習進捗</span>
                          <div className="h-1.5 flex-1 rounded-full bg-white/15 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-amber-400"
                              style={{ width: `${stats.continueWatching.progressPercent}%` }}
                            />
                          </div>
                          <span className="text-xs sm:text-sm font-bold text-amber-400 shrink-0">
                            {stats.continueWatching.progressPercent}%
                          </span>
                        </div>
                      )}
                    </div>
                    <span className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-xl bg-white text-neutral-950 group-hover:bg-neutral-100 px-6 py-3.5 text-sm font-bold transition-colors">
                      {stats.continueWatching.isNext ? "次の動画へ" : "学習を再開"}
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                    </span>
                    <span className="sm:hidden flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-neutral-950">
                      <PlayIcon className="h-5 w-5 ml-0.5" />
                    </span>
                  </div>
                </div>
              </Link>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-8">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-4 sm:space-y-8">
                {/* Current Course */}
                {stats?.currentCourse ? (
                  <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl sm:rounded-2xl p-5 sm:p-8 text-white">
                    <div className="flex items-start justify-between mb-4 sm:mb-6">
                      <div className="flex-1 min-w-0">
                        <h2 className="text-lg sm:text-2xl font-bold mb-1 sm:mb-2">
                          {stats.currentCourse.title || "コース名未設定"}
                        </h2>
                        <p className="text-blue-100 mb-3 sm:mb-4 text-sm sm:text-base line-clamp-2 sm:line-clamp-3">
                          {stats.currentCourse.description || "説明なし"}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs sm:text-sm text-blue-100">
                          <span className="flex items-center">
                            <ClockIcon className="h-4 w-4 mr-1" />
                            {formatWatchTime(stats.totalWatchTime)}
                          </span>
                          {stats.currentCourse.nextVideo && (
                            <span className="flex items-center min-w-0">
                              <AcademicCapIcon className="h-4 w-4 mr-1 shrink-0" />
                              <span className="truncate">次: {stats.currentCourse.nextVideo}</span>
                            </span>
                          )}
                          <span className="flex items-center">
                            <ChartBarIcon className="h-4 w-4 mr-1" />
                            {stats.currentCourse.progress}%
                          </span>
                        </div>
                      </div>
                      <div className="ml-4 sm:ml-6 hidden sm:block">
                        <div className="w-24 h-24 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                          <BookOpenIcon className="h-12 w-12 text-white" />
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-4 sm:mb-6">
                      <div className="flex justify-between text-xs sm:text-sm mb-1.5 sm:mb-2">
                        <span>コース進捗</span>
                        <span>{stats.currentCourse.progress}%</span>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-900/30 rounded-full h-2.5 sm:h-3">
                        <div
                          className="bg-green-400 dark:bg-green-500 rounded-full h-full transition-all duration-300"
                          style={{ width: `${stats.currentCourse.progress}%` }}
                        />
                      </div>
                    </div>

                    <Link
                      href={`/courses/${stats.currentCourse.id}`}
                      className="inline-flex items-center px-4 py-2.5 sm:px-6 sm:py-3 bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 rounded-lg sm:rounded-xl font-semibold text-sm sm:text-base hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors"
                    >
                      <PlayIcon className="h-5 w-5 mr-2" />
                      学習を続ける
                    </Link>
                  </div>
                ) : null}

                {/* Assigned Courses */}
                {stats?.assignedCourses && stats.assignedCourses.length > 0 && (
                  <div>
                    <div className="flex items-end justify-between mb-3 sm:mb-6">
                      <div>
                        <p className="text-[11px] sm:text-xs font-semibold tracking-wider text-gray-400 dark:text-gray-500 mb-0.5">
                          コースを選択
                        </p>
                        <h3 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
                          学びたいコースを選んでください
                        </h3>
                      </div>
                      <Link
                        href="/my-courses"
                        className="text-sm sm:text-base text-blue-600 hover:text-blue-700 font-medium shrink-0"
                      >
                        すべて見る
                      </Link>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-6">
                      {stats.assignedCourses.map((course) => (
                        <Link
                          key={course.id}
                          href={`/courses/${course.id}`}
                          className="block"
                        >
                          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 overflow-hidden hover:shadow-lg hover:border-blue-300 dark:hover:border-blue-700 dark:hover:shadow-gray-900/50 transition-all cursor-pointer">
                            <div className="h-1 bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
                            {course.thumbnail_url ? (
                              <div className="aspect-video relative bg-gray-100 dark:bg-neutral-800">
                                <img
                                  src={course.thumbnail_url}
                                  alt={course.title || "コース画像"}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="aspect-video bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center">
                                <BookOpenIcon className="h-16 w-16 text-blue-400 dark:text-blue-500" />
                              </div>
                            )}
                            <div className="p-6">
                              <div className="flex items-start justify-between mb-3">
                                <h4 className="font-semibold text-gray-900 dark:text-white flex-1 line-clamp-2">
                                  {course.title || "コース名未設定"}
                                </h4>
                                {course.difficulty_level && (
                                  <span
                                    className={`px-2 py-1 rounded-full text-xs font-medium ml-2 ${difficultyBadgeClass(course.difficulty_level)}`}
                                  >
                                    {difficultyLabel(course.difficulty_level)}
                                  </span>
                                )}
                              </div>
                              <p className="text-gray-600 dark:text-gray-400 text-sm mb-4 line-clamp-2">
                                {course.description || "説明なし"}
                              </p>
                              <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400 mb-3">
                                <span className="flex items-center">
                                  <ClockIcon className="h-4 w-4 mr-1" />
                                  {course.totalWatchedTime
                                    ? formatWatchTime(course.totalWatchedTime) +
                                      " / "
                                    : ""}
                                  {course.totalDuration
                                    ? formatWatchTime(course.totalDuration)
                                    : "時間未設定"}
                                </span>
                                <span className="flex items-center">
                                  <AcademicCapIcon className="h-4 w-4 mr-1" />
                                  {course.videoCount || 0} 動画
                                </span>
                              </div>

                              {/* ステータスバッジ */}
                              <div className="mb-3">
                                {course.status === "completed" ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                    <CheckCircleIcon className="h-3 w-3 mr-1" />
                                    受講完了
                                  </span>
                                ) : course.status === "in_progress" ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                    <PlayIcon className="h-3 w-3 mr-1" />
                                    受講中
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                    未開始
                                  </span>
                                )}
                              </div>

                              {/* プログレスバー */}
                              {course.progress > 0 && (
                                <div className="mb-4">
                                  <div className="flex items-center justify-between text-xs mb-1">
                                    <span className="text-gray-600 dark:text-gray-400">
                                      進捗
                                    </span>
                                    <span className="font-medium text-gray-900 dark:text-white">
                                      {course.progress || 0}%
                                    </span>
                                  </div>
                                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                                    <div
                                      className={`h-3 rounded-full transition-all duration-300 ${
                                        course.progress === 100
                                          ? "bg-green-500"
                                          : "bg-blue-500"
                                      }`}
                                      style={{
                                        width: `${course.progress || 0}%`,
                                      }}
                                    />
                                  </div>
                                </div>
                              )}

                              <div className="flex items-center justify-between">
                                <span className="text-blue-600 hover:text-blue-700 font-medium text-sm">
                                  {course.status === "in_progress"
                                    ? "学習を続ける →"
                                    : course.status === "completed"
                                      ? "復習する →"
                                      : "学習を始める →"}
                                </span>
                              </div>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-4 sm:space-y-8">
                {/* Learning Progress */}
                <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-4 sm:p-6">
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
                    学習進捗ステータス
                  </h3>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        割り当てコース数
                      </span>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">
                        {stats?.totalCourses || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        完了コース
                      </span>
                      <span className="text-sm font-bold text-green-600">
                        {stats?.completedCourses || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        受講中コース
                      </span>
                      <span className="text-sm font-bold text-blue-600">
                        {stats?.inProgressCourses || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        未開始コース
                      </span>
                      <span className="text-sm font-bold text-gray-500 dark:text-gray-400">
                        {stats?.notStartedCourses || 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        総学習時間
                      </span>
                      <span className="text-sm font-bold text-purple-600">
                        {formatWatchTime(stats?.totalWatchTime || 0)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      最近のアクティビティ
                    </h3>
                  </div>
                  <div className="space-y-4">
                    {stats?.recentActivity.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          アクティビティがありません
                        </p>
                        <Link
                          href="/my-courses"
                          className="text-sm text-blue-600 hover:text-blue-700"
                        >
                          コースを始める
                        </Link>
                      </div>
                    ) : (
                      stats?.recentActivity
                        .slice(0, 5)
                        .map((activity, index) => (
                          <div
                            key={index}
                            className="flex items-start space-x-3"
                          >
                            <div
                              className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${
                                activity.status === "completed"
                                  ? "bg-green-500"
                                  : activity.progress > 50
                                    ? "bg-blue-500"
                                    : "bg-gray-400"
                              }`}
                            ></div>
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-white">
                                {activity.videos?.title || "動画学習"}
                              </div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">
                                {new Date(
                                  activity.last_updated,
                                ).toLocaleDateString("ja-JP")}
                              </div>
                              <div className="text-xs text-gray-600 dark:text-gray-400">
                                進捗: {activity.progress != null && !isNaN(activity.progress)
                                  ? `${Math.round(activity.progress)}%`
                                  : '0%'}
                              </div>
                            </div>
                          </div>
                        ))
                    )}
                  </div>
                </div>

                {/* Certificates */}
                {stats?.totalCertificates > 0 && (
                  <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900 dark:text-white">
                        取得証明書
                      </h3>
                      <Link
                        href="/certificates"
                        className="text-sm text-blue-600 hover:text-blue-700"
                      >
                        すべて見る
                      </Link>
                    </div>
                    <div className="flex items-center">
                      <TrophyIcon className="h-5 w-5 text-yellow-500 mr-2" />
                      <div className="flex-1">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                          {stats.totalCertificates}件の証明書を取得
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          おめでとうございます！
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </MainLayout>
    </AuthGuard>
  );
}
