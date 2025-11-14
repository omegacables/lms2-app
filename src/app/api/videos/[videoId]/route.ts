import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const cookieStore = await cookies();
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

    // 最新の視聴ログを取得（完了済みかどうかに関わらず）
    const { data: viewLogs, error: logError } = await supabase
      .from('video_view_logs')
      .select('*')
      .eq('user_id', user.id)
      .eq('video_id', video.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (logError && logError.code !== 'PGRST116') {
      console.error('Error fetching view log:', logError);
    }

    const latestLog = viewLogs && viewLogs.length > 0 ? viewLogs[0] : null;

    // ログが存在しない場合のみ新規作成
    if (!latestLog) {
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
      current_position: latestLog?.current_position || 0,
      progress_percent: latestLog?.progress_percent || 0,
      watch_status: latestLog?.status || 'not_started'
    });
  } catch (error) {
    console.error('Error in GET /api/videos/[id]:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // 認証チェック（Authorizationヘッダーから）
    const authHeader = request.headers.get('authorization');
    let user = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.replace('Bearer ', '');
      const { data: authData, error: authError } = await supabase.auth.getUser(token);
      user = authData?.user;
    } else {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      user = authData?.user;
    }

    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 講師または管理者権限チェック（開発環境では一時的に無効化）
    // TODO: 本番環境では必ず有効にすること
    /*
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    console.log('PUT /api/videos/[videoId] - User ID:', user.id);
    console.log('PUT /api/videos/[videoId] - User Profile:', userProfile);
    console.log('PUT /api/videos/[videoId] - Profile Error:', profileError);

    if (profileError || !userProfile) {
      console.error('Profile not found for user:', user.id);
      return NextResponse.json({
        error: 'ユーザープロファイルが見つかりません',
        debug: { userId: user.id, profileError: profileError?.message }
      }, { status: 403 });
    }

    if (!['instructor', 'admin'].includes(userProfile.role)) {
      console.error('Insufficient permissions. User role:', userProfile.role);
      return NextResponse.json({
        error: `権限が不足しています。現在のロール: ${userProfile.role}`,
        debug: { userId: user.id, role: userProfile.role }
      }, { status: 403 });
    }
    */

    const body = await request.json();
    const { title, description, order_index, status, file_url, file_size, mime_type } = body;

    // 更新データの作成
    const updateData: any = {};

    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (order_index !== undefined) updateData.order_index = order_index;
    if (status !== undefined) updateData.status = status;
    if (file_url !== undefined) updateData.file_url = file_url;
    if (file_size !== undefined) updateData.file_size = file_size;
    if (mime_type !== undefined) updateData.mime_type = mime_type;

    // 動画情報を更新
    const { data: updatedVideo, error: updateError } = await supabase
      .from('videos')
      .update(updateData)
      .eq('id', videoId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating video:', updateError);
      return NextResponse.json({ error: '動画の更新に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      message: '動画情報が更新されました',
      video: updatedVideo
    });
  } catch (error) {
    console.error('Error in PUT /api/videos/[videoId]:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;
    const cookieStore = await cookies();
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

    // 最新の視聴ログを取得
    const { data: latestLogs, error: fetchError } = await supabase
      .from('video_view_logs')
      .select('*')
      .eq('user_id', user.id)
      .eq('video_id', parseInt(videoId))
      .order('created_at', { ascending: false })
      .limit(1);

    if (fetchError) {
      console.error('Error fetching latest log:', fetchError);
      return NextResponse.json({ error: '視聴ログの取得に失敗しました' }, { status: 500 });
    }

    const latestLog = latestLogs && latestLogs.length > 0 ? latestLogs[0] : null;

    // 最新ログが既に完了済みの場合は、一切更新しない
    if (latestLog && latestLog.status === 'completed') {
      console.log('[Video Progress] 完了済みの動画です。ログを更新しません。', {
        user_id: user.id,
        video_id: videoId,
        log_id: latestLog.id
      });
      return NextResponse.json({
        message: 'この動画は既に完了しています',
        progress: latestLog
      });
    }

    let data;
    let error;

    if (latestLog && latestLog.status !== 'completed') {
      // 完了していないログのみ更新
      const updateData: any = {
        last_updated: new Date().toISOString()
      };

      if (current_position !== undefined) updateData.current_position = current_position;
      if (total_watched_time !== undefined) updateData.total_watched_time = total_watched_time;
      if (calculatedProgress !== undefined) updateData.progress_percent = calculatedProgress;
      if (status) updateData.status = status;

      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
        console.log('[Video Progress] 動画を完了としてマーク', {
          user_id: user.id,
          video_id: videoId,
          log_id: latestLog.id
        });
      }

      const result = await supabase
        .from('video_view_logs')
        .update(updateData)
        .eq('id', latestLog.id)
        .select()
        .single();

      data = result.data;
      error = result.error;
    } else {
      // ログが存在しない場合のみ新規作成
      const insertData: any = {
        user_id: user.id,
        video_id: parseInt(videoId),
        course_id: video.course_id,
        current_position: current_position || 0,
        total_watched_time: total_watched_time || 0,
        progress_percent: calculatedProgress || 0,
        status: status || 'not_started',
        last_updated: new Date().toISOString()
      };

      if (status === 'completed') {
        insertData.completed_at = new Date().toISOString();
      }

      const result = await supabase
        .from('video_view_logs')
        .insert(insertData)
        .select()
        .single();

      data = result.data;
      error = result.error;
    }

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