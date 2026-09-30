import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { listAiInstructors, MAX_AI_INSTRUCTORS } from '@/lib/quiz/aiInstructors';

export const runtime = 'nodejs';

// GET /api/admin/ai-instructors
// 登録済みの講師（自動添削の署名に使う名前）と、それぞれを担当にしているコース数
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const admin = createAdminSupabaseClient();
  const instructors = await listAiInstructors(admin);
  const { data: courses } = await admin.from('courses').select('id, ai_instructor_id').not('ai_instructor_id', 'is', null);
  const counts = new Map<number, number>();
  (courses || []).forEach((c) => counts.set(c.ai_instructor_id, (counts.get(c.ai_instructor_id) || 0) + 1));

  return NextResponse.json({
    max: MAX_AI_INSTRUCTORS,
    instructors: instructors.map((i) => ({ ...i, course_count: counts.get(i.id) || 0 })),
  });
}

// POST /api/admin/ai-instructors
// body: { name, title? }  … 講師を追加（最大5名）
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin']);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim().slice(0, 50);
  const title = body.title ? String(body.title).trim().slice(0, 100) : null;
  if (!name) return NextResponse.json({ error: '名前を入力してください' }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const current = await listAiInstructors(admin);
  if (current.length >= MAX_AI_INSTRUCTORS) {
    return NextResponse.json({ error: `講師は最大${MAX_AI_INSTRUCTORS}名まで登録できます` }, { status: 400 });
  }
  const sortOrder = current.length > 0 ? Math.max(...current.map((i) => i.sort_order)) + 1 : 0;

  const { data, error } = await admin
    .from('ai_instructors')
    .insert({ name, title, sort_order: sortOrder })
    .select('id, name, title, sort_order')
    .single();
  if (error) {
    return NextResponse.json({ error: '講師の登録に失敗しました', details: error.message }, { status: 500 });
  }
  return NextResponse.json({ instructor: data });
}
