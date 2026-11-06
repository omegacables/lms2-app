import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import {
  exceptionFromRow,
  isValidTime,
  scheduleFromRow,
} from '@/lib/records/workSchedule';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 受講者ごとの就業日・就業時間（テスト実施記録で、就業時間外の回答日を赤字にするのに使う）。管理者・講師のみ。
//
// GET /api/admin/work-schedules?userId=   → { schedule, exceptions }（schedule は未設定なら null）
// PUT /api/admin/work-schedules  body: { userIds: string[], schedule: { work_days, start_time, end_time, holidays_off } }
//     → 選んだ受講者の定期の就業日・就業時間を上書きする
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const userId = request.nextUrl.searchParams.get('userId') || '';
  if (!UUID_RE.test(userId)) return NextResponse.json({ error: 'userId が必要です' }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const { data: row, error } = await admin
    .from('student_work_schedules')
    .select('work_days, start_time, end_time, holidays_off')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: '就業日・就業時間の取得に失敗しました', details: error.message }, { status: 500 });

  const { data: exRows, error: exErr } = await admin
    .from('student_work_exceptions')
    .select('work_date, is_workday, start_time, end_time, note')
    .eq('user_id', userId)
    .order('work_date', { ascending: true });
  if (exErr) return NextResponse.json({ error: '例外日の取得に失敗しました', details: exErr.message }, { status: 500 });

  return NextResponse.json({ schedule: scheduleFromRow(row), exceptions: (exRows || []).map(exceptionFromRow) });
}

export async function PUT(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const userIds: string[] = Array.isArray(body.userIds)
    ? Array.from(new Set((body.userIds as unknown[]).filter((u): u is string => typeof u === 'string' && UUID_RE.test(u))))
    : [];
  if (userIds.length === 0) return NextResponse.json({ error: '受講者を選んでください' }, { status: 400 });
  if (userIds.length > 1000) return NextResponse.json({ error: '一度に設定できるのは1000名までです' }, { status: 400 });

  const s = body.schedule || {};
  const workDays: number[] = Array.isArray(s.work_days)
    ? Array.from(new Set((s.work_days as unknown[]).map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))).sort()
    : [];
  if (!isValidTime(s.start_time) || !isValidTime(s.end_time)) {
    return NextResponse.json({ error: '就業時間を「09:00」の形で入力してください' }, { status: 400 });
  }
  if (s.start_time === s.end_time) {
    return NextResponse.json({ error: '始業と終業が同じ時刻です' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const rows = userIds.map((uid) => ({
    user_id: uid,
    work_days: workDays,
    start_time: s.start_time,
    end_time: s.end_time,
    holidays_off: s.holidays_off !== false,
    updated_by: auth.user.id,
    updated_at: now,
  }));
  const { error } = await admin.from('student_work_schedules').upsert(rows, { onConflict: 'user_id' });
  if (error) return NextResponse.json({ error: '保存に失敗しました', details: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, count: rows.length });
}
