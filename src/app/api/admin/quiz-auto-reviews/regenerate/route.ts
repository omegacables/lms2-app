import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { generateQuizAutoReview, markAutoReviewPending } from '@/lib/quiz/autoReview';

export const runtime = 'nodejs';
export const maxDuration = 300;

// POST /api/admin/quiz-auto-reviews/regenerate
// body: { id }
// 自動添削（AI）を作り直す（作成に失敗したとき・内容を作り直したいとき）。確認済みの署名は外れる。
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const id = Number(body.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: 'id が必要です' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { data: row } = await admin.from('quiz_auto_reviews').select('quiz_id, user_id').eq('id', id).maybeSingle();
  if (!row) {
    return NextResponse.json({ error: '自動添削が見つかりません' }, { status: 404 });
  }

  await markAutoReviewPending(admin, row.quiz_id, row.user_id);
  const result = await generateQuizAutoReview(admin, row.quiz_id, row.user_id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error || '自動添削の作成に失敗しました' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
