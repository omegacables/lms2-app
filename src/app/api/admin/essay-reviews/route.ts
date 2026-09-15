import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { notifyUsers } from '@/lib/notify';
import { issueCertificateIfEligible } from '@/lib/certificate/issue';
import { normalizeMarkup } from '@/lib/quiz/redpen';

export const runtime = 'nodejs';

// 添削対象＝提出制テスト（記述式 quiz_type='essay' ／ 選択式 grading_mode='review'）
const REVIEW_TARGET_FILTER = 'quiz_type.eq.essay,grading_mode.eq.review';

// GET /api/admin/essay-reviews?status=pending|all
// 提出制テストの提出一覧（添削待ち／全件）を返す。
// 選択式（提出→添削）は、設問・選択肢・受講者が選んだ選択肢・正答（参考）も返す。
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const statusFilter = request.nextUrl.searchParams.get('status') || 'pending';
  const admin = createAdminSupabaseClient();

  const { data: quizzes } = await admin
    .from('quizzes')
    .select('id, course_id, title, quiz_type, grading_mode, answer_style')
    .eq('status', 'published')
    .or(REVIEW_TARGET_FILTER);
  if (!quizzes || quizzes.length === 0) return NextResponse.json({ submissions: [] });

  // コース名
  const courseIds = Array.from(new Set(quizzes.map((q) => q.course_id)));
  const { data: courses } = await admin.from('courses').select('id, title').in('id', courseIds);
  const courseMap = new Map((courses || []).map((c) => [c.id, c.title]));

  const submissions: any[] = [];

  for (const quiz of quizzes) {
    const isChoice = quiz.quiz_type === 'choice';

    const { data: questions } = await admin
      .from('quiz_questions')
      .select('id, question_text, choices, correct_index, explanation, sort_order')
      .eq('quiz_id', quiz.id)
      .order('sort_order', { ascending: true });

    const { data: attempts } = await admin
      .from('quiz_attempts')
      .select('user_id, question_id, answer_text, selected_index, attempt_no, answered_at')
      .eq('quiz_id', quiz.id)
      .order('answered_at', { ascending: false });
    if (!attempts || attempts.length === 0) continue;

    const { data: reviews } = await admin
      .from('essay_reviews')
      .select('user_id, result, review_comment, explanation, question_reviews, reviewed_at')
      .eq('quiz_id', quiz.id)
      .order('reviewed_at', { ascending: false });

    // ユーザーごとにまとめる
    const userIds = Array.from(new Set(attempts.map((a) => a.user_id)));
    const { data: users } = await admin
      .from('user_profiles')
      .select('id, display_name, email, company')
      .in('id', userIds);
    const userMap = new Map((users || []).map((u) => [u.id, u]));

    for (const uid of userIds) {
      const userAttempts = attempts.filter((a) => a.user_id === uid);
      // 設問ごとの最新回答
      const latestAnswer = new Map<number, any>();
      userAttempts.forEach((a) => { if (!latestAnswer.has(a.question_id)) latestAnswer.set(a.question_id, a); });
      const latestAttemptTime = userAttempts.reduce(
        (m, a) => (new Date(a.answered_at) > new Date(m) ? a.answered_at : m),
        userAttempts[0].answered_at
      );

      const userReviews = (reviews || []).filter((r) => r.user_id === uid);
      const latestReview = userReviews.length > 0 ? userReviews[0] : null;

      const pending = !latestReview || new Date(latestAttemptTime) > new Date(latestReview.reviewed_at);
      const status = pending ? 'pending' : latestReview!.result;

      if (statusFilter === 'pending' && !pending) continue;

      const u = userMap.get(uid);
      submissions.push({
        quiz_id: quiz.id,
        user_id: uid,
        student_name: u?.display_name || u?.email || uid,
        company: u?.company || '',
        course_id: quiz.course_id,
        course_title: courseMap.get(quiz.course_id) || '',
        quiz_title: quiz.title,
        quiz_type: quiz.quiz_type,
        grading_mode: quiz.grading_mode,
        answer_style: quiz.answer_style,
        submitted_at: latestAttemptTime,
        status, // 'pending' | 'passed' | 'needs_revision'
        questions: (questions || []).map((q) => {
          const choices: string[] = Array.isArray(q.choices) ? (q.choices as string[]) : [];
          const a = latestAnswer.get(q.id);
          const selectedIndex = a?.selected_index ?? null;
          return {
            id: q.id,
            question_text: q.question_text,
            answer_text: a?.answer_text ?? '',
            // 選択式（提出→添削）用
            choices: isChoice ? choices : [],
            correct_index: isChoice ? q.correct_index : null,
            explanation: q.explanation || '',
            selected_index: selectedIndex,
            // 受講者が選んだ回答文（回答文生成なら生成された文章、固定選択肢なら選択肢の文言）
            selected_text: isChoice
              ? a?.answer_text ||
                (selectedIndex !== null && selectedIndex !== undefined ? choices[selectedIndex] ?? '' : '')
              : '',
            // 正答が設定されていれば正誤の初期値として使う（最終判断は指導者）
            auto_is_correct:
              isChoice && q.correct_index !== null && q.correct_index !== undefined && selectedIndex !== null
                ? selectedIndex === q.correct_index
                : null,
          };
        }),
        latest_review: latestReview
          ? {
              ...latestReview,
              question_reviews: Array.isArray(latestReview.question_reviews) ? latestReview.question_reviews : [],
            }
          : null,
      });
    }
  }

  // 提出日時の新しい順
  submissions.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());

  return NextResponse.json({ submissions });
}

