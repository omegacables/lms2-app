import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { isGeminiConfigured } from '@/lib/ai/gemini';
import { draftSubmissionReview, ReviewDraftError } from '@/lib/quiz/reviewDraft';

export const runtime = 'nodejs';

// POST /api/admin/essay-reviews/ai-draft
// body: { quiz_id, user_id }
// Gemini で添削の下書きを生成して返す（記述式・選択式の提出→添削の両方に対応）。
//   question_reviews … 設問ごとの赤ペン（取り消し線・書き足し・吹き出し）と講評
//   comment / explanation / result … 全体の添削コメント・解説・合否案
// ★ このAPIは講師が添削画面で使う下書き生成のみ（DBには書き込まない）。
//   提出直後の自動添削は lib/quiz/autoFinalReview.ts が行う。
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  if (!isGeminiConfigured()) {
    return NextResponse.json(
      { error: 'AI下書きは未設定です（環境変数 GEMINI_API_KEY を設定してください）' },
      { status: 400 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const { quiz_id, user_id } = body;
  if (!quiz_id || !user_id) {
    return NextResponse.json({ error: 'quiz_id / user_id が必要です' }, { status: 400 });
  }

  try {
    const draft = await draftSubmissionReview(createAdminSupabaseClient(), Number(quiz_id), String(user_id));
    return NextResponse.json(draft);
  } catch (e) {
    if (e instanceof ReviewDraftError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: `AI下書きの生成に失敗しました: ${String(e)}` }, { status: 502 });
  }
}
