import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { issueCertificateIfEligible } from '@/lib/certificate/issue';

export const runtime = 'nodejs';
export const maxDuration = 300;

// POST /api/admin/certificates/backfill
// コースを完了しているのに証明書が未発行の受講者へ、まとめて証明書を発行する。
// 発行判定は通常の修了要件（issueCertificateIfEligible）を使うため、
// 未完了・テスト未通過の受講者には発行されない（冪等・安全）。
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin']);
  if (!auth.ok) return auth.response;

  const admin = createAdminSupabaseClient();

  // 完了ログがある (user_id, course_id) の一覧を取得（ページングで全件）
  const pairs = new Map<string, { user_id: string; course_id: number }>();
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await admin
      .from('video_view_logs')
      .select('user_id, course_id')
      .eq('status', 'completed')
      .range(from, from + pageSize - 1);
    if (error) {
      return NextResponse.json({ error: '視聴ログの取得に失敗しました', details: error.message }, { status: 500 });
    }
    (data || []).forEach((r) => pairs.set(`${r.user_id}|${r.course_id}`, { user_id: r.user_id, course_id: r.course_id }));
    if (!data || data.length < pageSize) break;
  }

  // 既に証明書がある組み合わせを除外
  const { data: certs } = await admin.from('certificates').select('user_id, course_id');
  const hasCert = new Set((certs || []).map((c) => `${c.user_id}|${c.course_id}`));

  const targets = Array.from(pairs.values()).filter((p) => !hasCert.has(`${p.user_id}|${p.course_id}`));

  let issued = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const t of targets) {
    try {
      const res = await issueCertificateIfEligible(admin, t.user_id, t.course_id);
      if (res.ok && res.created) issued++;
      else if (res.ok && !res.created) skipped++; // 既存（競合）
      else skipped++; // 未完了・テスト未通過など
    } catch (e) {
      errors.push(`${t.user_id}/${t.course_id}: ${String(e)}`);
    }
  }

  return NextResponse.json({
    success: true,
    checked: targets.length,
    issued,
    skipped,
    errors: errors.length ? errors.slice(0, 20) : undefined,
  });
}
