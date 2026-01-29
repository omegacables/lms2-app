import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export const maxDuration = 60;
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);
    const adminSupabase = createAdminSupabaseClient();

    // 認証チェック（Authorization ヘッダーから）
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 管理者権限チェック（Admin クライアントを使用して RLS をバイパス）
    const { data: userProfile, error: profileError } = await adminSupabase
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    console.log('User ID:', user.id);
    console.log('User Profile:', userProfile);
    console.log('Profile Error:', profileError);

    if (profileError || !userProfile) {
      return NextResponse.json({
        error: 'ユーザープロファイルが見つかりません',
        debug: { userId: user.id, profileError }
      }, { status: 403 });
    }

    if (userProfile.role !== 'admin') {
      return NextResponse.json({
        error: '管理者権限が必要です',
        debug: { userId: user.id, role: userProfile.role }
      }, { status: 403 });
    }

    const { fileName, contentType, courseId } = await request.json();

    if (!fileName || !contentType || !courseId) {
      return NextResponse.json({ error: '必須パラメータが不足しています' }, { status: 400 });
    }

    // ファイル名を安全な形式に変換
    const safeFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const timestamp = Date.now();
    const filePath = `course-${courseId}/${timestamp}-${safeFileName}`;

    // 署名付きアップロード URL を生成
    const { data: uploadData, error: uploadError } = await adminSupabase.storage
      .from('videos')
      .createSignedUploadUrl(filePath);

    if (uploadError) {
      console.error('Error creating signed upload URL:', uploadError);
      return NextResponse.json({
        error: `署名付きURLの生成に失敗しました: ${uploadError.message}`
      }, { status: 500 });
    }

    // 公開URLを生成
    const { data: { publicUrl } } = adminSupabase.storage
      .from('videos')
      .getPublicUrl(filePath);

    return NextResponse.json({
      signedUrl: uploadData.signedUrl,
      token: uploadData.token,
      path: filePath,
      publicUrl: publicUrl
    });
  } catch (error) {
    console.error('Error in POST /api/videos/get-upload-url:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
