import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // コース情報を取得
    const { data: course, error: courseError } = await supabase
      .from('courses')
      .select(`
        *,
        videos(
          id,
          title,
          description,
          duration,
          thumbnail_url,
          order_index,
          status
        )
      `)
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      console.error('Error fetching course:', courseError);
      return NextResponse.json({ error: 'コースが見つかりません' }, { status: 404 });
    }

    // 動画を順序でソート（動画がある場合のみ）
    if (course.videos && course.videos.length > 0) {
      course.videos = course.videos
        .filter((video: any) => video.status === 'active')
        .sort((a: any, b: any) => a.order_index - b.order_index);
    } else {
      course.videos = [];
    }

    // ユーザーの視聴進捗を取得
    if (course.videos.length > 0) {
      const videoIds = course.videos.map((video: any) => video.id);
      const { data: progressData } = await supabase
        .from('video_view_logs')
        .select('video_id, current_position, progress_percent, status, completed_at')
        .eq('user_id', user.id)
        .in('video_id', videoIds);

      // 進捗データを動画に統合
      course.videos = course.videos.map((video: any) => {
        const progress = progressData?.find((p: any) => p.video_id === video.id);
        return {
          ...video,
          user_progress: progress ? {
            current_position: progress.current_position,
            progress_percent: progress.progress_percent,
            status: progress.status,
            completed_at: progress.completed_at
          } : {
            current_position: 0,
            progress_percent: 0,
            status: 'not_started',
            completed_at: null
          }
        };
      });
    }

    // コース全体の進捗計算
    if (course.videos.length > 0) {
      const completedVideos = course.videos.filter((video: any) => 
        video.user_progress.status === 'completed'
      ).length;
      
      const totalProgress = course.videos.reduce((sum: number, video: any) => 
        sum + video.user_progress.progress_percent, 0
      );

      course.user_progress = {
        completed_videos: completedVideos,
        total_videos: course.videos.length,
        overall_progress: Math.round(totalProgress / course.videos.length),
        is_completed: completedVideos === course.videos.length && course.videos.length > 0
      };
    } else {
      course.user_progress = {
        completed_videos: 0,
        total_videos: 0,
        overall_progress: 0,
        is_completed: false
      };
    }

    return NextResponse.json(course);
  } catch (error) {
    console.error('Error in GET /api/courses/[id]:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 管理者権限チェック
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || !['instructor', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: '講師または管理者権限が必要です' }, { status: 403 });
    }

    const body = await request.json();
    const {
      title,
      description,
      thumbnail_url,
      category,
      difficulty_level,
      estimated_duration,
      completion_threshold,
      order_index,
      status
    } = body;

    // コースを更新
    const { data, error } = await supabase
      .from('courses')
      .update({
        title,
        description,
        thumbnail_url,
        category,
        difficulty_level,
        estimated_duration,
        completion_threshold,
        order_index,
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', courseId)
      .select()
      .single();

    if (error) {
      console.error('Error updating course:', error);
      return NextResponse.json({ error: 'コースの更新に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'コースが更新されました',
      course: data
    });
  } catch (error) {
    console.error('Error in PUT /api/courses/[id]:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;

    if (!courseId) {
      return NextResponse.json({ error: 'コースIDが指定されていません' }, { status: 400 });
    }

    // 認証: まず Authorization ヘッダーのトークン、なければ cookie
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    let user = null;
    if (token) {
      const { data, error } = await supabase.auth.getUser(token);
      if (!error) user = data.user;
    }
    if (!user) {
      const { data } = await supabase.auth.getUser();
      user = data.user;
    }

    if (!user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 管理者権限チェック（RLS を回避するため admin クライアントで照会）
    const adminSupabase = createAdminSupabaseClient();
    const { data: userProfile, error: profileError } = await adminSupabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Profile lookup error:', profileError);
    }

    if (!userProfile || userProfile.role !== 'admin') {
      return NextResponse.json(
        { error: `管理者権限が必要です (現在の権限: ${userProfile?.role ?? '未取得'})` },
        { status: 403 }
      );
    }
    // 関連動画ファイルを Storage から削除するために URL を取得
    const { data: relatedVideos } = await adminSupabase
      .from('videos')
      .select('id, file_url')
      .eq('course_id', courseId);

    // Storage から動画ファイル本体を削除（失敗してもDB削除は続行）
    if (relatedVideos && relatedVideos.length > 0) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
      const publicPrefix = `${supabaseUrl}/storage/v1/object/public/videos/`;
      const signedPrefix = `${supabaseUrl}/storage/v1/object/sign/videos/`;

      const paths = relatedVideos
        .map((v: { file_url: string | null }) => {
          if (!v.file_url) return null;
          if (v.file_url.startsWith(publicPrefix)) return v.file_url.slice(publicPrefix.length);
          if (v.file_url.startsWith(signedPrefix)) return v.file_url.slice(signedPrefix.length).split('?')[0];
          return null;
        })
        .filter((p): p is string => !!p);

      if (paths.length > 0) {
        const { error: storageError } = await adminSupabase.storage.from('videos').remove(paths);
        if (storageError) {
          console.warn('Storage cleanup warning:', storageError.message);
        }
      }
    }

    // コースを物理削除（ON DELETE CASCADE で videos / user_courses / video_view_logs 等も自動削除）
    const { data, error } = await adminSupabase
      .from('courses')
      .delete()
      .eq('id', courseId)
      .select()
      .single();

    if (error) {
      console.error('Error deleting course:', error);
      return NextResponse.json(
        { error: `コースの削除に失敗しました: ${error.message}` },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json({ error: '対象のコースが見つかりません' }, { status: 404 });
    }

    return NextResponse.json({
      message: 'コースが削除されました',
      course: data,
      deletedVideoCount: relatedVideos?.length ?? 0,
    });
  } catch (error) {
    console.error('Error in DELETE /api/courses/[id]:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}