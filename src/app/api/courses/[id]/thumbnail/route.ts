import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = cookies();
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

    // FormDataの処理
    const formData = await request.formData();
    const thumbnailFile = formData.get('thumbnail') as File;

    if (!thumbnailFile) {
      return NextResponse.json({ error: 'サムネイル画像が必要です' }, { status: 400 });
    }

    // ファイルタイプチェック
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedImageTypes.includes(thumbnailFile.type)) {
      return NextResponse.json({ error: 'サポートされていない画像形式です' }, { status: 400 });
    }

    // ファイルサイズチェック（10MB制限）
    const maxFileSize = 10 * 1024 * 1024; // 10MB
    if (thumbnailFile.size > maxFileSize) {
      return NextResponse.json({ error: 'ファイルサイズが10MBを超えています' }, { status: 400 });
    }

    // 既存のサムネイルを削除（該当する場合）
    const { data: currentCourse } = await supabase
      .from('courses')
      .select('thumbnail_url')
      .eq('id', params.id)
      .single();

    // サムネイルファイルのアップロード
    const thumbnailFileName = `course-${params.id}-${Date.now()}.${thumbnailFile.name.split('.').pop()}`;
    const thumbnailPath = `course-thumbnails/${thumbnailFileName}`;

    const { data: thumbnailUpload, error: thumbnailUploadError } = await adminSupabase.storage
      .from('thumbnails')
      .upload(thumbnailPath, thumbnailFile, {
        cacheControl: '3600',
        upsert: true
      });

    if (thumbnailUploadError) {
      console.error('Error uploading thumbnail:', thumbnailUploadError);
      return NextResponse.json({ error: 'サムネイルのアップロードに失敗しました' }, { status: 500 });
    }

    // サムネイルURLの生成
    const { data: thumbnailUrl } = adminSupabase.storage
      .from('thumbnails')
      .getPublicUrl(thumbnailPath);

    // データベースでコースのサムネイルURLを更新
    const { data: course, error: dbError } = await supabase
      .from('courses')
      .update({
        thumbnail_url: thumbnailUrl.publicUrl,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();

    if (dbError) {
      console.error('Error updating course thumbnail:', dbError);
      // アップロードしたファイルを削除
      await adminSupabase.storage.from('thumbnails').remove([thumbnailPath]);
      return NextResponse.json({ error: 'サムネイル情報の保存に失敗しました' }, { status: 500 });
    }

    // 古いサムネイルを削除（新しいアップロード成功後）
    if (currentCourse?.thumbnail_url) {
      try {
        const oldPath = currentCourse.thumbnail_url.split('/').pop();
        if (oldPath && oldPath !== thumbnailFileName) {
          await adminSupabase.storage.from('thumbnails').remove([`course-thumbnails/${oldPath}`]);
        }
      } catch (cleanupError) {
        // 古いファイルの削除に失敗しても処理を続行
        console.warn('Failed to cleanup old thumbnail:', cleanupError);
      }
    }

    return NextResponse.json({
      message: 'サムネイルが正常にアップロードされました',
      thumbnail_url: thumbnailUrl.publicUrl,
      course: course
    });
  } catch (error) {
    console.error('Error in POST /api/courses/[id]/thumbnail:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = cookies();
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

    // 現在のサムネイルURLを取得
    const { data: currentCourse } = await supabase
      .from('courses')
      .select('thumbnail_url')
      .eq('id', params.id)
      .single();

    if (!currentCourse?.thumbnail_url) {
      return NextResponse.json({ error: '削除するサムネイルがありません' }, { status: 404 });
    }

    // データベースからサムネイルURLを削除
    const { data: course, error: dbError } = await supabase
      .from('courses')
      .update({
        thumbnail_url: null,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();

    if (dbError) {
      console.error('Error removing thumbnail from course:', dbError);
      return NextResponse.json({ error: 'サムネイルの削除に失敗しました' }, { status: 500 });
    }

    // ストレージからファイルを削除
    try {
      const fileName = currentCourse.thumbnail_url.split('/').pop();
      if (fileName) {
        await adminSupabase.storage
          .from('thumbnails')
          .remove([`course-thumbnails/${fileName}`]);
      }
    } catch (storageError) {
      // ストレージからの削除に失敗してもデータベースは更新済み
      console.warn('Failed to remove thumbnail from storage:', storageError);
    }

    return NextResponse.json({
      message: 'サムネイルが削除されました',
      course: course
    });
  } catch (error) {
    console.error('Error in DELETE /api/courses/[id]/thumbnail:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}