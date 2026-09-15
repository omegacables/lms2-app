import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/getUser';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { submitForReview } from '@/lib/quiz/submitForReview';

export const runtime = 'nodejs';

// POST /api/quizzes/[id]/submit
// body: { access_token?, choice_set_id?, answers: [{ question_id, selected_index? , answer_text? }] }
// 提出制テスト（記述式／選択式 grading_mode='review'）の提出。採点はせず、指導者の添削待ちにする。
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const body = await request.json().catch(() => ({}));
  const { user, response } = await getAuthUser(request, body.access_token);
  if (!user) return response!;

  const { id } = await params;
  const admin = createAdminSupabaseClient();

  const outcome = await submitForReview(
    admin,
    user.id,
    Number(id),
    Array.isArray(body.answers) ? body.answers : [],
    body.choice_set_id ? String(body.choice_set_id) : null
  );
  return NextResponse.json(outcome.body, { status: outcome.status });
}
