import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export const runtime = 'nodejs';

// PATCH /api/admin/ai-instructors/[id]
// body: { name?, title?, sort_order? }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, ['admin']);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};
  if ('name' in body) {
    const name = String(body.name || '').trim().slice(0, 50);
    if (!name) return NextResponse.json({ error: '名前を入力してください' }, { status: 400 });
    update.name = name;
  }
  if ('title' in body) update.title = body.title ? String(body.title).trim().slice(0, 100) : null;
  if ('sort_order' in body && Number.isInteger(Number(body.sort_order))) update.sort_order = Number(body.sort_order);
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '更新項目がありません' }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from('ai_instructors')
    .update(update)
    .eq('id', Number(id))
    .select('id, name, title, sort_order')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: 'AI講師の更新に失敗しました', details: error?.message }, { status: 500 });
  }
  return NextResponse.json({ instructor: data });
}

// DELETE /api/admin/ai-instructors/[id]
// 担当にしていたコースは「未設定（最初に登録した AI講師）」に戻る。過去の添削の署名は添削時の名前のまま残る。
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRole(request, ['admin']);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from('ai_instructors').delete().eq('id', Number(id));
  if (error) {
    return NextResponse.json({ error: 'AI講師の削除に失敗しました', details: error.message }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
