import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient, createAdminSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

async function getAuthenticatedClient(request: NextRequest) {
  const cookieStore = await cookies();
  let supabase = createServerSupabaseClient(cookieStore);

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

  return supabase;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const groupId = parseInt(id);

    if (isNaN(groupId)) {
      return NextResponse.json({ error: '無効なグループIDです' }, { status: 400 });
    }

    const supabase = await getAuthenticatedClient(request);
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const adminSupabase = createAdminSupabaseClient();

    // グループとアイテムを取得
    const { data: group, error } = await adminSupabase
      .from('course_groups')
      .select(`
        *,
        items:course_group_items(
          *,
          course:courses(*)
        )
      `)
      .eq('id', groupId)
      .single();

    if (error) {
      console.error('Error fetching group:', error);
      return NextResponse.json({ error: 'グループ情報の取得に失敗しました' }, { status: 500 });
    }

    if (!group) {
      return NextResponse.json({ error: 'グループが見つかりません' }, { status: 404 });
    }

    // アイテムを order_index でソート
    if (group.items) {
      group.items.sort((a: any, b: any) => a.order_index - b.order_index);
    }

    return NextResponse.json({ group });

  } catch (error) {
    console.error('Error in GET /api/course-groups/[id]:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const groupId = parseInt(id);

    if (isNaN(groupId)) {
      return NextResponse.json({ error: '無効なグループIDです' }, { status: 400 });
    }

    const supabase = await getAuthenticatedClient(request);
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
    const { title, description, is_sequential } = body;

    const updates: any = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title;
    if (description !== undefined) updates.description = description;
    if (is_sequential !== undefined) updates.is_sequential = is_sequential;

    const adminSupabase = createAdminSupabaseClient();
    const { data: group, error } = await adminSupabase
      .from('course_groups')
      .update(updates)
      .eq('id', groupId)
      .select()
      .single();

    if (error) {
      console.error('Error updating group:', error);
      return NextResponse.json({ error: 'グループの更新に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ group, message: 'グループが更新されました' });

  } catch (error) {
    console.error('Error in PUT /api/course-groups/[id]:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const groupId = parseInt(id);

    if (isNaN(groupId)) {
      return NextResponse.json({ error: '無効なグループIDです' }, { status: 400 });
    }

    const supabase = await getAuthenticatedClient(request);
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

    const adminSupabase = createAdminSupabaseClient();

    // グループアイテムは CASCADE で自動削除される
    const { error } = await adminSupabase
      .from('course_groups')
      .delete()
      .eq('id', groupId);

    if (error) {
      console.error('Error deleting group:', error);
      return NextResponse.json({ error: 'グループの削除に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ message: 'グループが削除されました' });

  } catch (error) {
    console.error('Error in DELETE /api/course-groups/[id]:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
