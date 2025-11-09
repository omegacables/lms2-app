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

// グループにコースを追加
export async function POST(
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
    const { course_id, order_index } = body;

    if (!course_id) {
      return NextResponse.json({ error: 'コースIDは必須です' }, { status: 400 });
    }

    const adminSupabase = createAdminSupabaseClient();

    // 既存のアイテム数を取得
    if (order_index === undefined) {
      const { count } = await adminSupabase
        .from('course_group_items')
        .select('*', { count: 'exact', head: true })
        .eq('group_id', groupId);

      body.order_index = count || 0;
    }

    // アイテムを追加
    const { data: item, error } = await adminSupabase
      .from('course_group_items')
      .insert({
        group_id: groupId,
        course_id,
        order_index: body.order_index
      })
      .select(`
        *,
        course:courses(*)
      `)
      .single();

    if (error) {
      if (error.code === '23505') { // UNIQUE constraint violation
        return NextResponse.json({ error: 'このコースは既にグループに追加されています' }, { status: 409 });
      }
      console.error('Error adding item:', error);
      return NextResponse.json({ error: 'アイテムの追加に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ item, message: 'コースがグループに追加されました' });

  } catch (error) {
    console.error('Error in POST /api/course-groups/[id]/items:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

// グループ内のコースの順序を更新
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
    const { items } = body; // [{ id, order_index }, ...]

    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'items配列が必要です' }, { status: 400 });
    }

    const adminSupabase = createAdminSupabaseClient();

    // 各アイテムの順序を更新
    const updates = items.map(item =>
      adminSupabase
        .from('course_group_items')
        .update({ order_index: item.order_index })
        .eq('id', item.id)
        .eq('group_id', groupId) // 安全のため
    );

    await Promise.all(updates);

    return NextResponse.json({ message: '順序が更新されました' });

  } catch (error) {
    console.error('Error in PUT /api/course-groups/[id]/items:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

// グループからコースを削除
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

    const { searchParams } = new URL(request.url);
    const itemId = searchParams.get('item_id');

    if (!itemId) {
      return NextResponse.json({ error: 'item_idパラメータが必要です' }, { status: 400 });
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

    const { error } = await adminSupabase
      .from('course_group_items')
      .delete()
      .eq('id', parseInt(itemId))
      .eq('group_id', groupId); // 安全のため

    if (error) {
      console.error('Error deleting item:', error);
      return NextResponse.json({ error: 'アイテムの削除に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({ message: 'コースがグループから削除されました' });

  } catch (error) {
    console.error('Error in DELETE /api/course-groups/[id]/items:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}
