import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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

    if (!userProfile || userProfile.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    // ユーザー詳細を取得
    const { data: targetUser, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', params.id)
      .single();

    if (error || !targetUser) {
      return NextResponse.json({ error: 'ユーザーが見つかりません' }, { status: 404 });
    }

    // ユーザーの学習統計を取得
    const { data: learningData } = await supabase
      .from('video_view_logs')
      .select(`
        status,
        progress_percent,
        total_watched_time,
        video_id,
        course_id,
        completed_at
      `)
      .eq('user_id', params.id);

    // コース割り当て情報を取得
    const { data: courseAssignments } = await supabase
      .from('user_courses')
      .select(`
        *,
        courses!inner(
          id,
          title,
          category,
          difficulty_level
        )
      `)
      .eq('user_id', params.id);

    // 証明書情報を取得
    const { data: certificates } = await supabase
      .from('certificates')
      .select('*')
      .eq('user_id', params.id)
      .eq('is_active', true);

    // 学習統計を計算
    const learningStats = {
      total_videos: learningData?.length || 0,
      completed_videos: learningData?.filter(l => l.status === 'completed').length || 0,
      in_progress_videos: learningData?.filter(l => l.status === 'in_progress').length || 0,
      total_watch_time: learningData?.reduce((sum, l) => sum + (l.total_watched_time || 0), 0) || 0,
      average_progress: learningData?.length > 0 
        ? Math.round(learningData.reduce((sum, l) => sum + l.progress_percent, 0) / learningData.length)
        : 0
    };

    return NextResponse.json({
      user: targetUser,
      learning_stats: learningStats,
      course_assignments: courseAssignments || [],
      certificates: certificates || []
    });
  } catch (error) {
    console.error('Error in GET /api/admin/users/[id]:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
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

    if (!userProfile || userProfile.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const body = await request.json();
    const { display_name, company, department, role, is_active } = body;

    // ユーザープロフィールを更新
    const { data: updatedUser, error } = await supabase
      .from('user_profiles')
      .update({
        display_name,
        company,
        department,
        role,
        is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating user:', error);
      return NextResponse.json({ error: 'ユーザー情報の更新に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'ユーザー情報が更新されました',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error in PUT /api/admin/users/[id]:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);
    const adminSupabase = createAdminSupabaseClient();

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

    if (!userProfile || userProfile.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    // 自分自身は削除できない
    if (params.id === user.id) {
      return NextResponse.json({ error: '自分自身を削除することはできません' }, { status: 400 });
    }

    // ユーザーを論理削除（非アクティブ化）
    const { data: updatedUser, error: profileError } = await supabase
      .from('user_profiles')
      .update({
        is_active: false,
        updated_at: new Date().toISOString()
      })
      .eq('id', params.id)
      .select()
      .single();

    if (profileError) {
      console.error('Error deactivating user:', profileError);
      return NextResponse.json({ error: 'ユーザーの無効化に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'ユーザーが無効化されました',
      user: updatedUser
    });
  } catch (error) {
    console.error('Error in DELETE /api/admin/users/[id]:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}