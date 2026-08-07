import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { requireLaborConsultant } from '@/lib/auth/requireLaborConsultant';

const COMPLETION_THRESHOLD = 90;

/**
 * 社労士の担当生徒一覧と各生徒のコース進捗を返す。
 * RLS の影響を受けないよう service role で取得する。
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireLaborConsultant(request);
    if (!auth.ok) return auth.response;

    const adminClient = createAdminSupabaseClient();

    // 1. 担当会社を取得
    const { data: companiesData, error: companiesError } = await adminClient
      .from('labor_consultant_companies')
      .select('company')
      .eq('labor_consultant_id', auth.user.id);

    if (companiesError) {
      console.error('[Labor Consultant Students] companies error:', companiesError);
      return NextResponse.json(
        { error: '担当会社の取得に失敗しました', details: companiesError.message },
        { status: 500 }
      );
    }

    const companies = (companiesData ?? []).map(c => c.company);
    if (companies.length === 0) {
      return NextResponse.json({ assignedCompanies: [], students: [] });
    }

    // 2. 担当会社の生徒一覧を取得
    const { data: studentsData, error: studentsError } = await adminClient
      .from('user_profiles')
      .select('id, display_name, company, department, is_active')
      .in('company', companies)
      .eq('is_active', true)
      .order('display_name', { ascending: true });

    if (studentsError) {
      console.error('[Labor Consultant Students] students error:', studentsError);
      return NextResponse.json(
        { error: '生徒一覧の取得に失敗しました', details: studentsError.message },
        { status: 500 }
      );
    }

    const students = studentsData ?? [];
    if (students.length === 0) {
      return NextResponse.json({ assignedCompanies: companies, students: [] });
    }

    // 3. auth.users から email を取得（user_profiles に email が無いスキーマ対応）
    const emailById = new Map<string, string | null>();
    try {
      // listUsers はページング、まとめて取得
      let page = 1;
      const perPage = 200;
      while (page <= 10) {
        const { data: usersPage } = await adminClient.auth.admin.listUsers({ page, perPage });
        if (!usersPage?.users || usersPage.users.length === 0) break;
        for (const u of usersPage.users) {
          if (u.id && u.email) emailById.set(u.id, u.email);
        }
        if (usersPage.users.length < perPage) break;
        page++;
      }
    } catch (e) {
      console.warn('[Labor Consultant Students] listUsers warning:', e);
    }

    const studentIds = students.map(s => s.id);

    // 4. 全員の user_courses を一括取得
    const { data: assignmentsData, error: assignmentsError } = await adminClient
      .from('user_courses')
      .select('user_id, course_id')
      .in('user_id', studentIds);

    if (assignmentsError) {
      console.error('[Labor Consultant Students] user_courses query error:', assignmentsError);
      return NextResponse.json(
        {
          error: 'コース割り当ての取得に失敗しました',
          details: assignmentsError.message,
          code: assignmentsError.code,
          hint: assignmentsError.hint,
        },
        { status: 500 }
      );
    }

    console.log('[Labor Consultant Students] Stats:', {
      consultant_id: auth.user.id,
      assignedCompanies: companies,
      studentCount: students.length,
      studentIdsSample: studentIds.slice(0, 3),
      assignmentRowsFound: assignmentsData?.length ?? 0,
    });

    const assignmentsByUser = new Map<string, number[]>();
    (assignmentsData ?? []).forEach(a => {
      if (!assignmentsByUser.has(a.user_id)) assignmentsByUser.set(a.user_id, []);
      assignmentsByUser.get(a.user_id)!.push(a.course_id);
    });

    // 5. 割り当てられたコースの ID 一覧を取得 → コース情報と動画数を一括取得
    const allCourseIds = Array.from(
      new Set((assignmentsData ?? []).map(a => a.course_id))
    );

    type CourseInfo = { id: number; title: string };
    const courseById = new Map<number, CourseInfo>();
    if (allCourseIds.length > 0) {
      const { data: coursesData } = await adminClient
        .from('courses')
        .select('id, title')
        .in('id', allCourseIds);
      (coursesData ?? []).forEach(c => courseById.set(c.id, c));
    }

    // 6. 各コースの動画数を一括取得（status='active'のみを進捗の分母にする）
    const videoCountByCourse = new Map<number, number>();
    const videoIdsByCourse = new Map<number, number[]>();
    if (allCourseIds.length > 0) {
      const { data: videosData } = await adminClient
        .from('videos')
        .select('id, course_id, status')
        .in('course_id', allCourseIds);
      (videosData ?? []).forEach(v => {
        // 非公開動画は進捗計算から除外
        if (v.status && v.status !== 'active') return;
        videoCountByCourse.set(v.course_id, (videoCountByCourse.get(v.course_id) ?? 0) + 1);
        if (!videoIdsByCourse.has(v.course_id)) videoIdsByCourse.set(v.course_id, []);
        videoIdsByCourse.get(v.course_id)!.push(v.id);
      });
    }

    // 7. 視聴ログを一括取得（全担当生徒 × 全動画）
    //    Supabase はデフォルトで1リクエスト1000行までしか返さないため、ページネーション
    const allVideoIds = Array.from(
      new Set(Array.from(videoIdsByCourse.values()).flat())
    );

    type ViewLogRow = {
      user_id: string;
      video_id: number;
      progress_percent: number | null;
      status: string | null;
      last_updated: string | null;
      created_at: string | null;
    };
    let viewLogs: ViewLogRow[] = [];
    if (allVideoIds.length > 0) {
      const pageSize = 1000;
      let offset = 0;
      const maxIterations = 100;
      for (let i = 0; i < maxIterations; i++) {
        const { data: pageData, error: pageError } = await adminClient
          .from('video_view_logs')
          .select('user_id, video_id, progress_percent, status, last_updated, created_at')
          .in('user_id', studentIds)
          .in('video_id', allVideoIds)
          .range(offset, offset + pageSize - 1);

        if (pageError) {
          console.error('[Labor Consultant Students] view_logs page error:', pageError);
          break;
        }
        if (!pageData || pageData.length === 0) break;

        viewLogs = viewLogs.concat(pageData);
        if (pageData.length < pageSize) break;
        offset += pageSize;
      }
    }

    // 🎯 (user_id, video_id) ごとに最新ログだけを採用（生徒画面と同じロジック）
    //    - last_updated（無ければ created_at）で最新を判定
    //    - 最新ログの status='completed' か progress_percent>=THRESHOLD を完了とみなす
    //    - 最新ログの progress_percent を「その動画の進捗」として保持
    type LatestLog = { progressPercent: number; isCompleted: boolean };
    const latestByKey = new Map<string, { time: number; row: ViewLogRow }>();
    viewLogs.forEach(log => {
      const key = `${log.user_id}-${log.video_id}`;
      const t = new Date(log.last_updated ?? log.created_at ?? 0).getTime();
      const existing = latestByKey.get(key);
      if (!existing || t > existing.time) {
        latestByKey.set(key, { time: t, row: log });
      }
    });

    const latestLogMap = new Map<string, LatestLog>();
    latestByKey.forEach(({ row }, key) => {
      const pct = row.progress_percent ?? 0;
      const isCompleted = row.status === 'completed' || pct >= COMPLETION_THRESHOLD;
      latestLogMap.set(key, { progressPercent: pct, isCompleted });
    });

    // 8. 各生徒のコース進捗を組み立てる
    const studentProgress = students.map(student => {
      const assignedCourseIds = assignmentsByUser.get(student.id) ?? [];

      if (assignedCourseIds.length === 0) {
        return {
          id: student.id,
          display_name: student.display_name,
          email: emailById.get(student.id) ?? '',
          company: student.company || '未設定',
          department: student.department || '未設定',
          assignedCourses: [],
          totalCourses: 0,
          completedCourses: 0,
          inProgressCourses: 0,
          notStartedCourses: 0,
          overallProgress: 0,
        };
      }

      const courseProgressList = assignedCourseIds
        .map(courseId => {
          const course = courseById.get(courseId);
          if (!course) return null;

          const videosInCourse = videoIdsByCourse.get(courseId) ?? [];
          const totalVideos = videosInCourse.length;

          // 🎯 各動画の最新ログから完了数と平均進捗を計算（生徒画面と同ロジック）
          let completedVideos = 0;
          let sumProgress = 0;
          for (const vid of videosInCourse) {
            const latest = latestLogMap.get(`${student.id}-${vid}`);
            if (latest) {
              if (latest.isCompleted) completedVideos++;
              sumProgress += latest.isCompleted ? 100 : latest.progressPercent;
            }
          }

          // コース進捗 = 各動画の最新進捗の平均（未視聴動画は 0 として扱う）
          const progress =
            totalVideos === 0 ? 0 : Math.round(sumProgress / totalVideos);

          let status: 'completed' | 'in_progress' | 'not_started' = 'not_started';
          if (totalVideos > 0 && completedVideos === totalVideos) status = 'completed';
          else if (sumProgress > 0) status = 'in_progress';

          return {
            courseId,
            courseTitle: course.title,
            totalVideos,
            completedVideos,
            progress,
            status,
          };
        })
        .filter(Boolean) as Array<{
          courseId: number;
          courseTitle: string;
          totalVideos: number;
          completedVideos: number;
          progress: number;
          status: 'completed' | 'in_progress' | 'not_started';
        }>;

      const completedCount = courseProgressList.filter(c => c.status === 'completed').length;
      const inProgressCount = courseProgressList.filter(c => c.status === 'in_progress').length;
      const notStartedCount = courseProgressList.filter(c => c.status === 'not_started').length;
      const overallProgress =
        courseProgressList.length === 0
          ? 0
          : Math.round(
              courseProgressList.reduce((s, c) => s + c.progress, 0) / courseProgressList.length
            );

      return {
        id: student.id,
        display_name: student.display_name,
        email: emailById.get(student.id) ?? '',
        company: student.company || '未設定',
        department: student.department || '未設定',
        assignedCourses: courseProgressList,
        totalCourses: courseProgressList.length,
        completedCourses: completedCount,
        inProgressCourses: inProgressCount,
        notStartedCourses: notStartedCount,
        overallProgress,
      };
    });

    return NextResponse.json({
      assignedCompanies: companies,
      students: studentProgress,
      _debug: {
        consultantId: auth.user.id,
        companiesCount: companies.length,
        studentsCount: students.length,
        assignmentRowsTotal: assignmentsData?.length ?? 0,
        coursesFound: courseById.size,
        videosFound: videoCountByCourse.size,
        viewLogsCount: viewLogs.length, // 1000 で頭打ちにならなければ修正 OK
        usersInListUsers: emailById.size,
      },
    });
  } catch (error) {
    console.error('[Labor Consultant Students] unexpected error:', error);
    return NextResponse.json(
      {
        error: '担当生徒一覧の取得に失敗しました',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
