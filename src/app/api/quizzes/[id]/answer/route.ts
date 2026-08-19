import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/getUser';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { computeGateState } from '@/lib/quiz/gating';

export const runtime = 'nodejs';

// POST /api/quizzes/[id]/answer
// body: { access_token?, answers: [{ question_id, selected_index }] }
// 選択式小テストの採点をサーバー側で行い、attempt を追記。不正解には解説を返す。
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
    .select('id, course_id, quiz_type, status')
    .eq('id', quizId)
    .single();
  if (!quiz || quiz.status !== 'published') {
    return NextResponse.json({ error: 'クイズが見つかりません' }, { status: 404 });
  }
  if (quiz.quiz_type !== 'choice') {
    return NextResponse.json({ error: 'このエンドポイントは選択式小テスト専用です' }, { status: 400 });
  }

  // ゲート判定（未解放なら回答不可）
  const preState = await computeGateState(admin, user.id, quiz.course_id);
  const gate = preState.quizUnlocked[quizId];
  if (gate && !gate.unlocked) {
    return NextResponse.json(
      { error: `このテストはまだ受けられません。先に${gate.reason || '前のステップ'}を完了してください。`, locked: true },
      { status: 403 }
    );
  }

  const answers: { question_id: number; selected_index: number }[] = Array.isArray(body.answers) ? body.answers : [];
  if (answers.length === 0) {
    return NextResponse.json({ error: '回答がありません' }, { status: 400 });
  }

  // 設問（正答・解説を含む＝サーバー内でのみ使用）
  const { data: questions } = await admin
    .from('quiz_questions')
    .select('id, choices, correct_index, explanation')
    .eq('quiz_id', quizId);
  const questionMap = new Map((questions || []).map((q) => [q.id, q]));

  // 既存 attempt_no（設問ごとの最大）
  const { data: existing } = await admin
    .from('quiz_attempts')
    .select('question_id, attempt_no')
    .eq('quiz_id', quizId)
    .eq('user_id', user.id);
  const maxAttempt = new Map<number, number>();
  (existing || []).forEach((a) => {
    maxAttempt.set(a.question_id, Math.max(maxAttempt.get(a.question_id) || 0, a.attempt_no));
  });

  const now = new Date().toISOString();
  const rows: any[] = [];
  const results: { question_id: number; is_correct: boolean; correct_index?: number | null; explanation?: string | null }[] = [];

  for (const ans of answers) {
    const q = questionMap.get(ans.question_id);
    if (!q) continue;
    const choicesLen = Array.isArray(q.choices) ? q.choices.length : 0;
    const sel = Number(ans.selected_index);
    if (!Number.isInteger(sel) || sel < 0 || sel >= choicesLen) {
      return NextResponse.json({ error: `設問${ans.question_id}の選択が不正です` }, { status: 400 });
    }
    const isCorrect = sel === q.correct_index;
    rows.push({
      user_id: user.id,
      quiz_id: quizId,
      question_id: ans.question_id,
      selected_index: sel,
      is_correct: isCorrect,
      attempt_no: (maxAttempt.get(ans.question_id) || 0) + 1,
      answered_at: now,
    });
    results.push({
      question_id: ans.question_id,
      is_correct: isCorrect,
      // 不正解時のみ正答・解説を返す
      correct_index: isCorrect ? undefined : q.correct_index,
      explanation: isCorrect ? undefined : q.explanation,
    });
  }

  if (rows.length === 0) {
    return NextResponse.json({ error: '有効な回答がありません' }, { status: 400 });
  }

  const { error: insErr } = await admin.from('quiz_attempts').insert(rows);
  if (insErr) {
    return NextResponse.json({ error: '回答の保存に失敗しました', details: insErr.message }, { status: 500 });
  }

  // 通過状況を再計算（このクイズが全問正解になったか）
  const postState = await computeGateState(admin, user.id, quiz.course_id);
  const passed = !!postState.quizPassed[quizId];

  return NextResponse.json({ results, passed });
}