// POST /api/admin/essay-reviews
// body: {
//   quiz_id, user_id,
//   result: 'passed'|'needs_revision',
//   review_comment, explanation,
//   question_reviews?: [{ question_id, is_correct, comment, markup? }],  // 設問ごとの正誤・コメント・赤ペン
//   ai_assisted?
// }
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const { quiz_id, user_id, result, review_comment, explanation, question_reviews, ai_assisted } = body;

  if (!quiz_id || !user_id || !['passed', 'needs_revision'].includes(result)) {
    return NextResponse.json({ error: 'quiz_id / user_id / result が不正です' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: quiz } = await admin
    .from('quizzes')
    .select('id, course_id, title, quiz_type, grading_mode')
    .eq('id', Number(quiz_id))
    .single();
  if (!quiz || (quiz.quiz_type !== 'essay' && quiz.grading_mode !== 'review')) {
    return NextResponse.json({ error: '添削対象のテストが見つかりません' }, { status: 404 });
  }

  // 対象受講者の提出があることを確認
  const { count } = await admin
    .from('quiz_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('quiz_id', Number(quiz_id))
    .eq('user_id', user_id);
  if ((count || 0) === 0) {
    return NextResponse.json({ error: 'この受講者の提出が見つかりません' }, { status: 400 });
  }

  // 設問ごとの添削（このクイズに属する設問のみ受け付ける）
  const { data: questionRows } = await admin
    .from('quiz_questions')
    .select('id, choices')
    .eq('quiz_id', Number(quiz_id));
  const questionById = new Map((questionRows || []).map((q) => [q.id, q]));

  // 赤ペンの検証用に、各設問の最新の回答文を取得
  const { data: answerRows } = await admin
    .from('quiz_attempts')
    .select('question_id, answer_text, selected_index, answered_at')
    .eq('quiz_id', Number(quiz_id))
    .eq('user_id', user_id)
    .order('answered_at', { ascending: false });
  const latestAnswerText = new Map<number, string>();
  (answerRows || []).forEach((a) => {
    if (latestAnswerText.has(a.question_id)) return;
    const q = questionById.get(a.question_id);
    const choices: string[] = Array.isArray(q?.choices) ? (q!.choices as string[]) : [];
    const text =
      a.answer_text ||
      (a.selected_index !== null && a.selected_index !== undefined ? choices[a.selected_index] ?? '' : '');
    latestAnswerText.set(a.question_id, text);
  });

  const cleanedQuestionReviews = (Array.isArray(question_reviews) ? question_reviews : [])
    .filter((r: any) => questionById.has(Number(r?.question_id)))
    .map((r: any) => {
      const qid = Number(r.question_id);
      // 元の回答文と一致しない赤ペンは壊れているので保存しない
      const markup = r.markup ? normalizeMarkup(latestAnswerText.get(qid) || '', r.markup) : null;
      return {
        question_id: qid,
        is_correct: typeof r.is_correct === 'boolean' ? r.is_correct : null,
        comment: r.comment ? String(r.comment) : null,
        markup,
      };
    });

  // 添削を追記（reviewer_id は指導者本人）
  const { error: insErr } = await admin.from('essay_reviews').insert({
    quiz_id: Number(quiz_id),
    user_id,
    reviewer_id: auth.user.id,
    review_comment: review_comment ? String(review_comment) : null,
    explanation: explanation ? String(explanation) : null,
    question_reviews: cleanedQuestionReviews,
    result,
    ai_assisted: !!ai_assisted,
    reviewed_at: new Date().toISOString(),
  });
  if (insErr) {
    return NextResponse.json({ error: '添削の保存に失敗しました', details: insErr.message }, { status: 500 });
  }

  // 受講者へ通知
  await notifyUsers(admin, [user_id], {
    title: result === 'passed' ? 'テストに合格しました' : 'テストの再提出のお願い',
    message:
      result === 'passed'
        ? `「${quiz.title}」の添削が完了し、合格となりました。課題ページで確認できます。`
        : `「${quiz.title}」の添削が完了しました。課題ページでコメントを確認して再提出してください。`,
    type: 'essay_review',
    related_type: 'quiz',
    related_id: Number(quiz_id),
  });

  // 合格なら修了要件を満たしていれば修了証を自動発行
  let certificateId: string | undefined;
  if (result === 'passed') {
    const cert = await issueCertificateIfEligible(admin, user_id, quiz.course_id);
    if (cert.ok) {
      certificateId = cert.certificateId;
      if (cert.created) {
        await notifyUsers(admin, [user_id], {
          title: '修了証が発行されました',
          message: 'コースを修了しました。修了証ページからダウンロードできます。',
          type: 'certificate',
          related_type: 'course',
          related_id: quiz.course_id,
        });
      }
    }
  }

  return NextResponse.json({ success: true, certificateId });
}
