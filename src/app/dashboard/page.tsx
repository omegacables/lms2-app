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
import ProgressCards from "@/components/dashboard/ProgressCards";
import {
  PlayIcon,
  BookOpenIcon,
  AcademicCapIcon,
  TrophyIcon,
  ClockIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  CheckCircleIcon,
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
        .from("user_course_assignments")
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

      const validAssignedCourses = assignedCourses.filter(Boolean) as any[];

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
      });
    } catch (error) {
      console.error("ダッシュボード統計取得エラー:", error);
    } finally {
      setLoading(false);
    }
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
            {/* Header */}
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                ダッシュボード
              </h1>
              <p className="text-gray-600 dark:text-gray-400">
                学習を続けましょう
              </p>
            </div>

            {/* Progress Cards */}
            <div className="mb-8">
              <ProgressCards />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-8">
                {/* Current Course */}
                {stats?.currentCourse ? (
                  <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-8 text-white">
                    <div className="flex items-start justify-between mb-6">
                      <div className="flex-1">
                        <h2 className="text-2xl font-bold mb-2">
                          {stats.currentCourse.title || "コース名未設定"}
                        </h2>
                        <p className="text-blue-100 mb-4 line-clamp-3">
                          {stats.currentCourse.description || "説明なし"}
                        </p>
                        <div className="flex items-center space-x-4 text-sm text-blue-100">
                          <span className="flex items-center">
                            <ClockIcon className="h-4 w-4 mr-1" />
                            {formatWatchTime(stats.totalWatchTime)}
                          </span>
                          {stats.currentCourse.nextVideo && (
                            <span className="flex items-center">
                              <AcademicCapIcon className="h-4 w-4 mr-1" />
                              次: {stats.currentCourse.nextVideo}
                            </span>
                          )}
                          <span className="flex items-center">
                            <ChartBarIcon className="h-4 w-4 mr-1" />
                            {stats.currentCourse.progress}%
                          </span>
                        </div>
                      </div>
                      <div className="ml-6">
                        <div className="w-24 h-24 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center">
                          <BookOpenIcon className="h-12 w-12 text-white" />
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="mb-6">
                      <div className="flex justify-between text-sm mb-2">
                        <span>コース進捗</span>
                        <span>{stats.currentCourse.progress}%</span>
                      </div>
                      <div className="bg-blue-50 dark:bg-blue-900/30 rounded-full h-3">
                        <div
                          className="bg-green-400 dark:bg-green-500 rounded-full h-3 transition-all duration-300"
                          style={{ width: `${stats.currentCourse.progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex space-x-4">
                      <Link
                        href={`/courses/${stats.currentCourse.id}`}
                        className="flex items-center px-6 py-3 bg-white dark:bg-gray-700 text-blue-600 dark:text-blue-400 rounded-xl font-semibold hover:bg-blue-50 dark:hover:bg-gray-600 transition-colors"
                      >
                        <PlayIcon className="h-5 w-5 mr-2" />
                        学習を続ける
                      </Link>
                      <button className="px-6 py-3 border border-blue-300 text-white rounded-xl font-semibold hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                        コース詳細
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Assigned Courses */}
                {stats?.assignedCourses && stats.assignedCourses.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
                        割り当てられたコース
                      </h3>
                      <Link
                        href="/my-courses"
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        すべて見る
                      </Link>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {stats.assignedCourses.map((course) => (
                        <Link
                          key={course.id}
                          href={`/courses/${course.id}`}
                          className="block"
                        >
                          <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 overflow-hidden hover:shadow-lg dark:hover:shadow-gray-900/50 transition-shadow cursor-pointer">
                            {course.thumbnail_url ? (
                              <div className="h-48 relative">
                                <img
                                  src={course.thumbnail_url}
                                  alt={course.title || "コース画像"}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            ) : (
                              <div className="h-48 bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/30 dark:to-purple-900/30 flex items-center justify-center">
                                <BookOpenIcon className="h-16 w-16 text-blue-400 dark:text-blue-500" />
                              </div>
                            )}
                            <div className="p-6">
                              <div className="flex items-start justify-between mb-3">
                                <h4 className="font-semibold text-gray-900 dark:text-white flex-1 line-clamp-2">
                                  {course.title || "コース名未設定"}
                                </h4>
                                <span
                                  className={`px-2 py-1 rounded-full text-xs font-medium ml-2 ${
                                    (course.difficulty_level || "") ===
                                    "beginner"
                                      ? "bg-green-100 text-green-800"
                                      : (course.difficulty_level || "") ===
                                          "intermediate"
                                        ? "bg-yellow-100 text-yellow-800"
                                        : "bg-red-100 text-red-800"
                                  }`}
                                >
                                  {(course.difficulty_level || "") ===
                                  "beginner"
                                    ? "初級"
                                    : (course.difficulty_level || "") ===
                                        "intermediate"
                                      ? "中級"
                                      : "上級"}
                                </span>
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
              <div className="space-y-8">
                {/* Learning Progress */}
                <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
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
                <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-neutral-800 p-6">
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
