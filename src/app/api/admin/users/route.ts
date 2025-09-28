import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url);
    const search = searchParams.get('search');
    const role = searchParams.get('role');
    const isActive = searchParams.get('is_active');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('user_profiles')
      .select(`
        id,
        display_name,
        company,
        department,
        role,
        avatar_url,
        last_login_at,
        is_active,
        created_at,
        updated_at
      `)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (search) {
      query = query.or(`display_name.ilike.%${search}%,company.ilike.%${search}%,department.ilike.%${search}%`);
    }

    if (role) {
      query = query.eq('role', role);
    }

    if (isActive !== null) {
      query = query.eq('is_active', isActive === 'true');
    }

    const { data: users, error } = await query;

    if (error) {
      console.error('Error fetching users:', error);
      return NextResponse.json({ error: 'ユーザー情報の取得に失敗しました' }, { status: 500 });
    }

    // 各ユーザーの学習統計を取得
    const userIds = users.map(u => u.id);
    let learningStats = [];

    if (userIds.length > 0) {
      const { data: statsData } = await supabase
        .from('video_view_logs')
        .select(`
          user_id,
          status
        `)
        .in('user_id', userIds);

      // ユーザー別の統計を計算
      const statsByUser = statsData?.reduce((acc: any, log: any) => {
        if (!acc[log.user_id]) {
          acc[log.user_id] = {
            total_videos: 0,
            completed_videos: 0,
            in_progress_videos: 0
          };
        }
        acc[log.user_id].total_videos++;
        if (log.status === 'completed') {
          acc[log.user_id].completed_videos++;
        } else if (log.status === 'in_progress') {
          acc[log.user_id].in_progress_videos++;
        }
        return acc;
      }, {});

      learningStats = statsByUser || {};
    }

    // ユーザーに統計を追加
    const usersWithStats = users.map(user => ({
      ...user,
      learning_stats: learningStats[user.id] || {
        total_videos: 0,
        completed_videos: 0,
        in_progress_videos: 0
      }
    }));

    return NextResponse.json({
      users: usersWithStats,
      pagination: {
        offset,
        limit,
        has_more: users.length === limit
      }
    });
  } catch (error) {
    console.error('Error in GET /api/admin/users:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
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

    const body = await request.json();
    const { email, password, display_name, company, department, role = 'student' } = body;

    if (!email || !password) {
      return NextResponse.json({ error: 'メールアドレスとパスワードは必須です' }, { status: 400 });
    }

    // ユーザーを作成
    const { data: newUser, error: createError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      user_metadata: {
        display_name
      },
      email_confirm: true
    });

    if (createError) {
      console.error('Error creating user:', createError);
      return NextResponse.json({ error: 'ユーザーの作成に失敗しました' }, { status: 500 });
    }

    // プロフィール情報を更新
    const { error: profileError } = await supabase
      .from('user_profiles')
      .update({
        display_name,
        company,
        department,
        role
      })
      .eq('id', newUser.user?.id);

    if (profileError) {
      console.error('Error updating user profile:', profileError);
      // ユーザー作成は成功したが、プロフィール更新に失敗
      return NextResponse.json({ 
        error: 'ユーザーは作成されましたが、プロフィール情報の設定に失敗しました',
        user_id: newUser.user?.id 
      }, { status: 207 });
    }

    return NextResponse.json({
      message: 'ユーザーが正常に作成されました',
      user: {
        id: newUser.user?.id,
        email: newUser.user?.email,
        display_name,
        company,
        department,
        role
      }
    });
  } catch (error) {
    console.error('Error in POST /api/admin/users:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}