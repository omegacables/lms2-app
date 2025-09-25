import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

// Upload configuration for large files
export const maxDuration = 600; // 10 minutes timeout for large uploads
export const runtime = 'nodejs';
export const preferredRegion = 'auto';
export const dynamic = 'force-dynamic';

// Next.js 13+ API route config for large file uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '500mb',
    },
  },
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // コースの動画一覧を取得
    const { data: videos, error } = await supabase
      .from('videos')
      .select('*')
      .eq('course_id', id)
      .order('order_index', { ascending: true });

    if (error) {
      console.error('Error fetching videos:', error);
      return NextResponse.json({ error: '動画情報の取得に失敗しました' }, { status: 500 });
    }

    return NextResponse.json(videos);
  } catch (error) {
    console.error('Error in GET /api/courses/[id]/videos:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('=== VIDEO UPLOAD API CALLED ===');

  try {
    const { id: courseId } = await params;
    const cookieStore = await cookies();

    // Log cookies for debugging
    const allCookies = cookieStore.getAll();
    console.log('Cookies present:', allCookies.map(c => c.name));

    const supabase = createServerSupabaseClient(cookieStore);
    const adminSupabase = createAdminSupabaseClient();

    // 認証チェック - まずセッションから、次にAuthorizationヘッダーから
    let user = null;

    // セッションから認証を試みる
    const { data: { user: sessionUser }, error: sessionError } = await supabase.auth.getUser();
    console.log('Session user check:', { sessionUser, sessionError });

    if (!sessionUser) {
      // Authorizationヘッダーから認証を試みる
      const authHeader = request.headers.get('authorization');
      console.log('Authorization header:', authHeader);

      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user: tokenUser }, error: tokenError } = await supabase.auth.getUser(token);
        console.log('Token user check:', { tokenUser, tokenError });
        if (tokenUser) {
          user = tokenUser;
        }
      }
    } else {
      user = sessionUser;
    }

    if (!user) {
      console.log('No user found - returning 401');
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    console.log('Authenticated user:', { id: user.id, email: user.email });

    // 講師または管理者権限チェック
    const { data: userProfile, error: profileError } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    console.log('User profile check:', { userProfile, profileError });

    // 権限チェックを一時的に無効化
    // TODO: 本番環境では必ず有効にすること
    /*
    if (!userProfile || !['instructor', 'admin'].includes(userProfile.role)) {
      console.log('Insufficient permissions:', { userRole: userProfile?.role });
      return NextResponse.json({ error: '講師または管理者権限が必要です' }, { status: 403 });
    }
    */

    console.log('Permission check bypassed for development');

    // FormDataの処理
    const formData = await request.formData();
    const videoFile = formData.get('video') as File;
    const thumbnailFile = formData.get('thumbnail') as File | null;
    const title = formData.get('title') as string;
    const description = formData.get('description') as string;
    const duration = parseInt(formData.get('duration') as string);
    const orderIndex = parseInt(formData.get('order_index') as string) || 0;

    if (!videoFile || !title) {
      return NextResponse.json({ error: '動画ファイルとタイトルは必須です' }, { status: 400 });
    }

    // ファイルサイズチェック（3GB制限）
    const maxFileSize = 3 * 1024 * 1024 * 1024; // 3GB
    if (videoFile.size > maxFileSize) {
      return NextResponse.json({ error: 'ファイルサイズが3GBを超えています' }, { status: 400 });
    }

    // ファイル拡張子チェック
    const allowedVideoTypes = ['video/mp4', 'video/webm', 'video/quicktime'];
    if (!allowedVideoTypes.includes(videoFile.type)) {
      return NextResponse.json({ error: 'サポートされていない動画形式です' }, { status: 400 });
    }

    // 動画ファイルのアップロード（エラーハンドリング改善）
    const videoFileName = `${Date.now()}-${videoFile.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const videoPath = `course-${courseId}/${videoFileName}`;

    let videoUploadError = null;
    let videoUpload = null;
    
    console.log(`Starting video upload: ${videoFileName}, size: ${videoFile.size} bytes`);
    
    try {
      // ファイルをArrayBufferに変換（メモリ効率を考慮）
      const buffer = await videoFile.arrayBuffer();
      console.log('File converted to buffer successfully');
      
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
      
      if (videoUpload) {
        console.log('Video uploaded successfully to storage');
      }

      if (videoUploadError) {
        console.error('Error uploading video:', videoUploadError);
        
        // エラーの詳細に基づいてユーザーフレンドリーなメッセージを返す
        if (videoUploadError.message?.includes('exceeded the maximum allowed size')) {
          return NextResponse.json({ 
            error: 'ファイルサイズが大きすぎます。3GB以下のファイルを選択してください。' 
          }, { status: 413 });
        } else if (videoUploadError.message?.includes('timeout')) {
          return NextResponse.json({ 
            error: 'アップロードがタイムアウトしました。ネットワーク接続を確認して再度お試しください。' 
          }, { status: 408 });
        } else if (videoUploadError.message?.includes('Bucket not found')) {
          return NextResponse.json({ 
            error: 'ストレージの設定に問題があります。管理者に連絡してください。' 
          }, { status: 500 });
        }
        
        return NextResponse.json({ 
          error: `動画のアップロードに失敗しました: ${videoUploadError.message}` 
        }, { status: 500 });
      }
    } catch (uploadError: any) {
      console.error('Upload processing error:', uploadError);
      
      // メモリ不足の場合
      if (uploadError.message?.includes('heap out of memory') || uploadError.message?.includes('Array buffer allocation failed')) {
        return NextResponse.json({ 
          error: 'ファイルサイズが大きすぎて処理できません。より小さいファイルをお試しください。' 
        }, { status: 507 });
      }
      
      return NextResponse.json({ 
        error: 'ファイルの処理中にエラーが発生しました。ファイルが破損していないか確認してください。' 
      }, { status: 500 });
    }

    // 動画URLの生成
    const { data: videoUrl } = adminSupabase.storage
      .from('videos')
      .getPublicUrl(videoPath);

    let thumbnailUrl = null;

    // サムネイルがある場合のアップロード
    if (thumbnailFile) {
      const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (allowedImageTypes.includes(thumbnailFile.type)) {
        const thumbnailFileName = `${Date.now()}-${thumbnailFile.name}`;
        const thumbnailPath = `course-${courseId}/${thumbnailFileName}`;

        const { data: thumbnailUpload, error: thumbnailUploadError } = await adminSupabase.storage
          .from('thumbnails')
          .upload(thumbnailPath, thumbnailFile, {
            cacheControl: '3600',
            upsert: false
          });

        if (!thumbnailUploadError) {
          const { data: thumbUrl } = adminSupabase.storage
            .from('thumbnails')
            .getPublicUrl(thumbnailPath);
          thumbnailUrl = thumbUrl.publicUrl;
        }
      }
    }

    // データベースに動画情報を保存
    console.log('Saving video information to database...');
    const { data: video, error: dbError } = await supabase
      .from('videos')
      .insert({
        course_id: parseInt(courseId),
        title,
        description,
        file_url: videoUrl.publicUrl,
        duration,
        file_size: videoFile.size,
        mime_type: videoFile.type,
        thumbnail_url: thumbnailUrl,
        order_index: orderIndex,
        status: 'active'
      })
      .select()
      .single();

    if (dbError) {
      console.error('Error saving video to database:', dbError);
      // アップロードしたファイルを削除
      await adminSupabase.storage.from('videos').remove([videoPath]);
      if (thumbnailUrl) {
        await adminSupabase.storage.from('thumbnails').remove([`course-${courseId}/${thumbnailFileName}`]);
      }
      return NextResponse.json({ error: '動画情報の保存に失敗しました' }, { status: 500 });
    }
    
    console.log('Video information saved successfully to database');

    return NextResponse.json({
      message: '動画が正常にアップロードされました',
      video: video
    });
  } catch (error) {
    console.error('Error in POST /api/courses/[id]/videos:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}


export async function PATCH(
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

    // 権限チェックを一時的に無効化
    // TODO: 本番環境では必ず有効にすること
    /*
    const { data: userProfile } = await supabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (!userProfile || !['instructor', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: '講師または管理者権限が必要です' }, { status: 403 });
    }
    */

    const body = await request.json();
    const { videoUpdates } = body;

    if (!Array.isArray(videoUpdates)) {
      return NextResponse.json({ error: 'Invalid video updates format' }, { status: 400 });
    }

    // 動画の順序を一括更新
    const updates = videoUpdates.map((update: any) => {
      return supabase
        .from('videos')
        .update({
          order_index: update.order_index,
          updated_at: new Date().toISOString()
        })
        .eq('id', update.id)
        .eq('course_id', courseId);
    });

    await Promise.all(updates);

    return NextResponse.json({
      message: '動画の順序が更新されました'
    });
  } catch (error) {
    console.error('Error in PATCH /api/courses/[id]/videos:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}