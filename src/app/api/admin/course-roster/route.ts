import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { computeGateState } from '@/lib/quiz/gating';

export const runtime = 'nodejs';

// GET /api/admin/course-roster?courseId=
// 労働局提出用の受講一覧（受講者ごとの標準学習時間・受講時間合計・修了日・テスト通過状況）。
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor', 'labor_consultant']);
  if (!auth.ok) return auth.response;

  const courseIdRaw = request.nextUrl.searchParams.get('courseId');
  if (!courseIdRaw) return NextResponse.json({ error: 'courseId が必要です' }, { status: 400 });
  const courseId = Number(courseIdRaw);
  const admin = createAdminSupabaseClient();

  const { data: course } = await admin
    .from('courses')
    .select('id, title, standard_learning_minutes, standard_learning_period, training_type_note, test_required')
    .eq('id', courseId)
    .single();
  if (!course) return NextResponse.json({ error: 'コースが見つかりません' }, { status: 404 });

  // 受講者
  const { data: ucs } = await admin
    .from('user_courses')
    .select('user_id, assigned_at')
    .eq('course_id', courseId);
  const userIds = (ucs || []).map((u) => u.user_id);
  if (userIds.length === 0) return NextResponse.json({ course, rows: [] });

  const { data: profiles } = await admin
    .from('user_profiles')
    .select('id, display_name, email, company, department')
    .in('id', userIds);
  const profileMap = new Map((profiles || []).map((p) => [p.id, p]));

  // 動画
  const { data: videos } = await admin
    .from('videos')
    .select('id, file_url, status')
    .eq('course_id', courseId)
    .eq('status', 'active')
    .not('file_url', 'is', null);
  const activeVideoIds = (videos || []).filter((v) => v.file_url).map((v) => v.id);
  const totalVideos = activeVideoIds.length;

  // 全ログ
  const { data: logs } = await admin
    .from('video_view_logs')
    .select('user_id, video_id, total_watched_time, status')
    .eq('course_id', courseId);

  // 証明書
  const { data: certs } = await admin
    .from('certificates')
    .select('user_id, completion_date')
    .eq('course_id', courseId);
  const certMap = new Map((certs || []).map((c) => [c.user_id, c.completion_date]));

  const rows: any[] = [];
  for (const uc of ucs || []) {
    const uid = uc.user_id;
    const p = profileMap.get(uid);
    const ulogs = (logs || []).filter((l) => l.user_id === uid);

    // 動画ごとの最大視聴秒数の合計
    let watched = 0;
    const completedSet = new Set<number>();
    const perVideoMax = new Map<number, number>();
    for (const l of ulogs) {
      perVideoMax.set(l.video_id, Math.max(perVideoMax.get(l.video_id) || 0, l.total_watched_time || 0));
      if (l.status === 'completed') completedSet.add(l.video_id);
    }
    perVideoMax.forEach((v) => (watched += v));
    const completedVideos = Array.from(completedSet).filter((id) => activeVideoIds.includes(id)).length;

    let testsPassed: boolean | null = null;
    if (course.test_required) {
      const gate = await computeGateState(admin, uid, courseId);
      testsPassed = gate.allPassed;
    }

    rows.push({
      user_id: uid,
      name: p?.display_name || p?.email || uid,
      company: p?.company || '',
      department: p?.department || '',
      assigned_at: uc.assigned_at,
      standard_learning_minutes: course.standard_learning_minutes,
      total_watched_seconds: watched,
      completed_videos: completedVideos,
      total_videos: totalVideos,
      video_complete: totalVideos > 0 && completedVideos >= totalVideos,
      tests_passed: testsPassed,
      completion_date: certMap.get(uid) || null,
    });
  }

  rows.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ja'));

  return NextResponse.json({ course, rows });
}
