import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { isValidDate, isValidTime } from '@/lib/records/workSchedule';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// 就業日の例外（その日だけ休み／出勤／就業時間が違う）。管理者・講師のみ。
//
// POST   body: { userIds: string[], work_date, is_workday, start_time?, end_time?, note? }
//        → 選んだ受講者に例外日を登録する（同じ日の例外があれば置き換える）
// DELETE body: { userId, work_date } → 例外日を消す（定期の設定に戻る）
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const userIds: string[] = Array.isArray(body.userIds)
    ? Array.from(new Set((body.userIds as unknown[]).filter((u): u is string => typeof u === 'string' && UUID_RE.test(u))))
    : [];
  if (userIds.length === 0) return NextResponse.json({ error: '受講者を選んでください' }, { status: 400 });
  if (userIds.length > 1000) return NextResponse.json({ error: '一度に設定できるのは1000名までです' }, { status: 400 });
  if (!isValidDate(body.work_date)) return NextResponse.json({ error: '日付を選んでください' }, { status: 400 });

  const isWorkday = body.is_workday === true;
  let startTime: string | null = null;
  let endTime: string | null = null;
  if (isWorkday && (body.start_time || body.end_time)) {
    if (!isValidTime(body.start_time) || !isValidTime(body.end_time)) {
      return NextResponse.json({ error: '就業時間は始業・終業の両方を入力してください（空欄なら定期の就業時間）' }, { status: 400 });
    }
    if (body.start_time === body.end_time) return NextResponse.json({ error: '始業と終業が同じ時刻です' }, { status: 400 });
    startTime = body.start_time;
    endTime = body.end_time;
  }
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 200) : '';

  const admin = createAdminSupabaseClient();
  const now = new Date().toISOString();
  const rows = userIds.map((uid) => ({
    user_id: uid,
    work_date: body.work_date,
    is_workday: isWorkday,
    start_time: startTime,
    end_time: endTime,
    note: note || null,
    updated_by: auth.user.id,
    updated_at: now,
  }));
  const { error } = await admin.from('student_work_exceptions').upsert(rows, { onConflict: 'user_id,work_date' });
  if (error) return NextResponse.json({ error: '保存に失敗しました', details: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, count: rows.length });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  if (typeof body.userId !== 'string' || !UUID_RE.test(body.userId) || !isValidDate(body.work_date)) {
    return NextResponse.json({ error: '対象が正しくありません' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();
  const { error } = await admin
    .from('student_work_exceptions')
    .delete()
    .eq('user_id', body.userId)
    .eq('work_date', body.work_date);
  if (error) return NextResponse.json({ error: '削除に失敗しました', details: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
