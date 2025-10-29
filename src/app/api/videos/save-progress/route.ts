import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/database/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      user_id,
      video_id,
      course_id,
      session_id,
      current_position,
      total_watched_time,
      progress_percent,
      video_duration,
      status,
      start_time,
      end_time,
      log_id
    } = body;

    console.log('[Progress Save API] Received request:', {
      user_id,
      video_id,
      log_id,
      progress_percent,
      status
    });

    // 既存のログを更新
    if (log_id) {
      const updateData: any = {
        session_id,
        current_position: Math.round(current_position),
        progress_percent,
        total_watched_time,
        status,
        last_updated: end_time,
        end_time,
      };

      // 開始時刻が提供されている場合のみ更新
      if (start_time) {
        updateData.start_time = start_time;
      }

      // 完了時刻を設定
      if (status === 'completed') {
        updateData.completed_at = end_time;
      }

      const { error: updateError } = await supabase
        .from('video_view_logs')
        .update(updateData)
        .eq('id', log_id);

      if (updateError) {
        console.error('[Progress Save API] Update error:', updateError);
        return NextResponse.json(
          { error: 'Failed to update progress', details: updateError.message },
          { status: 500 }
        );
      }

      console.log('[Progress Save API] Progress updated successfully:', log_id);
      return NextResponse.json({ success: true, log_id });
    }

    // 新規ログを作成（通常は発生しないが、念のため）
    const { data: newLog, error: insertError } = await supabase
      .from('video_view_logs')
      .insert({
        user_id,
        video_id,
        course_id,
        session_id,
        current_position: Math.round(current_position),
        total_watched_time,
        progress_percent,
        status,
        start_time: start_time || end_time,
        end_time,
        last_updated: end_time,
      })
      .select()
      .single();

    if (insertError) {
      console.error('[Progress Save API] Insert error:', insertError);
      return NextResponse.json(
        { error: 'Failed to create progress log', details: insertError.message },
        { status: 500 }
      );
    }

    console.log('[Progress Save API] New log created:', newLog.id);
    return NextResponse.json({ success: true, log_id: newLog.id });

  } catch (err) {
    console.error('[Progress Save API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: String(err) },
      { status: 500 }
    );
  }
}
