import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

// 大きなファイル対応のための設定
export const maxDuration = 600; // 10 minutes
export const runtime = 'nodejs';
export const preferredRegion = 'auto';
export const dynamic = 'force-dynamic';

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
    const courseId = formData.get('courseId') as string;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const duration = formData.get('duration') as string;
    const orderIndex = formData.get('orderIndex') as string;

    if (!videoFile || !courseId || !title) {
      return NextResponse.json({ error: '必須パラメータが不足しています' }, { status: 400 });
    }

    // ファイルサイズチェック（3GB制限）
    const maxFileSize = 3 * 1024 * 1024 * 1024; // 3GB
    if (videoFile.size > maxFileSize) {
      return NextResponse.json({ error: 'ファイルサイズが3GBを超えています' }, { status: 400 });
    }

    // 新しいファイル名を生成
    const safeFileName = videoFile.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const timestamp = Date.now();
    const filePath = `course_${courseId}/${timestamp}_${safeFileName}`;

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

    // データベースに動画情報を保存
    const videoData = {
      course_id: parseInt(courseId),
      title: title.trim(),
      description: description?.trim() || null,
      file_url: publicUrl,
      file_path: filePath,
      file_size: videoFile.size,
      mime_type: videoFile.type,
      duration: parseInt(duration) || 0,
      order_index: parseInt(orderIndex) || 1,
      status: 'active' as const,
      metadata: {
        originalName: videoFile.name,
        uploadedAt: new Date().toISOString(),
        uploadedBy: user.id
      }
    };

    const { data: insertedVideo, error: dbError } = await adminSupabase
      .from('videos')
      .insert(videoData)
      .select()
      .single();

    if (dbError) {
      console.error('Error inserting video record:', dbError);
      // アップロードしたファイルを削除
      await adminSupabase.storage.from('videos').remove([filePath]);
      return NextResponse.json({
        error: `データベースへの保存に失敗しました: ${dbError.message}`
      }, { status: 500 });
    }

    return NextResponse.json({
      message: '動画が正常にアップロードされました',
      video: insertedVideo
    });
  } catch (error: any) {
    console.error('Error in POST /api/videos/upload-video:', error);

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
