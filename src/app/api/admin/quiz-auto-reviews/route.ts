import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { effectiveStatus, reviewerNames, sanitizeEditedReviews } from '@/lib/quiz/autoReview';
import { aiInstructorLabel } from '@/lib/quiz/aiInstructors';

export const runtime = 'nodejs';

// GET /api/admin/quiz-auto-reviews?filter=unconfirmed|all
// 小テストの自動添削（AI講師の赤ペン・講評）の一覧。受講者には回答直後に返却済み。講師が内容を確認・修正するための画面用。
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const filter = request.nextUrl.searchParams.get('filter') === 'all' ? 'all' : 'unconfirmed';
  const admin = createAdminSupabaseClient();

  let query = admin.from('quiz_auto_reviews').select('*').order('updated_at', { ascending: false }).limit(300);
  if (filter === 'unconfirmed') query = query.is('confirmed_at', null);
  const { data: rows, error } = await query;
  if (error) {
    return NextResponse.json({ error: '自動添削の取得に失敗しました', details: error.message }, { status: 500 });
  }
  if (!rows || rows.length === 0) return NextResponse.json({ items: [] });

  // テスト・コース・設問・受講者（JOIN を避けて個別に取得）
  const quizIds = Array.from(new Set(rows.map((r) => r.quiz_id)));
  const { data: quizzes } = await admin.from('quizzes').select('id, title, course_id').in('id', quizIds);
  const quizMap = new Map((quizzes || []).map((q) => [q.id, q]));
  const courseIds = Array.from(new Set((quizzes || []).map((q) => q.course_id)));
  const { data: courses } = courseIds.length
    ? await admin.from('courses').select('id, title').in('id', courseIds)
    : { data: [] as { id: number; title: string }[] };
  const courseMap = new Map((courses || []).map((c) => [c.id, c.title]));
  const { data: questions } = await admin
    .from('quiz_questions')
    .select('id, quiz_id, question_text, sort_order')
    .in('quiz_id', quizIds)
    .order('sort_order', { ascending: true })
    .order('id', { ascending: true });
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: users } = await admin.from('user_profiles').select('id, display_name, email, company').in('id', userIds);
  const userMap = new Map((users || []).map((u) => [u.id, u]));
  const names = await reviewerNames(admin, rows.map((r) => r.confirmed_by));

  const items = rows.map((r) => {
    const quiz = quizMap.get(r.quiz_id);
    const user = userMap.get(r.user_id);
    const reviews: any[] = Array.isArray(r.question_reviews) ? r.question_reviews : [];
    const quizQuestions = (questions || []).filter((q) => q.quiz_id === r.quiz_id);
    return {
      id: r.id,
      quiz_id: r.quiz_id,
      user_id: r.user_id,
      student_name: user?.display_name || user?.email || r.user_id,
      company: user?.company || '',
      course_title: quiz ? courseMap.get(quiz.course_id) || '' : '',
      quiz_title: quiz?.title || '',
      status: effectiveStatus(r),
      signature: aiInstructorLabel(r.ai_instructor_name),
      error: r.error,
      generated_at: r.generated_at,
      updated_at: r.updated_at,
      edited_at: r.edited_at,
      confirmed: !!r.confirmed_at,
      confirmed_at: r.confirmed_at,
      reviewer_name: r.confirmed_by ? names.get(r.confirmed_by) || null : null,
      review_comment: r.review_comment,
      questions: quizQuestions
        .map((q) => {
          const rv = reviews.find((x) => Number(x.question_id) === q.id);
          if (!rv) return null;
          return {
            id: q.id,
            question_text: q.question_text,
            answer_text: rv.answer_text || '',
            comment: rv.comment ?? null,
            markup: Array.isArray(rv.markup) ? rv.markup : null,
          };
        })
        .filter(Boolean),
    };
  });

  return NextResponse.json({ items });
}

// POST /api/admin/quiz-auto-reviews
// body: { items: [{ id, review_comment?, question_reviews?: [{ question_id, comment, markup }] }] }
// 講師が内容を確認済みにする（1件ずつ修正して確認、または複数をまとめて確認）。確認者として講師名が添えられる。
// 修正した場合は edited_at を記録する（AI の元の内容は ai_* 列に残る）。
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const items: any[] = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
  if (items.length === 0) {
    return NextResponse.json({ error: '確認する自動添削が選ばれていません' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const now = new Date().toISOString();
  let confirmed = 0;
  const skipped: number[] = [];

  for (const item of items) {
    const id = Number(item?.id);
    if (!Number.isInteger(id)) continue;
    const { data: row } = await admin.from('quiz_auto_reviews').select('*').eq('id', id).maybeSingle();
    // 作成中・作成失敗のものは確認できない
    if (!row || effectiveStatus(row) !== 'ready') {
      skipped.push(id);
      continue;
    }

    const patch: Record<string, unknown> = { confirmed_by: auth.user.id, confirmed_at: now, updated_at: now };
    const current: any[] = Array.isArray(row.question_reviews) ? row.question_reviews : [];
    if (item.question_reviews !== undefined) {
      const cleaned = sanitizeEditedReviews(current, item.question_reviews);
      if (JSON.stringify(cleaned) !== JSON.stringify(current)) {
        patch.question_reviews = cleaned;
        patch.edited_at = now;
      }
    }
    if (typeof item.review_comment === 'string' || item.review_comment === null) {
      const nextComment = item.review_comment ? String(item.review_comment) : null;
      if (nextComment !== (row.review_comment ?? null)) {
        patch.review_comment = nextComment;
        patch.edited_at = now;
      }
    }

    const { error } = await admin.from('quiz_auto_reviews').update(patch).eq('id', id);
    if (error) {
      console.error('[admin/quiz-auto-reviews POST] update error:', error);
      skipped.push(id);
    } else {
      confirmed++;
    }
  }

  return NextResponse.json({ confirmed, skipped });
}
