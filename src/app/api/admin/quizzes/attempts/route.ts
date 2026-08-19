import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export const runtime = 'nodejs';

// GET /api/admin/quizzes/attempts?courseId=123[&userId=uuid]
// 受講者別の回答状況一覧（全 attempt 履歴・正誤・回答日時）を返す
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const courseId = request.nextUrl.searchParams.get('courseId');
  const userId = request.nextUrl.searchParams.get('userId');
  if (!courseId) {
    return NextResponse.json({ error: 'courseId が必要です' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // 1. コースのクイズ
  const { data: quizzes } = await admin
    .from('quizzes')
    .select('id, title, quiz_type')
    .eq('course_id', Number(courseId));
  const quizIds = (quizzes || []).map((q) => q.id);
  if (quizIds.length === 0) {
    return NextResponse.json({ attempts: [] });
  }
  const quizMap = new Map(quizzes!.map((q) => [q.id, q]));

  // 2. 回答（attempt）
  let attemptQuery = admin
    .from('quiz_attempts')
    .select('*')
    .in('quiz_id', quizIds)
    .order('answered_at', { ascending: true });
  if (userId) attemptQuery = attemptQuery.eq('user_id', userId);
  const { data: attempts, error } = await attemptQuery;
  if (error) {
    return NextResponse.json({ error: '回答の取得に失敗しました', details: error.message }, { status: 500 });
  }

  // 3. 設問（本文・選択肢）
  const { data: questions } = await admin
    .from('quiz_questions')
    .select('id, question_text, choices, correct_index')
    .in('quiz_id', quizIds);
  const questionMap = new Map((questions || []).map((q) => [q.id, q]));

  // 4. ユーザー情報
  const userIds = Array.from(new Set((attempts || []).map((a) => a.user_id)));
  const userMap = new Map<string, { display_name: string | null; email: string | null; company: string | null }>();
  if (userIds.length > 0) {
    const { data: users } = await admin
      .from('user_profiles')
      .select('id, display_name, email, company')
      .in('id', userIds);
    (users || []).forEach((u) => userMap.set(u.id, u));
  }

  const rows = (attempts || []).map((a) => {
    const q = questionMap.get(a.question_id);
    const quiz = quizMap.get(a.quiz_id);
    const user = userMap.get(a.user_id);
    const choices: string[] = Array.isArray(q?.choices) ? (q!.choices as string[]) : [];
    const selectedText =
      a.selected_index !== null && a.selected_index !== undefined
        ? choices[a.selected_index] ?? `選択肢${a.selected_index + 1}`
        : a.answer_text ?? '';
    return {
      id: a.id,
      user_id: a.user_id,
      user_name: user?.display_name || user?.email || a.user_id,
      company: user?.company || '',
      quiz_id: a.quiz_id,
      quiz_title: quiz?.title || '',
      quiz_type: quiz?.quiz_type || '',
      question_id: a.question_id,
      question_text: q?.question_text || '',
      selected_index: a.selected_index,
      selected_text: selectedText,
      answer_text: a.answer_text,
      is_correct: a.is_correct,
      attempt_no: a.attempt_no,
      answered_at: a.answered_at,
    };
  });

  return NextResponse.json({ attempts: rows });
}
