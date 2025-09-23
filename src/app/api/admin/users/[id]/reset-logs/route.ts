import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const targetUserId = params.id;
    
    // Service Role Keyを使用してSupabase Adminクライアントを作成
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // リクエストを送信したユーザーの権限を確認
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    
    // トークンから現在のユーザーを取得
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 管理者権限を確認
    const { data: currentUser, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    // オプション: 特定のコースやビデオのみリセット
    const { searchParams } = new URL(request.url);
    const courseId = searchParams.get('course_id');
    const videoId = searchParams.get('video_id');

    let query = supabaseAdmin
      .from('video_view_logs')
      .delete()
      .eq('user_id', targetUserId);

    if (courseId) {
      query = query.eq('course_id', courseId);
    }

    if (videoId) {
      query = query.eq('video_id', videoId);
    }

    const { data, error } = await query.select();

    if (error) {
      console.error('学習ログリセットエラー:', error);
      return NextResponse.json({ error: '学習ログのリセットに失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      message: `${data?.length || 0}件の学習ログを削除しました`
    });

  } catch (error) {
    console.error('学習ログリセットエラー:', error);
    return NextResponse.json({ 
      error: '学習ログのリセットに失敗しました',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}