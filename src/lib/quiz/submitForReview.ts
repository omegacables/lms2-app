// 提出制テスト（記述式／選択式 grading_mode='review'）の提出処理。
// 記述式・選択式で共通のため Route Handler から切り出している。
//
// 方針:
//  * quiz_attempts は追記のみ。再提出は attempt_no を増やして新規行を追加する。
//  * 選択式でもここでは採点しない（is_correct は NULL のまま）。添削は提出後に自動で行う（autoFinalReview.ts）。
//  * 提出後は添削が返るまで再提出不可。'needs_revision' が返ったときのみ再提出できる。
//  * 回答文生成（answer_style='generated'）では selected_index は表示位置。提示セットでパターンに変換し、
//    選んだ回答文を answer_text に保存する。

import type { SupabaseClient } from '@supabase/supabase-js';
import { computeGateState } from '@/lib/quiz/gating';
import { notifyUsers, getStaffUserIds } from '@/lib/notify';
import { claimChoiceSet, releaseChoiceSet } from '@/lib/quiz/choiceSets';

export interface SubmitAnswerInput {
  question_id: number;
  answer_text?: string | null;
  selected_index?: number | null;
}

export interface SubmitOutcome {
  status: number;
  body: Record<string, unknown>;
}

export async function submitForReview(
  admin: SupabaseClient,
  userId: string,
  quizId: number,
  answers: SubmitAnswerInput[],
  choiceSetId?: string | null
): Promise<SubmitOutcome> {
  const { data: quiz } = await admin
    .from('quizzes')
    .select('id, course_id, title, quiz_type, grading_mode, answer_style, status')
    .eq('id', quizId)
    .single();

  const isReviewQuiz = !!quiz && (quiz.quiz_type === 'essay' || quiz.grading_mode === 'review');
  if (!quiz || quiz.status !== 'published' || !isReviewQuiz) {
    return { status: 404, body: { error: '提出対象のテストが見つかりません' } };
  }

  // ゲート判定（前のステップが未完了なら受験不可）
  const state = await computeGateState(admin, userId, quiz.course_id);
  const gate = state.quizUnlocked[quizId];
  if (gate && !gate.unlocked) {
    return {
      status: 403,
      body: {
        error: `このテストはまだ受けられません。先に${gate.reason || '前のステップ'}を完了してください。`,
        locked: true,
      },
    };
  }

  // 現在の提出・添削状態
  const { data: attempts } = await admin
    .from('quiz_attempts')
    .select('question_id, attempt_no')
    .eq('quiz_id', quizId)
    .eq('user_id', userId);
  const hasSubmission = (attempts || []).length > 0;

  const { data: reviews } = await admin
    .from('essay_reviews')
    .select('result, reviewed_at')
    .eq('quiz_id', quizId)
    .eq('user_id', userId)
    .order('reviewed_at', { ascending: false });
  const latestReview = reviews && reviews.length > 0 ? reviews[0] : null;

  if (hasSubmission) {
    if (!latestReview) {
      return { status: 409, body: { error: '添削中のため再提出できません' } };
    }
    if (latestReview.result === 'passed') {
      return { status: 409, body: { error: 'このテストは合格済みです' } };
    }
    // needs_revision の場合のみ再提出を許可
  }

  if (!Array.isArray(answers) || answers.length === 0) {
    return { status: 400, body: { error: '回答がありません' } };
  }

  // 設問（選択肢の範囲チェックに使う）
  const { data: questions } = await admin
    .from('quiz_questions')
    .select('id, choices')
    .eq('quiz_id', quizId);
  const questionMap = new Map((questions || []).map((q) => [q.id, q]));

  // 新しい attempt_no（設問ごとの最大＋1。全設問で揃える）
  const maxAttempt = new Map<number, number>();
  (attempts || []).forEach((a) => {
    maxAttempt.set(a.question_id, Math.max(maxAttempt.get(a.question_id) || 0, a.attempt_no));
  });
  const nextAttempt = Math.max(0, ...Array.from(maxAttempt.values())) + 1;

  const now = new Date().toISOString();
  const rows: Record<string, unknown>[] = [];

  const generated = quiz.quiz_type === 'choice' && quiz.answer_style === 'generated';
  let claimedSetId: string | null = null;

  if (generated) {
    const valid = answers
      .filter((a) => questionMap.has(Number(a.question_id)))
      .map((a) => ({ question_id: Number(a.question_id), selected_index: Number(a.selected_index) }));
    if (valid.length === 0) {
      return { status: 400, body: { error: '有効な回答がありません' } };
    }
    const claim = await claimChoiceSet(admin, userId, quizId, String(choiceSetId || ''), valid);
    if (!claim.ok) return { status: claim.status, body: { error: claim.error } };
    claimedSetId = String(choiceSetId);
    for (const sel of claim.selections) {
      rows.push({
        user_id: userId,
        quiz_id: quizId,
        question_id: sel.question_id,
        selected_index: sel.pattern_index,
        answer_text: sel.text, // 選んだ回答文そのもの
        is_correct: null, // 正誤は指導者の添削で確定する
        attempt_no: nextAttempt,
        choice_set_id: claimedSetId,
        answered_at: now,
      });
    }
  }

  for (const ans of generated ? [] : answers) {
    const q = questionMap.get(Number(ans.question_id));
    if (!q) continue;

    if (quiz.quiz_type === 'choice') {
      const choicesLen = Array.isArray(q.choices) ? q.choices.length : 0;
      const sel = Number(ans.selected_index);
      if (!Number.isInteger(sel) || sel < 0 || sel >= choicesLen) {
        return { status: 400, body: { error: `設問${ans.question_id}の選択が不正です` } };
      }
      rows.push({
        user_id: userId,
        quiz_id: quizId,
        question_id: q.id,
        selected_index: sel,
        answer_text: null,
        is_correct: null, // 正誤は指導者の添削で確定する
        attempt_no: nextAttempt,
        answered_at: now,
      });
    } else {
      const text = String(ans.answer_text ?? '');
      if (text.trim() === '') continue;
      rows.push({
        user_id: userId,
        quiz_id: quizId,
        question_id: q.id,
        selected_index: null,
        answer_text: text,
        is_correct: null,
        attempt_no: nextAttempt,
        answered_at: now,
      });
    }
  }

  if (rows.length === 0) {
    return { status: 400, body: { error: '有効な回答がありません' } };
  }

  const { error: insErr } = await admin.from('quiz_attempts').insert(rows);
  if (insErr) {
    if (claimedSetId) await releaseChoiceSet(admin, claimedSetId);
    return { status: 500, body: { error: '提出に失敗しました', details: insErr.message } };
  }

  // 指導者へ通知
  const { data: profile } = await admin
    .from('user_profiles')
    .select('display_name, email')
    .eq('id', userId)
    .single();
  const studentName = profile?.display_name || profile?.email || '受講者';
  const staffIds = await getStaffUserIds(admin);
  await notifyUsers(admin, staffIds, {
    title: 'テストの提出がありました',
    message: `${studentName} さんが「${quiz.title}」を提出しました。自動で添削して返却します（添削できなかった場合は添削画面から返却してください）。`,
    type: 'essay_submission',
    related_type: 'quiz',
    related_id: quizId,
  });

  return { status: 200, body: { success: true } };
}
