import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const cookieStore = cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 動画情報を取得
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .select(`
        *,
        courses!inner(
          id,
          title,
          status
        )
      `)
      .eq('id', videoId)
      .eq('status', 'active')
      .single();

    if (videoError || !video) {
      console.error('Error fetching video:', videoError);
      return NextResponse.json({ error: '動画が見つかりません' }, { status: 404 });
    }

    // コースが非アクティブの場合はアクセスを拒否
    if (video.courses?.status !== 'active') {
      return NextResponse.json({ error: 'この動画は現在利用できません' }, { status: 403 });
    }

    // 管理者クライアントで署名付きURLを生成
    const adminSupabase = createAdminSupabaseClient();
    
    // 動画ファイルの署名付きURLを生成（1時間有効）
    let signedUrl = null;
    if (video.file_url) {
      // Supabase Storageのパスから署名付きURLを生成
      const filePath = video.file_url.split('/').pop(); // ファイルパスを抽出
      const { data: urlData, error: urlError } = await adminSupabase.storage
        .from('videos')
        .createSignedUrl(`course-${video.course_id}/${filePath}`, 3600); // 1時間
      
      if (!urlError && urlData) {
        signedUrl = urlData.signedUrl;
      }
    }

    // 視聴ログの取得または作成
    const { data: viewLog, error: logError } = await supabase
      .from('video_view_logs')
      .select('*')
      .eq('user_id', user.id)
      .eq('video_id', video.id)
      .single();

    if (logError && logError.code !== 'PGRST116') { // PGRST116 = not found
      console.error('Error fetching view log:', logError);
    }

    // 視聴ログがない場合は作成
    if (!viewLog) {
      await supabase
        .from('video_view_logs')
        .insert({
          user_id: user.id,
          video_id: video.id,
          course_id: video.course_id,
          status: 'not_started'
        });
    }

    return NextResponse.json({
      ...video,
      signed_url: signedUrl,
      current_position: viewLog?.current_position || 0,
      progress_percent: viewLog?.progress_percent || 0,
      watch_status: viewLog?.status || 'not_started'
    });
  } catch (error) {
    console.error('Error in GET /api/videos/[id]:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const cookieStore = cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();
    const { current_position, total_watched_time, progress_percent } = body;

    // 動画情報を取得してコースIDを確認
    const { data: video, error: videoError } = await supabase
      .from('videos')
      .select('course_id, duration')
      .eq('id', videoId)
      .single();

    if (videoError || !video) {
      return NextResponse.json({ error: '動画が見つかりません' }, { status: 404 });
    }

    // 進捗率の計算（クライアントから送られた値があればそれを使用、なければ計算）
    let calculatedProgress = progress_percent;
    if (calculatedProgress === undefined && current_position !== undefined && video.duration) {
      calculatedProgress = Math.min(Math.round((current_position / video.duration) * 100), 100);
    }

    // ステータスの決定
    let status = 'in_progress';
    if (calculatedProgress >= 95) {
      status = 'completed';
    } else if (calculatedProgress === 0) {
      status = 'not_started';
    }

    // 視聴ログを更新（upsert）
    const updateData: any = {
      user_id: user.id,
      video_id: parseInt(videoId),
      course_id: video.course_id,
      last_updated: new Date().toISOString()
    };

    if (current_position !== undefined) updateData.current_position = current_position;
    if (total_watched_time !== undefined) updateData.total_watched_time = total_watched_time;
    if (calculatedProgress !== undefined) updateData.progress_percent = calculatedProgress;
    if (status) updateData.status = status;
    
    // 完了時刻の設定
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('video_view_logs')
      .upsert(updateData, {
        onConflict: 'user_id,video_id'
      })
      .select()
      .single();

    if (error) {
      console.error('Error updating video progress:', error);
      return NextResponse.json({ error: '視聴記録の更新に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      message: '視聴記録が更新されました',
      progress: data
    });
  } catch (error) {
    console.error('Error in PATCH /api/videos/[id]:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}