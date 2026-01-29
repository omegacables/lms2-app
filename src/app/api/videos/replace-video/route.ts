import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

// 大きなファイル対応のための設定
export const maxDuration = 600; // 10 minutes
export const runtime = 'nodejs';
export const preferredRegion = 'auto';
export const dynamic = 'force-dynamic';

// ボディサイズの制限を緩和（Vercel Proプランなら 4.5MB → 100MB まで可能）
export const bodyParser = false;

export async function POST(request: NextRequest) {
  try {
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

    // 管理者権限チェック
    const { data: userProfile } = await adminSupabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || userProfile.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    // FormDataの処理
    const formData = await request.formData();
    const videoFile = formData.get('video') as File;
    const videoId = formData.get('videoId') as string;
    const courseId = formData.get('courseId') as string;

    if (!videoFile || !videoId || !courseId) {
      return NextResponse.json({ error: '必須パラメータが不足しています' }, { status: 400 });
    }

    // ファイルサイズチェック（3GB制限）
    const maxFileSize = 3 * 1024 * 1024 * 1024; // 3GB
    if (videoFile.size > maxFileSize) {
      return NextResponse.json({ error: 'ファイルサイズが3GBを超えています' }, { status: 400 });
    }

    // 既存の動画情報を取得
    const { data: existingVideo, error: fetchError } = await adminSupabase
      .from('videos')
      .select('file_url')
      .eq('id', videoId)
      .eq('course_id', parseInt(courseId))
      .single();

    if (fetchError || !existingVideo) {
      return NextResponse.json({ error: '動画が見つかりません' }, { status: 404 });
    }

    // 新しいファイル名を生成
    const safeFileName = videoFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const timestamp = Date.now();
    const filePath = `course-${courseId}/${timestamp}-${safeFileName}`;

    // ファイルをArrayBufferに変換してアップロード
    const buffer = await videoFile.arrayBuffer();

    const { data: uploadData, error: uploadError } = await adminSupabase.storage
      .from('videos')
      .upload(filePath, buffer, {
        contentType: videoFile.type,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('Error uploading video:', uploadError);
      return NextResponse.json({
        error: `動画のアップロードに失敗しました: ${uploadError.message}`
      }, { status: 500 });
    }

    // 公開URLを取得
    const { data: { publicUrl } } = adminSupabase.storage
      .from('videos')
      .getPublicUrl(filePath);

    // データベースを更新
    const { error: updateError } = await adminSupabase
      .from('videos')
      .update({
        file_url: publicUrl,
        file_size: videoFile.size,
        mime_type: videoFile.type,
        updated_at: new Date().toISOString()
      })
      .eq('id', videoId);

    if (updateError) {
      console.error('Error updating video record:', updateError);
      // アップロードしたファイルを削除
      await adminSupabase.storage.from('videos').remove([filePath]);
      return NextResponse.json({
        error: '動画情報の更新に失敗しました'
      }, { status: 500 });
    }

    // 古いファイルを削除（エラーが出ても無視）
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

    return NextResponse.json({
      message: '動画が正常に置き換えられました',
      publicUrl
    });
  } catch (error: any) {
    console.error('Error in POST /api/videos/replace-video:', error);

    // メモリエラーの場合
    if (error.message?.includes('heap out of memory')) {
      return NextResponse.json({
        error: 'ファイルサイズが大きすぎて処理できません。500MB以下のファイルを使用してください。'
      }, { status: 507 });
    }

    return NextResponse.json({
      error: 'サーバーエラーが発生しました'
    }, { status: 500 });
  }
}
