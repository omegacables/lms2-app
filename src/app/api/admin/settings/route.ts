import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = cookies();
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
    const category = searchParams.get('category');

    let query = supabase
      .from('system_settings')
      .select('*')
      .order('category', { ascending: true })
      .order('setting_key', { ascending: true });

    if (category) {
      query = query.eq('category', category);
    }

    const { data: settings, error } = await query;

    if (error) {
      console.error('Error fetching settings:', error);
      return NextResponse.json({ error: '設定の取得に失敗しました' }, { status: 500 });
    }

    // カテゴリ別に整理
    const settingsByCategory: { [key: string]: any[] } = {};
    settings.forEach(setting => {
      if (!settingsByCategory[setting.category]) {
        settingsByCategory[setting.category] = [];
      }
      settingsByCategory[setting.category].push(setting);
    });

    return NextResponse.json({
      settings,
      by_category: settingsByCategory
    });
  } catch (error) {
    console.error('Error in GET /api/admin/settings:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = cookies();
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
    const {
      setting_key,
      setting_value,
      setting_type = 'string',
      description,
      category = 'general',
      is_public = false
    } = body;

    if (!setting_key) {
      return NextResponse.json({ error: '設定キーは必須です' }, { status: 400 });
    }

    // 設定を作成
    const { data: setting, error } = await supabase
      .from('system_settings')
      .insert({
        setting_key,
        setting_value,
        setting_type,
        description,
        category,
        is_public,
        updated_by: user.id
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating setting:', error);
      if (error.code === '23505') { // unique constraint violation
        return NextResponse.json({ error: 'この設定キーは既に存在します' }, { status: 400 });
      }
      return NextResponse.json({ error: '設定の作成に失敗しました' }, { status: 500 });
    }

    return NextResponse.json({
      message: '設定が作成されました',
      setting: setting
    });
  } catch (error) {
    console.error('Error in POST /api/admin/settings:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const cookieStore = cookies();
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
    const { settings } = body;

    if (!Array.isArray(settings)) {
      return NextResponse.json({ error: '設定データが無効です' }, { status: 400 });
    }

    // バッチ更新
    const updatePromises = settings.map(async (setting: any) => {
      const { setting_key, setting_value, description, is_public } = setting;
      
      return supabase
        .from('system_settings')
        .upsert({
          setting_key,
          setting_value,
          description,
          is_public,
          updated_by: user.id,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'setting_key'
        });
    });

    const results = await Promise.allSettled(updatePromises);
    const failures = results.filter(result => result.status === 'rejected');

    if (failures.length > 0) {
      console.error('Some settings failed to update:', failures);
      return NextResponse.json({ 
        error: `${failures.length}件の設定更新に失敗しました`,
        partial_success: true,
        failed_count: failures.length
      }, { status: 207 }); // Multi-Status
    }

    return NextResponse.json({
      message: `${settings.length}件の設定が更新されました`
    });
  } catch (error) {
    console.error('Error in PUT /api/admin/settings:', error);
    return NextResponse.json({ error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}