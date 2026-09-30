import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export const runtime = 'nodejs';

// POST /api/admin/essay-reviews/confirm-auto
// body: { items: [{ quiz_id, user_id }] }
// 自動添削で返却した最終テストの添削を、講師が内容を確認したものとしてまとめて記録する。
// 添削は追記のみの方針のため、自動添削と同じ内容の添削を「確認した講師」を reviewer_id にして追記する
// （受講者に見える署名「講師　担当講師の名前」と合否は変わらない。元の自動添削も記録に残る）。受講者への通知はしない。
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const items: any[] = Array.isArray(body.items) ? body.items.slice(0, 300) : [];
  if (items.length === 0) {
    return NextResponse.json({ error: '確認する添削が選ばれていません' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  let confirmed = 0;
  let skipped = 0;

  for (const item of items) {
    const quizId = Number(item?.quiz_id);
    const userId = String(item?.user_id || '');
    if (!Number.isInteger(quizId) || !userId) {
      skipped++;
      continue;
    }
    const { data: latest } = await admin
      .from('essay_reviews')
      .select('*')
      .eq('quiz_id', quizId)
      .eq('user_id', userId)
      .order('reviewed_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    // 最新の添削が自動添削（講師が未確認）でなければ対象外
    if (!latest || !latest.auto_reviewed) {
      skipped++;
      continue;
    }
    // 自動添削のあとに新しい提出があるもの（添削をやり直し中）は対象外
    const { data: lastAttempt } = await admin
      .from('quiz_attempts')
      .select('answered_at')
      .eq('quiz_id', quizId)
      .eq('user_id', userId)
      .order('answered_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lastAttempt || new Date(lastAttempt.answered_at) > new Date(latest.reviewed_at)) {
      skipped++;
      continue;
    }
    const { error } = await admin.from('essay_reviews').insert({
      quiz_id: quizId,
      user_id: userId,
      reviewer_id: auth.user.id,
      auto_reviewed: false,
      ai_instructor_id: latest.ai_instructor_id,
      ai_instructor_name: latest.ai_instructor_name,
      review_comment: latest.review_comment,
      explanation: latest.explanation,
      question_reviews: latest.question_reviews,
      result: latest.result,
      ai_assisted: true,
      reviewed_at: new Date().toISOString(),
    });
    if (error) {
      console.error('[essay-reviews/confirm-auto] insert error:', error);
      skipped++;
    } else {
      confirmed++;
    }
  }

  return NextResponse.json({ confirmed, skipped });
}
