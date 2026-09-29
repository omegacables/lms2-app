import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/getUser';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { computeGateState } from '@/lib/quiz/gating';
import { getOrCreateChoiceSet, toStudentOptions } from '@/lib/quiz/choiceSets';

export const runtime = 'nodejs';

// GET /api/quizzes/[id]
// 受講者向け：クイズの設問（正答・解説は含まない）＋自分の回答履歴＋通過状況を返す。
// 正誤は受講者に見せない仕様のため、回答の is_correct・添削の設問ごとの正誤は返さない。
// ゲート未解放のクイズは 403。
//
// grading_mode='review'（提出→添削）の場合は、提出状態（submission_status）と
// 返却済みの添削（設問ごとの正誤・コメント・赤ペン）も返す。
//
// answer_style='generated'（回答文生成）の場合は、固定の choices の代わりに
// 受験ごとに生成した回答文 options と、その提示セットの choice_set_id を返す。
// options にはパターン番号を含めない（どれが正答か分からないようにする）。
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await getAuthUser(request);
  if (!user) return response!;

  const { id } = await params;
  const quizId = Number(id);
  const admin = createAdminSupabaseClient();

  const { data: quiz } = await admin
    .from('quizzes')
    .select('id, course_id, title, quiz_type, grading_mode, answer_style, status, after_video_id')
    .eq('id', quizId)
    .single();
  if (!quiz || quiz.status !== 'published') {
    return NextResponse.json({ error: 'クイズが見つかりません' }, { status: 404 });
  }

  // ゲート判定（解放されているか）
  const state = await computeGateState(admin, user.id, quiz.course_id);
  const gate = state.quizUnlocked[quizId];
  if (gate && !gate.unlocked) {
    return NextResponse.json(
      { error: `このテストはまだ受けられません。先に${gate.reason || '前のステップ'}を完了してください。`, locked: true },
      { status: 403 }
    );
  }

  // 設問（explanation は回答文生成にだけ使い、受講者には返さない）
  const { data: questions } = await admin
    .from('quiz_questions')
    .select('id, question_text, choices, explanation, sort_order')
    .eq('quiz_id', quizId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  const questionList = questions || [];

  // 自分の回答履歴（設問ごとに最新の attempt）
  const { data: attempts } = await admin
    .from('quiz_attempts')
    .select('question_id, selected_index, answer_text, attempt_no, answered_at')
    .eq('quiz_id', quizId)
    .eq('user_id', user.id)
    .order('answered_at', { ascending: false });

  const latestByQuestion = new Map<number, any>();
  (attempts || []).forEach((a) => {
    if (!latestByQuestion.has(a.question_id)) latestByQuestion.set(a.question_id, a);
  });
  // 回答済みの設問（小テストは正誤を問わず、回答すれば通過）
  const answeredQuestionIds = new Set<number>(latestByQuestion.keys());

  // 提出制（添削）テストの提出状態と最新の添削
  const reviewMode = quiz.quiz_type === 'essay' || quiz.grading_mode === 'review';
  let submissionStatus: 'not_submitted' | 'under_review' | 'needs_revision' | 'passed' = 'not_submitted';
  let review: Record<string, unknown> | null = null;

  if (reviewMode) {
    const { data: reviews } = await admin
      .from('essay_reviews')
      .select('result, review_comment, explanation, question_reviews, reviewed_at, reviewer_id')
      .eq('quiz_id', quizId)
      .eq('user_id', user.id)
      .order('reviewed_at', { ascending: false });
    const latestReview = reviews && reviews.length > 0 ? reviews[0] : null;
    const hasSubmission = (attempts || []).length > 0;

    if (!hasSubmission) submissionStatus = 'not_submitted';
    else if (!latestReview) submissionStatus = 'under_review';
    else if (latestReview.result === 'needs_revision') submissionStatus = 'needs_revision';
    else submissionStatus = 'passed';

    if (latestReview) {
      let reviewerName: string | null = null;
      if (latestReview.reviewer_id) {
        const { data: rp } = await admin
          .from('user_profiles')
          .select('display_name, email')
          .eq('id', latestReview.reviewer_id)
          .single();
        reviewerName = rp?.display_name || rp?.email || null;
      }
      review = {
        result: latestReview.result,
        comment: latestReview.review_comment,
        explanation: latestReview.explanation || null,
        // 設問ごとのコメント・赤ペンだけを返す（正誤は表示しない仕様）
        question_reviews: Array.isArray(latestReview.question_reviews)
          ? latestReview.question_reviews.map((r: any) => ({ ...r, is_correct: null }))
          : [],
        reviewed_at: latestReview.reviewed_at,
        reviewer_name: reviewerName,
      };
    }
  }

  const canSubmit = reviewMode && (submissionStatus === 'not_submitted' || submissionStatus === 'needs_revision');

  // 回答文生成：これから回答が必要な設問にだけ回答文を用意する
  //   提出制 … 提出できる状態のときは全設問
  //   小テスト … まだ回答していない設問
  const generated = quiz.quiz_type === 'choice' && quiz.answer_style === 'generated';
  let choiceSetId: string | null = null;
  let choiceOptions: Record<string, { pattern_index: number; text: string }[]> = {};

  if (generated) {
    const needing = questionList.filter((q) => (reviewMode ? canSubmit : !answeredQuestionIds.has(q.id)));
    if (needing.length > 0) {
      try {
        const set = await getOrCreateChoiceSet(
          admin,
          user.id,
          quizId,
          needing.map((q) => ({
            id: q.id,
            question_text: q.question_text,
            choices: Array.isArray(q.choices) ? (q.choices as string[]) : [],
            explanation: q.explanation,
          }))
        );
        choiceSetId = set.id;
        choiceOptions = set.options;
      } catch (e) {
        console.error('[quizzes GET] 回答文の準備に失敗:', e);
        return NextResponse.json({ error: '問題の準備に失敗しました。時間をおいて再読み込みしてください' }, { status: 500 });
      }
    }
  }

  return NextResponse.json({
    quiz: {
      id: quiz.id,
      course_id: quiz.course_id,
      title: quiz.title,
      quiz_type: quiz.quiz_type,
      grading_mode: quiz.grading_mode,
      answer_style: generated ? 'generated' : 'plain',
      after_video_id: quiz.after_video_id,
    },
    choice_set_id: choiceSetId,
    questions: questionList.map((q) => {
      const latest = latestByQuestion.get(q.id);
      return {
        id: q.id,
        question_text: q.question_text,
        // 固定表示の選択肢（回答文生成のときは空）
        choices: generated ? [] : Array.isArray(q.choices) ? q.choices : [],
        // 回答文生成のときの選択肢（表示順。key は表示位置）
        options: generated && choiceOptions[String(q.id)] ? toStudentOptions(choiceOptions, q.id) : null,
        sort_order: q.sort_order,
        // 回答済みか（solved は旧アプリ向けの同じ値）
        answered: answeredQuestionIds.has(q.id),
        solved: answeredQuestionIds.has(q.id),
        my_answer: latest
          ? {
              // 回答文生成ではパターン番号に意味がないので返さない（選んだ文章は answer_text）
              selected_index: generated ? null : latest.selected_index,
              answer_text: latest.answer_text,
              is_correct: null,
              attempt_no: latest.attempt_no,
              answered_at: latest.answered_at,
            }
          : null,
      };
    }),
    passed: !!state.quizPassed[quizId],
    // 提出制テストのみ意味を持つ
    review_mode: reviewMode,
    submission_status: submissionStatus,
    // 未提出 or 要再提出のときだけ回答を編集・提出できる
    can_submit: canSubmit,
    review,
  });
}
