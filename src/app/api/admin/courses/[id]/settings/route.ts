import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export const runtime = 'nodejs';

// 通信制関連のコース設定のみを扱う（既存のコース更新PUTには手を触れない）。
// test_required = 小テスト・最終テスト・ゲート・修了要件の ON/OFF マスタースイッチ。

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from('courses')
    .select('id, title, test_required, standard_learning_minutes, standard_learning_period, training_type_note')
    .eq('id', Number(id))
    .single();

  if (error || !data) {
    return NextResponse.json({ error: 'コースが見つかりません' }, { status: 404 });
  }
  return NextResponse.json({ settings: data });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const update: Record<string, unknown> = {};

  if (typeof body.test_required === 'boolean') update.test_required = body.test_required;
  if ('standard_learning_minutes' in body) {
    const v = body.standard_learning_minutes;
    update.standard_learning_minutes = v === null || v === '' ? null : Number(v);
  }
  if ('standard_learning_period' in body) {
    update.standard_learning_period = body.standard_learning_period
      ? String(body.standard_learning_period).slice(0, 100)
      : null;
  }
  if ('training_type_note' in body) {
    update.training_type_note = body.training_type_note ? String(body.training_type_note) : null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: '更新項目がありません' }, { status: 400 });
  }
  update.updated_at = new Date().toISOString();

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from('courses')
    .update(update)
    .eq('id', Number(id))
    .select('id, title, test_required, standard_learning_minutes, standard_learning_period, training_type_note')
    .single();

  if (error) {
    return NextResponse.json({ error: '設定の更新に失敗しました', details: error.message }, { status: 500 });
  }
  return NextResponse.json({ settings: data });
}
