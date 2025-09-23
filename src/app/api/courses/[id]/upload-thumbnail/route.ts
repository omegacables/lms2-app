import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // paramsをawait
    const { id: courseId } = await params;
    
    // Service Role Keyを使用してSupabase Adminクライアントを作成
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Authorizationヘッダーから認証
    const authHeader = request.headers.get('authorization');
    console.log('Auth header present:', !!authHeader);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      console.error('Authentication failed:', userError);
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }
    
    // 権限チェック（Admin clientを使用）
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    console.log('User profile check:', { 
      userId: user.id, 
      profile: userProfile, 
      error: profileError,
      role: userProfile?.role,
      roleType: typeof userProfile?.role,
      isInstructor: userProfile?.role === 'instructor',
      isAdmin: userProfile?.role === 'admin'
    });

    if (profileError) {
      console.error('Profile fetch error:', profileError);
      return NextResponse.json({ error: 'プロフィール情報の取得に失敗しました' }, { status: 500 });
    }

    // roleフィールドの値を正確にチェック
    const userRole = userProfile?.role?.trim().toLowerCase();
    const hasPermission = userRole === 'instructor' || userRole === 'admin';
    
    console.log('Permission check:', {
      userRole,
      hasPermission,
      originalRole: userProfile?.role
    });

    if (!userProfile || !hasPermission) {
      console.error('Insufficient permissions:', { 
        hasProfile: !!userProfile, 
        role: userProfile?.role,
        normalizedRole: userRole,
        requiredRoles: ['instructor', 'admin']
      });
      return NextResponse.json({ error: '権限がありません。管理者または講師権限が必要です。' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: 'ファイルが選択されていません' }, { status: 400 });
    }

    // ファイルタイプチェック
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: 'サポートされていない画像形式です' }, { status: 400 });
    }

    // ファイルサイズチェック（5MB）
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'ファイルサイズは5MB以下にしてください' }, { status: 400 });
    }

    // ファイル名生成
    const fileExt = file.name.split('.').pop();
    const fileName = `course-${courseId}-${Date.now()}.${fileExt}`;
    
    // ArrayBufferに変換
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Supabase Storageにアップロード（Admin clientを使用）
    const { data: uploadData, error: uploadError } = await supabaseAdmin.storage
      .from('course-thumbnails')
      .upload(fileName, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: true
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // 公開URLを取得
    const { data: urlData } = supabaseAdmin.storage
      .from('course-thumbnails')
      .getPublicUrl(fileName);

    // コースのサムネイルURLを更新（Admin clientを使用）
    const { error: updateError } = await supabaseAdmin
      .from('courses')
      .update({
        thumbnail_url: urlData.publicUrl,
        thumbnail_file_path: fileName,
        updated_at: new Date().toISOString()
      })
      .eq('id', courseId);

    if (updateError) {
      console.error('Course update error:', updateError);
      // アップロードしたファイルを削除
      await supabaseAdmin.storage.from('course-thumbnails').remove([fileName]);
      return NextResponse.json({ error: 'コース情報の更新に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
      filePath: fileName
    });

  } catch (error) {
    console.error('Upload thumbnail error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'サムネイルのアップロードに失敗しました' 
    }, { status: 500 });
  }
}