import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import {
  isMissingTableError,
  parseCompanyTrainingPeriodInput,
  type CompanyTrainingPeriodMap,
} from '@/lib/companies/companySettings';

export const runtime = 'nodejs';

// 会社ごとの設定（研修開始日・研修終了日。どちらも任意）。管理者・講師のみ。
//
// GET /api/admin/company-settings
//     → { settings: { [会社名]: { training_start_date, training_end_date } }, available }
//       available が false のときは、データベースの設定（company_settings の表）がまだ無い
// PUT /api/admin/company-settings  body: { company, training_start_date, training_end_date }
//     → その会社の研修期間を保存する。日付は 'YYYY-MM-DD' か null。両方 null なら未設定に戻す（行を消す）
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const admin = createAdminSupabaseClient();
  const { data, error } = await admin
    .from('company_settings')
    .select('company, training_start_date, training_end_date');
  if (error) {
    if (isMissingTableError(error)) return NextResponse.json({ settings: {}, available: false });
    return NextResponse.json({ error: '会社の設定の取得に失敗しました', details: error.message }, { status: 500 });
  }

  const settings: CompanyTrainingPeriodMap = {};
  for (const row of data || []) {
    if (!row.training_start_date && !row.training_end_date) continue;
    settings[row.company] = {
      training_start_date: row.training_start_date || null,
      training_end_date: row.training_end_date || null,
    };
  }
  return NextResponse.json({ settings, available: true });
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const parsed = parseCompanyTrainingPeriodInput(await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const { company, period } = parsed;

  const admin = createAdminSupabaseClient();

  // 受講者のいない会社名には設定を作らない（打ち間違いの会社名で行が残らないように）
  const { data: members, error: memberErr } = await admin
    .from('user_profiles')
    .select('id')
    .eq('company', company)
    .limit(1);
  if (memberErr) {
    return NextResponse.json({ error: '会社の確認に失敗しました', details: memberErr.message }, { status: 500 });
  }
  if (!members || members.length === 0) {
    return NextResponse.json({ error: 'この会社の受講者が見つかりません' }, { status: 404 });
  }

  const missingTable = () =>
    NextResponse.json(
      { error: 'データベースの設定がまだ適用されていないため、研修期間を保存できません' },
      { status: 503 }
    );

  // 両方とも未設定 → 行を消して未設定に戻す
  if (!period.training_start_date && !period.training_end_date) {
    const { error } = await admin.from('company_settings').delete().eq('company', company);
    if (error) {
      if (isMissingTableError(error)) return missingTable();
      return NextResponse.json({ error: '保存に失敗しました', details: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, company, period: null });
  }

  const { error } = await admin.from('company_settings').upsert(
    {
      company,
      training_start_date: period.training_start_date,
      training_end_date: period.training_end_date,
      updated_by: auth.user.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'company' }
  );
  if (error) {
    if (isMissingTableError(error)) return missingTable();
    return NextResponse.json({ error: '保存に失敗しました', details: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, company, period });
}
