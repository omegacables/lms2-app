import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/getUser';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { computeGateState } from '@/lib/quiz/gating';
import { notifyUsers, getStaffUserIds } from '@/lib/notify';

export const runtime = 'nodejs';

// POST /api/quizzes/[id]/submit-essay
// body: { access_token?, answers: [{ question_id, answer_text }] }
// 記述式最終テストの提出。追記のみ。提出後は編集不可（添削中／合格済みは再提出不可）。
// 「要再提出」返却後のみ再提出可能（attempt_no を増やして新規行を追加）。
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const body = await request.json().catch(() => ({}));
  const { user, response } = await getAuthUser(request, body.access_token);
  if (!user) return response!;

  const { id } = await params;
  const quizId = Number(id);
  const admin = createAdminSupabaseClient();

  const { data: quiz } = await admin
    .from('quizzes')
    .select('id, course_id, title, quiz_type, status')
    .eq('id', quizId)
    .single();
  if (!quiz || quiz.status !== 'published' || quiz.quiz_type !== 'essay') {
    return NextResponse.json({ error: '記述式テストが見つかりません' }, { status: 404 });
  }

  // ゲート判定（全動画＋全小テスト通過後のみ受験可）
  const state = await computeGateState(admin, user.id, quiz.course_id);
  const gate = state.quizUnlocked[quizId];
  if (gate && !gate.unlocked) {
    return NextResponse.json(
      { error: `このテストはまだ受けられません。先に${gate.reason || '前のステップ'}を完了してください。`, locked: true },
      { status: 403 }
    );
  }

  // 現在の提出・添削状態を確認
  const { data: attempts } = await admin
    .from('quiz_attempts')
    .select('question_id, attempt_no')
    .eq('quiz_id', quizId)
    .eq('user_id', user.id);
  const hasSubmission = (attempts || []).length > 0;

  const { data: reviews } = await admin
    .from('essay_reviews')
    .select('result, reviewed_at')
    .eq('quiz_id', quizId)
    .eq('user_id', user.id)
    .order('reviewed_at', { ascending: false });
  const latestReview = reviews && reviews.length > 0 ? reviews[0] : null;

  if (hasSubmission) {
    if (!latestReview) {
      return NextResponse.json({ error: '添削中のため再提出できません' }, { status: 409 });
    }
    if (latestReview.result === 'passed') {
      return NextResponse.json({ error: 'このテストは合格済みです' }, { status: 409 });
    }
    // needs_revision の場合のみ再提出を許可
  }

  const answers: { question_id: number; answer_text: string }[] = Array.isArray(body.answers) ? body.answers : [];
  if (answers.length === 0) {
    return NextResponse.json({ error: '回答がありません' }, { status: 400 });
  }

  // 設問の存在確認
  const { data: questions } = await admin
    .from('quiz_questions')
    .select('id')
    .eq('quiz_id', quizId);
  const validIds = new Set((questions || []).map((q) => q.id));

  // 新しい attempt_no（設問ごとの最大＋1。全設問で揃える）
  const maxAttempt = new Map<number, number>();
  (attempts || []).forEach((a) => {
    maxAttempt.set(a.question_id, Math.max(maxAttempt.get(a.question_id) || 0, a.attempt_no));
  });
  const nextAttempt = Math.max(0, ...Array.from(maxAttempt.values())) + 1;

  const now = new Date().toISOString();
  const rows = answers
    .filter((a) => validIds.has(a.question_id) && (a.answer_text || '').trim() !== '')
    .map((a) => ({
      user_id: user.id,
      quiz_id: quizId,
      question_id: a.question_id,
      answer_text: String(a.answer_text),
      is_correct: null,
      attempt_no: nextAttempt,
      answered_at: now,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ error: '有効な回答がありません' }, { status: 400 });
  }

  const { error: insErr } = await admin.from('quiz_attempts').insert(rows);
  if (insErr) {
    return NextResponse.json({ error: '提出に失敗しました', details: insErr.message }, { status: 500 });
  }

  // 指導者へ通知
  const { data: profile } = await admin
    .from('user_profiles')
    .select('display_name, email')
    .eq('id', user.id)
    .single();
  const studentName = profile?.display_name || profile?.email || '受講者';
  const staffIds = await getStaffUserIds(admin);
  await notifyUsers(admin, staffIds, {
    title: '記述式テストの提出がありました',
    message: `${studentName} さんが「${quiz.title}」を提出しました。添削をお願いします。`,
    type: 'essay_submission',
    related_type: 'quiz',
    related_id: quizId,
  });

  return NextResponse.json({ success: true });
}
