import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export const runtime = 'nodejs';

// GET /api/admin/quizzes?courseId=123
// コースのクイズ一覧（設問数付き）を返す
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const courseId = request.nextUrl.searchParams.get('courseId');
  if (!courseId) {
    return NextResponse.json({ error: 'courseId が必要です' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: quizzes, error } = await admin
    .from('quizzes')
    .select('*')
    .eq('course_id', Number(courseId))
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    console.error('[admin/quizzes GET] error:', error);
    return NextResponse.json({ error: 'クイズ一覧の取得に失敗しました', details: error.message }, { status: 500 });
  }

  // 各クイズの設問数を個別に取得（JOINを避ける方針）
  const withCounts = await Promise.all(
    (quizzes || []).map(async (q) => {
      const { count } = await admin
        .from('quiz_questions')
        .select('id', { count: 'exact', head: true })
        .eq('quiz_id', q.id);
      return { ...q, question_count: count || 0 };
    })
  );

  return NextResponse.json({ quizzes: withCounts });
}

// POST /api/admin/quizzes
// { course_id, title, quiz_type, after_video_id, sort_order, status }
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const body = await request.json();
  const { course_id, title, quiz_type, after_video_id, sort_order, status } = body;

  if (!course_id || !title) {
    return NextResponse.json({ error: 'course_id と title は必須です' }, { status: 400 });
  }
  if (quiz_type && !['choice', 'essay'].includes(quiz_type)) {
    return NextResponse.json({ error: 'quiz_type が不正です' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from('quizzes')
    .insert({
      course_id: Number(course_id),
      title: String(title).slice(0, 200),
      quiz_type: quiz_type || 'choice',
      after_video_id: after_video_id ? Number(after_video_id) : null,
      sort_order: Number.isFinite(sort_order) ? Number(sort_order) : 0,
      status: status === 'published' ? 'published' : 'draft',
      created_by: auth.user.id,
    })
    .select()
    .single();

  if (error) {
    console.error('[admin/quizzes POST] error:', error);
    return NextResponse.json({ error: 'クイズの作成に失敗しました', details: error.message }, { status: 500 });
  }

  return NextResponse.json({ quiz: data });
}
