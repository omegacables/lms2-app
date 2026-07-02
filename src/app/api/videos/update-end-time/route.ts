import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

// 視聴ログの終了時刻のみ更新するAPI
// - sendBeacon 経由でも動くよう、認証トークンは本文(access_token)またはAuthorizationヘッダで受け取る
// - 本人のログのみ更新可。書き込みは service role（RLSに弾かれない）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { access_token, log_id, end_time, last_updated } = body;

    if (!log_id) {
      return NextResponse.json({ error: 'log_id is required' }, { status: 400 });
    }

    const admin = createAdminSupabaseClient();

    const headerToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const token = access_token || headerToken;
    if (!token) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
    const { data: { user: authUser }, error: authError } = await admin.auth.getUser(token);
    if (authError || !authUser) {
      return NextResponse.json({ error: '認証に失敗しました' }, { status: 401 });
    }

    // 本人のログか確認
    const { data: currentLog, error: fetchError } = await admin
      .from('video_view_logs')
      .select('user_id')
      .eq('id', log_id)
      .single();
    if (fetchError || !currentLog) {
      return NextResponse.json({ error: 'ログが見つかりません' }, { status: 404 });
    }
    if (currentLog.user_id !== authUser.id) {
      return NextResponse.json({ error: '権限がありません' }, { status: 403 });
    }

    const { error: updateError } = await admin
      .from('video_view_logs')
      .update({
        end_time: end_time || new Date().toISOString(),
        last_updated: last_updated || new Date().toISOString(),
      })
      .eq('id', log_id)
      .eq('user_id', authUser.id);

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update end time', details: updateError.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, log_id });
  } catch (err) {
    console.error('[Update End Time API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: String(err) },
      { status: 500 }
    );
  }
}
