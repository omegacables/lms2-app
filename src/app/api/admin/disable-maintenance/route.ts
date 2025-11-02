import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Admin client for bypassing RLS
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !anonKey) {
      return null;
    }
    return createClient(supabaseUrl, anonKey);
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export async function POST(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json({
      success: false,
      error: 'Service configuration error'
    }, { status: 503 });
  }

  try {
    console.log('[緊急解除API] メンテナンスモードを解除します');

    // メンテナンスモードをfalseに設定
    const { error: updateError } = await supabaseAdmin
      .from('system_settings')
      .upsert({
        setting_key: 'general.maintenance_mode',
        setting_value: 'false',
        setting_type: 'boolean',
        category: 'general',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'setting_key'
      });

    if (updateError) {
      console.error('[緊急解除API] 更新エラー:', updateError);
      return NextResponse.json({
        success: false,
        error: updateError.message
      }, { status: 500 });
    }

    // 確認のため再取得
    const { data: setting } = await supabaseAdmin
      .from('system_settings')
      .select('*')
      .eq('setting_key', 'general.maintenance_mode')
      .maybeSingle();

    console.log('[緊急解除API] 解除完了:', setting);

    return NextResponse.json({
      success: true,
      message: 'メンテナンスモードを解除しました',
      currentSetting: setting
    });

  } catch (error) {
    console.error('[緊急解除API] エラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '予期しないエラーが発生しました'
    }, { status: 500 });
  }
}

// GET method for testing
export async function GET(request: NextRequest) {
  const supabaseAdmin = getSupabaseAdmin();

  if (!supabaseAdmin) {
    return NextResponse.json({
      success: false,
      error: 'Service configuration error'
    }, { status: 503 });
  }

  try {
    const { data: setting } = await supabaseAdmin
      .from('system_settings')
      .select('*')
      .eq('setting_key', 'general.maintenance_mode')
      .maybeSingle();

    return NextResponse.json({
      success: true,
      currentSetting: setting
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'エラー'
    }, { status: 500 });
  }
}
