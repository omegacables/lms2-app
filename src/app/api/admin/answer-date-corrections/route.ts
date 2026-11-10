import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';
import { isValidDate, jstParts, jstToday } from '@/lib/records/workSchedule';

export const runtime = 'nodejs';

// POST /api/admin/answer-date-corrections
// テストの回答日を修正する（管理者・講師）。
// body: { userId, quizId, answeredAt, correctedDate: 'YYYY-MM-DD' | null, reason }
//  - answeredAt は対象の回答・提出の quiz_attempts.answered_at（全設問で同じ値）
//  - correctedDate が null または元の回答日と同じなら「修正の取り消し」
// quiz_attempts（回答ログ）は書き換えず、修正の記録を quiz_answer_date_corrections に追記する。
// 修正後の日付は「日付・就業日」の一覧に出る。テスト実施記録（PDF）には今は回答日を載せていないが、
// 載せるときは修正後の日付と一緒に、元の回答日・修正者・理由も必ず載せる（learningRecordPDF.ts の SHOW_TEST_DATES）。
export async function POST(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor']);
  if (!auth.ok) return auth.response;

  const body = await request.json().catch(() => ({}));
  const userId = typeof body.userId === 'string' ? body.userId : '';
  const quizId = Number(body.quizId);
  const answeredAt = typeof body.answeredAt === 'string' ? body.answeredAt : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const correctedRaw = body.correctedDate === null || body.correctedDate === '' ? null : body.correctedDate;

  if (!userId || !Number.isInteger(quizId) || !answeredAt || !Number.isFinite(Date.parse(answeredAt))) {
    return NextResponse.json({ error: '対象の回答が正しくありません' }, { status: 400 });
  }
  if (!reason) return NextResponse.json({ error: '修正の理由を入力してください' }, { status: 400 });
  if (reason.length > 500) return NextResponse.json({ error: '理由は500文字以内で入力してください' }, { status: 400 });
  if (correctedRaw !== null && !isValidDate(correctedRaw)) {
    return NextResponse.json({ error: '日付が正しくありません' }, { status: 400 });
  }
  if (correctedRaw !== null && correctedRaw > jstToday()) {
    return NextResponse.json({ error: '今日より後の日付にはできません' }, { status: 400 });
  }

  const admin = createAdminSupabaseClient();

  // 対象の回答が実在するか（回答ログはそのまま。answered_at が一致する行があること）
  const { data: rows, error: findErr } = await admin
    .from('quiz_attempts')
    .select('id, answered_at')
    .eq('user_id', userId)
    .eq('quiz_id', quizId)
    .eq('answered_at', answeredAt)
    .limit(1);
  if (findErr) return NextResponse.json({ error: '回答の確認に失敗しました', details: findErr.message }, { status: 500 });
  if (!rows || rows.length === 0) return NextResponse.json({ error: '対象の回答が見つかりません' }, { status: 404 });

  const originalDate = jstParts(rows[0].answered_at).date;
  const correctedDate = correctedRaw === originalDate ? null : correctedRaw;

  const { data: me } = await admin.from('user_profiles').select('display_name, email').eq('id', auth.user.id).single();
  const correctedByName = (me?.display_name || me?.email || auth.user.email || '').slice(0, 100);

  const { error: insErr } = await admin.from('quiz_answer_date_corrections').insert({
    user_id: userId,
    quiz_id: quizId,
    answered_at: rows[0].answered_at,
    original_date: originalDate,
    corrected_date: correctedDate,
    reason,
    corrected_by: auth.user.id,
    corrected_by_name: correctedByName,
  });
  if (insErr) {
    return NextResponse.json({ error: '修正の保存に失敗しました', details: insErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, corrected_date: correctedDate, original_date: originalDate });
}
