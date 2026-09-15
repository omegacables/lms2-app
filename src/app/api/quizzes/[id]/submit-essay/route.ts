import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/getUser';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { submitForReview } from '@/lib/quiz/submitForReview';

export const runtime = 'nodejs';

// POST /api/quizzes/[id]/submit-essay
// 旧エンドポイント（記述式専用の名前）。実体は /api/quizzes/[id]/submit と同じ。
// 既存の呼び出し元との互換のために残している。新規は /submit を使うこと。
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
