import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/database/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { log_id, end_time, last_updated } = body;

    if (!log_id) {
      return NextResponse.json(
        { error: 'log_id is required' },
        { status: 400 }
      );
    }

    console.log('[Update End Time API] Received request:', {
      log_id,
      end_time,
      last_updated
    });

    // 終了時刻のみを更新（進捗は更新しない）
    const { error: updateError } = await supabase
      .from('video_view_logs')
      .update({
        end_time: end_time || new Date().toISOString(),
        last_updated: last_updated || new Date().toISOString(),
      })
      .eq('id', log_id);

    if (updateError) {
      console.error('[Update End Time API] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update end time', details: updateError.message },
        { status: 500 }
      );
    }

    console.log('[Update End Time API] End time updated successfully:', log_id);
    return NextResponse.json({ success: true, log_id });

  } catch (err) {
    console.error('[Update End Time API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'Internal server error', details: String(err) },
      { status: 500 }
    );
  }
}
