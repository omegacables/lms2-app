import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/getUser';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { computeGateState } from '@/lib/quiz/gating';

export const runtime = 'nodejs';

// GET /api/courses/[id]/learning-path
// 受講者向け：動画とクイズを一列に並べた学習パスと、通過・解放状況を返す。
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user, response } = await getAuthUser(request);
  if (!user) return response!;

  const { id } = await params;
  const courseId = Number(id);
  const admin = createAdminSupabaseClient();

  const state = await computeGateState(admin, user.id, courseId);

  return NextResponse.json({
    steps: state.steps,
    videoUnlocked: state.videoUnlocked,
    quizUnlocked: state.quizUnlocked,
    quizPassed: state.quizPassed,
    allPassed: state.allPassed,
  });
}
