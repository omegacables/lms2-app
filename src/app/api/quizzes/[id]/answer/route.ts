import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/getUser';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { computeGateState } from '@/lib/quiz/gating';
import { claimChoiceSet, displayPositionOfPattern, releaseChoiceSet } from '@/lib/quiz/choiceSets';

export const runtime = 'nodejs';

// POST /api/quizzes/[id]/answer
// body: { access_token?, choice_set_id?, answers: [{ question_id, selected_index }] }
// 選択式小テストの採点をサーバー側で行い、attempt を追記。不正解には解説を返す。
// 回答文生成（answer_style='generated'）では selected_index は「表示位置」。
// choice_set_id の提示セットでパターンに変換し、選んだ回答文を answer_text に保存する。
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
    .select('id, course_id, quiz_type, grading_mode, answer_style, status')
    .eq('id', quizId)
    .single();
  if (!quiz || quiz.status !== 'published') {
    return NextResponse.json({ error: 'クイズが見つかりません' }, { status: 404 });
  }
  if (quiz.quiz_type !== 'choice') {
    return NextResponse.json({ error: 'このエンドポイントは選択式小テスト専用です' }, { status: 400 });
  }
  // 提出制（添削）の選択式テストは即時採点しない。/submit へ回す。
  if (quiz.grading_mode === 'review') {
    return NextResponse.json(
      { error: 'このテストは提出後に指導者が添削します。提出用APIを利用してください', review_required: true },
      { status: 400 }
    );
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
  const results: {
    question_id: number;
    is_correct: boolean;
    correct_index?: number | null;
    correct_text?: string | null;
    explanation?: string | null;
  }[] = [];

  const validAnswers = answers.filter((a) => questionMap.has(Number(a.question_id)));
  if (validAnswers.length === 0) {
    return NextResponse.json({ error: '有効な回答がありません' }, { status: 400 });
  }

  const generated = quiz.answer_style === 'generated';
  let choiceSetId: string | null = null;

  if (generated) {
    // 表示位置 → 回答パターンに変換（提示セットは使用済みにする）
    const claim = await claimChoiceSet(admin, user.id, quizId, String(body.choice_set_id || ''), validAnswers);
    if (!claim.ok) return NextResponse.json({ error: claim.error }, { status: claim.status });
    choiceSetId = String(body.choice_set_id);

    for (const sel of claim.selections) {
      const q = questionMap.get(sel.question_id)!;
      const isCorrect = sel.pattern_index === q.correct_index;
      rows.push({
        user_id: user.id,
        quiz_id: quizId,
        question_id: sel.question_id,
        selected_index: sel.pattern_index,
        answer_text: sel.text,
        is_correct: isCorrect,
        attempt_no: (maxAttempt.get(sel.question_id) || 0) + 1,
        choice_set_id: choiceSetId,
        answered_at: now,
      });
      const correctPos =
        q.correct_index === null || q.correct_index === undefined
          ? null
          : displayPositionOfPattern(claim.options, sel.question_id, q.correct_index);
      results.push({
        question_id: sel.question_id,
        is_correct: isCorrect,
        // 不正解時のみ、正しかった回答文（表示位置と文章）と解説を返す
        correct_index: isCorrect ? undefined : correctPos,
        correct_text: isCorrect || correctPos === null ? undefined : claim.options[String(sel.question_id)][correctPos].text,
        explanation: isCorrect ? undefined : q.explanation,
      });
    }
  } else {
    for (const ans of validAnswers) {
      const q = questionMap.get(Number(ans.question_id))!;
      const choicesLen = Array.isArray(q.choices) ? q.choices.length : 0;
      const sel = Number(ans.selected_index);
      if (!Number.isInteger(sel) || sel < 0 || sel >= choicesLen) {
        return NextResponse.json({ error: `設問${ans.question_id}の選択が不正です` }, { status: 400 });
      }
      const isCorrect = sel === q.correct_index;
      rows.push({
        user_id: user.id,
        quiz_id: quizId,
        question_id: q.id,
        selected_index: sel,
        is_correct: isCorrect,
        attempt_no: (maxAttempt.get(q.id) || 0) + 1,
        answered_at: now,
      });
      results.push({
        question_id: q.id,
        is_correct: isCorrect,
        // 不正解時のみ正答・解説を返す
        correct_index: isCorrect ? undefined : q.correct_index,
        explanation: isCorrect ? undefined : q.explanation,
      });
    }
  }

  const { error: insErr } = await admin.from('quiz_attempts').insert(rows);
  if (insErr) {
    if (choiceSetId) await releaseChoiceSet(admin, choiceSetId);
    return NextResponse.json({ error: '回答の保存に失敗しました', details: insErr.message }, { status: 500 });
  }

  // 通過状況を再計算（このクイズが全問正解になったか）
  const postState = await computeGateState(admin, user.id, quiz.course_id);
  const passed = !!postState.quizPassed[quizId];

  return NextResponse.json({ results, passed });
}
