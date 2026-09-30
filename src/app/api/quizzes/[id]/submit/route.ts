import { NextRequest, NextResponse, after } from 'next/server';
import { getAuthUser } from '@/lib/auth/getUser';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { submitForReview } from '@/lib/quiz/submitForReview';
import { generateFinalAutoReview } from '@/lib/quiz/autoFinalReview';

export const runtime = 'nodejs';
// 提出後に AI講師の自動添削を作るため、応答後もしばらく処理を続ける
export const maxDuration = 300;

// POST /api/quizzes/[id]/submit
// body: { access_token?, choice_set_id?, answers: [{ question_id, selected_index? , answer_text? }] }
// 提出制テスト（記述式／選択式 grading_mode='review'）の提出。提出後に AI講師が自動で添削して返却する
// （AI の添削ができなかった場合は添削待ちのまま残り、講師が添削画面から返却する）。
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
  // 提出できたら AI講師が自動で添削して返却する（応答を返したあとに実行）
  if (outcome.status === 200) {
    const quizId = Number(id);
    after(async () => {
      await generateFinalAutoReview(admin, quizId, user.id);
    });
  }
  return NextResponse.json(outcome.body, { status: outcome.status });
}
