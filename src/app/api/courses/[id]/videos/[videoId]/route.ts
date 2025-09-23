import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

// Upload configuration for large files
export const maxDuration = 600; // 10 minutes timeout for large uploads
export const runtime = 'nodejs';
export const preferredRegion = 'auto';
export const dynamic = 'force-dynamic';

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; videoId: string }> }
) {
  try {
    const { id: courseId, videoId } = await params;
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);
    const adminSupabase = createAdminSupabaseClient();

    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 講師または管理者権限チェック
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || !['instructor', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: '講師または管理者権限が必要です' }, { status: 403 });
    }

    // FormDataの処理
    const formData = await request.formData();
    const videoFile = formData.get('video') as File;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const duration = parseInt(formData.get('duration') as string);
    const orderIndex = parseInt(formData.get('order_index') as string);

    if (!videoFile) {
      return NextResponse.json({ error: '動画ファイルが必要です' }, { status: 400 });
    }

    // ファイルサイズチェック（3GB制限）
    const maxFileSize = 3 * 1024 * 1024 * 1024; // 3GB
    if (videoFile.size > maxFileSize) {
      return NextResponse.json({ error: 'ファイルサイズが3GBを超えています' }, { status: 400 });
    }

    // 既存の動画情報を取得
    const { data: existingVideo, error: fetchError } = await supabase
      .from('videos')
      .select('file_url')
      .eq('id', videoId)
      .eq('course_id', parseInt(courseId))
      .single();

    if (fetchError || !existingVideo) {
      return NextResponse.json({ error: '動画が見つかりません' }, { status: 404 });
    }

    // 既存のファイルを削除
    if (existingVideo.file_url) {
      const urlParts = existingVideo.file_url.split('/storage/v1/object/public/videos/');
      if (urlParts.length > 1) {
        const oldPath = urlParts[1];
        try {
          await adminSupabase.storage.from('videos').remove([oldPath]);
        } catch (deleteError) {
          console.warn('Failed to delete old video:', deleteError);
        }
      }
    }

    // 新しい動画ファイルのアップロード（エラーハンドリング改善）
    const videoFileName = `${Date.now()}-${videoFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const videoPath = `course-${courseId}/${videoFileName}`;

    let videoUploadError = null;
    let videoUpload = null;
    
    try {
      // ファイルをArrayBufferに変換
      const buffer = await videoFile.arrayBuffer();
      
      // アップロード実行
      const uploadResult = await adminSupabase.storage
        .from('videos')
        .upload(videoPath, buffer, {
          contentType: videoFile.type,
          cacheControl: '3600',
          upsert: false
        });
      
      videoUpload = uploadResult.data;
      videoUploadError = uploadResult.error;

      if (videoUploadError) {
        console.error('Error uploading video:', videoUploadError);
        if (videoUploadError.message?.includes('exceeded the maximum allowed size')) {
          return NextResponse.json({ error: 'ファイルサイズが大きすぎます。3GB以下のファイルを選択してください。' }, { status: 413 });
        }
        return NextResponse.json({ error: `動画のアップロードに失敗しました: ${videoUploadError.message}` }, { status: 500 });
      }
    } catch (uploadError: any) {
      console.error('Upload processing error:', uploadError);
      
      if (uploadError.message?.includes('heap out of memory')) {
        return NextResponse.json({ error: 'ファイルサイズが大きすぎて処理できません' }, { status: 507 });
      }
      
      return NextResponse.json({ error: 'ファイルの処理中にエラーが発生しました' }, { status: 500 });
    }

    // 動画URLの生成
    const { data: videoUrl } = adminSupabase.storage
      .from('videos')
      .getPublicUrl(videoPath);

    // データベースの動画情報を更新
    const updateData: any = {
      file_url: videoUrl.publicUrl,
      file_size: videoFile.size,
      mime_type: videoFile.type,
      updated_at: new Date().toISOString()
    };

    // オプショナルフィールドの更新
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (!isNaN(duration)) updateData.duration = duration;
    if (!isNaN(orderIndex)) updateData.order_index = orderIndex;

    const { data: updatedVideo, error: updateError } = await supabase
      .from('videos')
      .update(updateData)
      .eq('id', videoId)
      .eq('course_id', parseInt(courseId))
      .select()
      .single();

    if (updateError) {
      console.error('Error updating video record:', updateError);
      // アップロードしたファイルを削除
      await adminSupabase.storage.from('videos').remove([videoPath]);
      return NextResponse.json({ error: '動画情報の更新に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      message: '動画が正常に置き換えられました',
      video: updatedVideo
    });
  } catch (error) {
    console.error('Error in PUT /api/courses/[id]/videos/[videoId]:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; videoId: string }> }
) {
  try {
    const { id: courseId, videoId } = await params;
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);
    const adminSupabase = createAdminSupabaseClient();

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 講師または管理者権限チェック
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || !['instructor', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: '講師または管理者権限が必要です' }, { status: 403 });
    }

    // 動画情報を取得
    const { data: video, error: fetchError } = await supabase
      .from('videos')
      .select('file_url, thumbnail_url')
      .eq('id', videoId)
      .eq('course_id', parseInt(courseId))
      .single();

    if (fetchError || !video) {
      return NextResponse.json({ error: '動画が見つかりません' }, { status: 404 });
    }

    // ストレージから動画ファイルを削除
    if (video.file_url) {
      const urlParts = video.file_url.split('/storage/v1/object/public/videos/');
      if (urlParts.length > 1) {
        const videoPath = urlParts[1];
        try {
          await adminSupabase.storage.from('videos').remove([videoPath]);
        } catch (deleteError) {
          console.warn('Failed to delete video file:', deleteError);
        }
      }
    }

    // サムネイルがある場合は削除
    if (video.thumbnail_url) {
      const urlParts = video.thumbnail_url.split('/storage/v1/object/public/thumbnails/');
      if (urlParts.length > 1) {
        const thumbnailPath = urlParts[1];
        try {
          await adminSupabase.storage.from('thumbnails').remove([thumbnailPath]);
        } catch (deleteError) {
          console.warn('Failed to delete thumbnail:', deleteError);
        }
      }
    }

    // データベースから動画レコードを削除
    const { error: deleteError } = await supabase
      .from('videos')
      .delete()
      .eq('id', videoId)
      .eq('course_id', parseInt(courseId));

    if (deleteError) {
      console.error('Error deleting video record:', deleteError);
      return NextResponse.json({ error: '動画の削除に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      message: '動画が正常に削除されました'
    });
  } catch (error) {
    console.error('Error in DELETE /api/courses/[id]/videos/[videoId]:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}