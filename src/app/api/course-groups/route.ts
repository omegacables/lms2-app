import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    let supabase = createServerSupabaseClient(cookieStore);

    // Authorizationヘッダーからトークンを取得
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      });
    }

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('Auth error:', authError);
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const includeItems = searchParams.get('include_items') === 'true';

    // 管理者用クライアントでRLSをバイパス
    const adminSupabase = createAdminSupabaseClient();

    if (includeItems) {
      // グループとアイテムを一緒に取得
      const { data: groups, error } = await adminSupabase
        .from('course_groups')
        .select(`
          *,
          items:course_group_items(
            *,
            course:courses(*)
          )
        `)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching groups with items:', error);
        return NextResponse.json({ error: 'グループ情報の取得に失敗しました' }, { status: 500 });
      }

      return NextResponse.json({ groups });
    } else {
      // グループのみ取得
      const { data: groups, error } = await adminSupabase
        .from('course_groups')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching groups:', error);
        return NextResponse.json({ error: 'グループ情報の取得に失敗しました' }, { status: 500 });
      }

      return NextResponse.json({ groups });
    }

  } catch (error) {
    console.error('Error in GET /api/course-groups:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    let supabase = createServerSupabaseClient(cookieStore);

    // Authorizationヘッダーからトークンを取得
    const authHeader = request.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      });
    }

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

    if (!userProfile || !['instructor', 'admin'].includes(userProfile.role)) {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    const body = await request.json();
    const { title, description, is_sequential = true } = body;

    if (!title) {
      return NextResponse.json({ error: 'タイトルは必須です' }, { status: 400 });
    }

    // グループを作成
    const adminSupabase = createAdminSupabaseClient();
    const { data: group, error } = await adminSupabase
      .from('course_groups')
      .insert({
        title,
        description,
        is_sequential,
        created_by: user.id
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating group:', error);
      return NextResponse.json({ error: 'グループの作成に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ group, message: 'グループが作成されました' });

  } catch (error) {
    console.error('Error in POST /api/course-groups:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
