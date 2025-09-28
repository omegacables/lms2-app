import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/database/supabase';
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

    // ユーザープロフィールを取得
    const { data: profile, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error fetching user profile:', error);
      return NextResponse.json({ error: 'プロフィールの取得に失敗しました' }, { status: 500 });
    }

    return NextResponse.json(profile);
  } catch (error) {
    console.error('Error in GET /api/user/profile:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();
    const { display_name, company, department, avatar_url } = body;

    // プロフィールを更新
    const { data, error } = await supabase
      .from('user_profiles')
      .update({
        display_name,
        company,
        department,
        avatar_url,
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating user profile:', error);
      return NextResponse.json({ error: 'プロフィールの更新に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'プロフィールが更新されました',
      profile: data
    });
  } catch (error) {
    console.error('Error in PUT /api/user/profile:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // 認証チェック
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const body = await request.json();
    
    // 部分的な更新のため、undefinedフィールドを除外
    const updateData: any = {};
    if (body.display_name !== undefined) updateData.display_name = body.display_name;
    if (body.company !== undefined) updateData.company = body.company;
    if (body.department !== undefined) updateData.department = body.department;
    if (body.avatar_url !== undefined) updateData.avatar_url = body.avatar_url;
    
    // タイムスタンプは常に更新
    updateData.updated_at = new Date().toISOString();

    // プロフィールを部分更新
    const { data, error } = await supabase
      .from('user_profiles')
      .update(updateData)
      .eq('id', user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating user profile:', error);
      return NextResponse.json({ error: 'プロフィールの更新に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      message: 'プロフィールが更新されました',
      profile: data
    });
  } catch (error) {
    console.error('Error in PATCH /api/user/profile:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}