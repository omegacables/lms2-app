import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { chunk, consultantCompanyScope, studentIdsInScope } from '@/lib/auth/consultantScope';

export const runtime = 'nodejs';

// GET /api/admin/record-courses
// 帳票・実施記録出力／テスト・添削の画面で選ぶコースの一覧。
// 管理者・講師は全コース、社労士は担当会社の受講者が受講しているコースだけ。
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor', 'labor_consultant']);
  if (!auth.ok) return auth.response;

  const admin = createAdminSupabaseClient();
  const { data: courses, error } = await admin
    .from('courses')
    .select('id, title, order_index')
    .order('order_index', { ascending: true });
  if (error) {
    return NextResponse.json({ error: 'コースの取得に失敗しました', details: error.message }, { status: 500 });
  }
  const list = (courses || []).map((c) => ({ id: c.id as number, title: c.title as string }));

  const scope = await consultantCompanyScope(admin, auth);
  if (scope === null) return NextResponse.json({ courses: list });

  const studentIds = await studentIdsInScope(admin, scope);
  const courseIds = new Set<number>();
  for (const ids of chunk(studentIds)) {
    const { data } = await admin.from('user_courses').select('course_id').in('user_id', ids);
    (data || []).forEach((r) => courseIds.add(r.course_id));
  }
  return NextResponse.json({ courses: list.filter((c) => courseIds.has(c.id)) });
}
