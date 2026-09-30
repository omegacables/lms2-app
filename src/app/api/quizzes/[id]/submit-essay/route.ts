import { NextRequest, NextResponse, after } from 'next/server';
import { getAuthUser } from '@/lib/auth/getUser';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { submitForReview } from '@/lib/quiz/submitForReview';
import { generateFinalAutoReview } from '@/lib/quiz/autoFinalReview';

export const runtime = 'nodejs';
// 提出後に自動添削を作るため、応答後もしばらく処理を続ける
export const maxDuration = 300;

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
  // 提出できたら自動で添削して返却する（応答を返したあとに実行）
  if (outcome.status === 200) {
    const quizId = Number(id);
    after(async () => {
      await generateFinalAutoReview(admin, quizId, user.id);
    });
  }
  return NextResponse.json(outcome.body, { status: outcome.status });
}
