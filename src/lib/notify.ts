import type { SupabaseClient } from '@supabase/supabase-js';

// 通知作成の共通ヘルパー（既存 notifications テーブルを利用）。
// 書き込みは service role クライアントで行う前提。

export async function notifyUsers(
  admin: SupabaseClient,
  userIds: string[],
  payload: { title: string; message: string; type?: string; related_type?: string; related_id?: number }
): Promise<void> {
  const ids = Array.from(new Set(userIds)).filter(Boolean);
  if (ids.length === 0) return;
  const rows = ids.map((uid) => ({
    user_id: uid,
    title: payload.title,
    message: payload.message,
    type: payload.type || 'info',
    related_type: payload.related_type || null,
    related_id: payload.related_id ?? null,
    is_read: false,
  }));
  const { error } = await admin.from('notifications').insert(rows);
  if (error) console.error('[notifyUsers] insert failed:', error.message);
}

// 指導者（instructor / admin）の user_id 一覧を取得
export async function getStaffUserIds(admin: SupabaseClient): Promise<string[]> {
  const { data } = await admin
    .from('user_profiles')
    .select('id')
    .in('role', ['instructor', 'admin'])
    .eq('is_active', true);
  return (data || []).map((u) => u.id);
}
