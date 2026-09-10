import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/getUser';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { computeGateState } from '@/lib/quiz/gating';

export const runtime = 'nodejs';

// GET /api/quizzes/[id]
// 受講者向け：クイズの設問（正答・解説は含まない）＋自分の回答履歴＋通過状況を返す。
// ゲート未解放のクイズは 403。
//
// grading_mode='review'（提出→添削）の場合は、提出状態（submission_status）と
// 返却済みの添削（設問ごとの正誤・コメントを含む）も返す。
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
    .select('id, course_id, title, quiz_type, grading_mode, status, after_video_id')
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

  // 設問（安全なフィールドのみ）
  const { data: questions } = await admin
    .from('quiz_questions')
    .select('id, question_text, choices, sort_order')
    .eq('quiz_id', quizId)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });

  // 自分の回答履歴（設問ごとに最新の attempt）
  const { data: attempts } = await admin
    .from('quiz_attempts')
    .select('question_id, selected_index, answer_text, is_correct, attempt_no, answered_at')
    .eq('quiz_id', quizId)
    .eq('user_id', user.id)
    .order('answered_at', { ascending: false });

  const latestByQuestion = new Map<number, any>();
  (attempts || []).forEach((a) => {
    if (!latestByQuestion.has(a.question_id)) latestByQuestion.set(a.question_id, a);
  });

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
        question_reviews: Array.isArray(latestReview.question_reviews) ? latestReview.question_reviews : [],
        reviewed_at: latestReview.reviewed_at,
        reviewer_name: reviewerName,
      };
    }
  }

  return NextResponse.json({
    quiz: {
      id: quiz.id,
      course_id: quiz.course_id,
      title: quiz.title,
      quiz_type: quiz.quiz_type,
      grading_mode: quiz.grading_mode,
      after_video_id: quiz.after_video_id,
    },
    questions: (questions || []).map((q) => ({
      id: q.id,
      question_text: q.question_text,
      choices: Array.isArray(q.choices) ? q.choices : [],
      sort_order: q.sort_order,
      my_answer: latestByQuestion.get(q.id)
        ? {
            selected_index: latestByQuestion.get(q.id).selected_index,
            answer_text: latestByQuestion.get(q.id).answer_text,
            is_correct: latestByQuestion.get(q.id).is_correct,
            attempt_no: latestByQuestion.get(q.id).attempt_no,
            answered_at: latestByQuestion.get(q.id).answered_at,
          }
        : null,
    })),
    passed: !!state.quizPassed[quizId],
    // 提出制テストのみ意味を持つ
    review_mode: reviewMode,
    submission_status: submissionStatus,
    // 未提出 or 要再提出のときだけ回答を編集・提出できる
    can_submit: reviewMode && (submissionStatus === 'not_submitted' || submissionStatus === 'needs_revision'),
    review,
  });
}
