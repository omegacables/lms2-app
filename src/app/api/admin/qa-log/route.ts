import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/requireAdmin';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export const runtime = 'nodejs';

// GET /api/admin/qa-log?userId=&from=&to=
// 質疑応答の記録（messages ＋ support_conversations/messages）を期間で抽出して返す。
export async function GET(request: NextRequest) {
  const auth = await requireRole(request, ['admin', 'instructor', 'labor_consultant']);
  if (!auth.ok) return auth.response;

  const userId = request.nextUrl.searchParams.get('userId');
  const from = request.nextUrl.searchParams.get('from'); // ISO or YYYY-MM-DD
  const to = request.nextUrl.searchParams.get('to');
  if (!userId) return NextResponse.json({ error: 'userId が必要です' }, { status: 400 });

  const admin = createAdminSupabaseClient();
  const inRange = (d: string) => {
    const t = new Date(d).getTime();
    if (from && t < new Date(from).getTime()) return false;
    if (to && t > new Date(to + 'T23:59:59').getTime()) return false;
    return true;
  };

  const rows: { date: string; kind: string; from_role: string; subject: string; body: string }[] = [];

  // 1. messages（送受信いずれかが対象受講者）
  const { data: msgs } = await admin
    .from('messages')
    .select('sender_id, receiver_id, subject, content, created_at')
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
    .order('created_at', { ascending: true });
  (msgs || []).forEach((m) => {
    if (!m.created_at || !inRange(m.created_at)) return;
    rows.push({
      date: m.created_at,
      kind: 'メッセージ',
      from_role: m.sender_id === userId ? '受講者' : '指導者',
      subject: m.subject || '',
      body: m.content || '',
    });
  });

  // 2. support_conversations / support_messages（受講者本人の会話）
  const { data: convs } = await admin
    .from('support_conversations')
    .select('id, subject')
    .eq('student_id', userId);
  const convIds = (convs || []).map((c) => c.id);
  const convSubject = new Map((convs || []).map((c) => [c.id, c.subject || '']));
  if (convIds.length > 0) {
    const { data: sMsgs } = await admin
      .from('support_messages')
      .select('conversation_id, sender_id, message, created_at')
      .in('conversation_id', convIds)
      .order('created_at', { ascending: true });
    (sMsgs || []).forEach((m) => {
      if (!m.created_at || !inRange(m.created_at)) return;
      rows.push({
        date: m.created_at,
        kind: 'サポート',
        from_role: m.sender_id === userId ? '受講者' : '指導者',
        subject: convSubject.get(m.conversation_id) || '',
        body: m.message || '',
      });
    });
  }

  rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return NextResponse.json({ rows });
}
