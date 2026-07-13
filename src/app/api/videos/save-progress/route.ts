import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

// 進捗保存API
// - sendBeacon 経由でも動くよう、認証トークンは本文(access_token)またはAuthorizationヘッダで受け取る
// - トークンから本人を検証し、本人のログのみ更新／作成する（IDOR防止）
// - 書き込みは service role で行うため RLS に弾かれない（sendBeaconでも確実に保存される）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      access_token,
      video_id,
      course_id,
      session_id,
      current_position,
      total_watched_time,
      progress_percent,
      status,
      start_time,
      end_time,
      log_id,
    } = body;

    const admin = createAdminSupabaseClient();

    // 認証：本文のトークン優先、無ければ Authorization ヘッダ
    const headerToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const token = access_token || headerToken;
    if (!token) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
    const { data: { user: authUser }, error: authError } = await admin.auth.getUser(token);
    if (authError || !authUser) {
      return NextResponse.json({ error: '認証に失敗しました' }, { status: 401 });
    }

    // 既存のログを更新
    if (log_id) {
      const { data: currentLog, error: fetchError } = await admin
        .from('video_view_logs')
        .select('user_id, progress_percent')
        .eq('id', log_id)
        .single();

      if (fetchError || !currentLog) {
        return NextResponse.json({ error: 'ログが見つかりません' }, { status: 404 });
      }

      // 本人のログのみ更新可（他人のログの改ざんを防止）
      if (currentLog.user_id !== authUser.id) {
        return NextResponse.json({ error: '権限がありません' }, { status: 403 });
      }

      // 進捗が戻る場合はスキップ（単調増加を保証）
      const currentProgress = currentLog.progress_percent || 0;
      if (progress_percent < currentProgress) {
        return NextResponse.json({ success: true, log_id, skipped: true });
      }

      const updateData: any = {
        session_id,
        // 整数カラムへ小数が来ても弾かれないよう丸める（22P02対策）
        current_position: Math.round(current_position || 0),
        progress_percent: Math.round(progress_percent || 0),
        total_watched_time: Math.round(total_watched_time || 0),
        status,
        last_updated: end_time,
        end_time,
      };
      if (start_time) updateData.start_time = start_time;
      if (status === 'completed') updateData.completed_at = end_time;

      const { error: updateError } = await admin
        .from('video_view_logs')
        .update(updateData)
        .eq('id', log_id)
        .eq('user_id', authUser.id); // 二重の安全策

      if (updateError) {
        return NextResponse.json(
          { error: 'Failed to update progress', details: updateError.message },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true, log_id });
    }

    // 新規ログを作成（user_id は必ず検証済みIDを使用）
    const { data: newLog, error: insertError } = await admin
      .from('video_view_logs')
      .insert({
        user_id: authUser.id,
        video_id,
        course_id,
        session_id,
        current_position: Math.round(current_position || 0),
        total_watched_time: Math.round(total_watched_time || 0),
        progress_percent: Math.round(progress_percent || 0),
        status,
        start_time: start_time || end_time,
        end_time,
        last_updated: end_time,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: 'Failed to create progress log', details: insertError.message },
        { status: 500 }
      );
    }
    return NextResponse.json({ success: true, log_id: newLog.id });
  } catch (err) {
    console.error('[Progress Save API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: String(err) },
      { status: 500 }
    );
  }
}
