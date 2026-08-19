import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { notifyUsers } from '@/lib/notify';
import { issueCertificateIfEligible } from '@/lib/certificate/issue';

export const runtime = 'nodejs';

// GET /api/admin/essay-reviews?status=pending|all
// 記述式最終テストの提出一覧（添削待ち／全件）を返す。
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const statusFilter = request.nextUrl.searchParams.get('status') || 'pending';
  const admin = createAdminSupabaseClient();

  // 公開中の記述式クイズ
  const { data: quizzes } = await admin
    .from('quizzes')
    .select('id, course_id, title')
    .eq('quiz_type', 'essay')
    .eq('status', 'published');
  if (!quizzes || quizzes.length === 0) return NextResponse.json({ submissions: [] });

  // コース名
  const courseIds = Array.from(new Set(quizzes.map((q) => q.course_id)));
  const { data: courses } = await admin.from('courses').select('id, title').in('id', courseIds);
  const courseMap = new Map((courses || []).map((c) => [c.id, c.title]));

  const submissions: any[] = [];

  for (const quiz of quizzes) {
    const { data: questions } = await admin
      .from('quiz_questions')
      .select('id, question_text, sort_order')
      .eq('quiz_id', quiz.id)
      .order('sort_order', { ascending: true });

    const { data: attempts } = await admin
      .from('quiz_attempts')
      .select('user_id, question_id, answer_text, attempt_no, answered_at')
      .eq('quiz_id', quiz.id)
      .order('answered_at', { ascending: false });
    if (!attempts || attempts.length === 0) continue;

    const { data: reviews } = await admin
      .from('essay_reviews')
      .select('user_id, result, review_comment, explanation, reviewed_at')
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
        submitted_at: latestAttemptTime,
        status, // 'pending' | 'passed' | 'needs_revision'
        questions: (questions || []).map((q) => ({
          id: q.id,
          question_text: q.question_text,
          answer_text: latestAnswer.get(q.id)?.answer_text ?? '',
        })),
        latest_review: latestReview,
      });
    }
  }

  // 提出日時の新しい順
  submissions.sort((a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime());

  return NextResponse.json({ submissions });
}

// POST /api/admin/essay-reviews
// body: { quiz_id, user_id, result: 'passed'|'needs_revision', review_comment, ai_assisted? }
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const { quiz_id, user_id, result, review_comment, explanation, ai_assisted } = body;

  if (!quiz_id || !user_id || !['passed', 'needs_revision'].includes(result)) {
    return NextResponse.json({ error: 'quiz_id / user_id / result が不正です' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  const { data: quiz } = await admin
    .from('quizzes')
    .select('id, course_id, title, quiz_type')
    .eq('id', Number(quiz_id))
    .single();
  if (!quiz || quiz.quiz_type !== 'essay') {
    return NextResponse.json({ error: '記述式テストが見つかりません' }, { status: 404 });
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

  // 添削を追記（reviewer_id は指導者本人）
  const { error: insErr } = await admin.from('essay_reviews').insert({
    quiz_id: Number(quiz_id),
    user_id,
    reviewer_id: auth.user.id,
    review_comment: review_comment ? String(review_comment) : null,
    explanation: explanation ? String(explanation) : null,
    result,
    ai_assisted: !!ai_assisted,
    reviewed_at: new Date().toISOString(),
  });
  if (insErr) {
    return NextResponse.json({ error: '添削の保存に失敗しました', details: insErr.message }, { status: 500 });
  }

  // 受講者へ通知
  await notifyUsers(admin, [user_id], {
    title: result === 'passed' ? '記述式テストに合格しました' : '記述式テストの再提出のお願い',
    message:
      result === 'passed'
        ? `「${quiz.title}」の添削が完了し、合格となりました。`
        : `「${quiz.title}」の添削が完了しました。コメントを確認して再提出してください。`,
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
