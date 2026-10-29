import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { isGeminiConfigured } from '@/lib/ai/gemini';
import { countTargets, findRetryTargets, retryFailedAutoReviews } from '@/lib/quiz/retryAutoReviews';

export const runtime = 'nodejs';
export const maxDuration = 300;

// 新しい処理を始めるのはこの時間まで（始めた処理の完了を待つ分、maxDuration より短くする）
const BUDGET_MS = 150_000;

// GET /api/admin/auto-reviews/retry
// 作り直しが必要な自動添削の件数（最終テストの添削待ち・小テストの失敗）
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const admin = createAdminSupabaseClient();
  const counts = countTargets(await findRetryTargets(admin));
  return NextResponse.json({ counts, ai_configured: isGeminiConfigured() });
}

// POST /api/admin/auto-reviews/retry
// 失敗した自動添削を時間内に終わる分だけ作り直す。残りがあれば呼び出し側が繰り返す。
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  if (!isGeminiConfigured()) {
    return NextResponse.json({ error: 'AI が未設定です（GEMINI_API_KEY）' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const result = await retryFailedAutoReviews(admin, BUDGET_MS);
  return NextResponse.json(result);
}
