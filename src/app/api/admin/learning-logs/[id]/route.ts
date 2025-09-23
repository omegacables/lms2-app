import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: logId } = await params;
    
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

    // リクエストボディから更新データを取得
    const body = await request.json();
    const {
      total_watched_time,
      progress_percent,
      status,
      start_time,
      end_time,
      current_position,
      user_name,
      user_email,
      company,
      department,
      course_title,
      video_title
    } = body;

    // まず、ユーザー情報を更新（user_name, user_email, company, departmentが提供された場合）
    if (user_name !== undefined || user_email !== undefined || company !== undefined || department !== undefined) {
      // 現在の学習ログを取得してuser_idを取得
      const { data: logData, error: logError } = await supabaseAdmin
        .from('video_view_logs')
        .select('user_id')
        .eq('id', logId)
        .single();

      if (!logError && logData) {
        // ユーザープロファイルを更新
        const updateProfile: any = {};
        if (user_name !== undefined) updateProfile.display_name = user_name;
        if (user_email !== undefined) updateProfile.email = user_email;
        if (company !== undefined) updateProfile.company = company;
        if (department !== undefined) updateProfile.department = department;

        await supabaseAdmin
          .from('user_profiles')
          .update(updateProfile)
          .eq('id', logData.user_id);
      }
    }

    // コース情報を更新（course_titleが提供された場合）
    if (course_title !== undefined) {
      const { data: logData, error: logError } = await supabaseAdmin
        .from('video_view_logs')
        .select('course_id')
        .eq('id', logId)
        .single();

      if (!logError && logData) {
        await supabaseAdmin
          .from('courses')
          .update({ title: course_title })
          .eq('id', logData.course_id);
      }
    }

    // 動画情報を更新（video_titleが提供された場合）
    if (video_title !== undefined) {
      const { data: logData, error: logError } = await supabaseAdmin
        .from('video_view_logs')
        .select('video_id')
        .eq('id', logId)
        .single();

      if (!logError && logData) {
        await supabaseAdmin
          .from('videos')
          .update({ title: video_title })
          .eq('id', logData.video_id);
      }
    }

    // 学習ログを更新
    const updateData: any = {
      last_updated: new Date().toISOString()
    };

    if (total_watched_time !== undefined) updateData.total_watched_time = total_watched_time;
    if (progress_percent !== undefined) updateData.progress_percent = progress_percent;
    if (status !== undefined) updateData.status = status;
    if (start_time !== undefined) updateData.start_time = start_time;
    if (end_time !== undefined) updateData.end_time = end_time;
    if (current_position !== undefined) updateData.current_position = current_position;

    const { data, error } = await supabaseAdmin
      .from('video_view_logs')
      .update(updateData)
      .eq('id', logId)
      .select()
      .single();

    if (error) {
      console.error('学習ログ更新エラー:', error);
      return NextResponse.json({ error: '学習ログの更新に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      message: '学習ログが更新されました',
      data
    });

  } catch (error) {
    console.error('学習ログ更新エラー:', error);
    return NextResponse.json({ 
      error: '学習ログの更新に失敗しました',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: logId } = await params;
    
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

    // 学習ログを削除
    const { error } = await supabaseAdmin
      .from('video_view_logs')
      .delete()
      .eq('id', logId);

    if (error) {
      console.error('学習ログ削除エラー:', error);
      return NextResponse.json({ error: '学習ログの削除に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ 
      success: true,
      message: '学習ログが削除されました'
    });

  } catch (error) {
    console.error('学習ログ削除エラー:', error);
    return NextResponse.json({ 
      error: '学習ログの削除に失敗しました',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}