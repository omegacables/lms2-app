import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/database/supabase';

export const runtime = 'nodejs';
export const maxDuration = 60; // 最大60秒の実行時間

export async function POST(request: NextRequest) {
  try {
    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: '認証が必要です' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);

    // フォームデータを取得
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const courseId = formData.get('courseId') as string;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const orderIndex = formData.get('orderIndex') as string;
    const duration = formData.get('duration') as string;

    if (!file || !courseId || !title) {
      return NextResponse.json(
        { error: '必須パラメータが不足しています' },
        { status: 400 }
      );
    }

    // ファイルサイズチェック（3GB）
    const MAX_SIZE = 3000 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'ファイルサイズが大きすぎます（最大3GB）' },
        { status: 413 }
      );
    }

    // ファイルをArrayBufferに変換
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // ファイル名を安全な形式に変換
    const timestamp = Date.now();
    const safeFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filePath = `course_${courseId}/${timestamp}_${safeFileName}`;

    console.log('APIルートでアップロード開始:', {
      fileName: file.name,
      fileSize: file.size,
      filePath: filePath
    });

    // Supabaseストレージにアップロード
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('videos')
      .upload(filePath, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false,
      });

    if (uploadError) {
      console.error('ストレージエラー:', uploadError);
      return NextResponse.json(
        { error: `アップロードエラー: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // 公開URLを取得
    const { data: { publicUrl } } = supabase.storage
      .from('videos')
      .getPublicUrl(filePath);

    // データベースに動画情報を保存
    const videoData = {
      course_id: parseInt(courseId),
      title: title.trim(),
      description: description?.trim() || null,
      file_url: publicUrl,
      file_path: filePath,
      file_size: file.size,
      mime_type: file.type,
      duration: parseInt(duration) || 0,
      order_index: parseInt(orderIndex) || 1,
      status: 'active' as const,
      metadata: {
        originalName: file.name,
        uploadedAt: new Date().toISOString(),
      }
    };

    const { data: insertedVideo, error: dbError } = await supabase
      .from('videos')
      .insert(videoData)
      .select()
      .single();

    if (dbError) {
      console.error('データベースエラー:', dbError);
      // エラー時はアップロードしたファイルを削除
      await supabase.storage.from('videos').remove([filePath]);
      return NextResponse.json(
        { error: `データベースエラー: ${dbError.message}` },
        { status: 500 }
      );
    }

    console.log('アップロード成功:', insertedVideo);

    return NextResponse.json({
      success: true,
      video: insertedVideo,
      message: '動画がアップロードされました'
    });

  } catch (error) {
    console.error('APIエラー:', error);
    return NextResponse.json(
      { error: 'サーバーエラーが発生しました' },
      { status: 500 }
    );
  }
}