import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
  try {
    // 通常のSupabaseクライアントを作成
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    // セッションを取得
    const { data: { session }, error } = await supabase.auth.getSession();
    
    if (error) {
      return NextResponse.json({
        success: false,
        message: 'Failed to get session',
        error: error.message,
      });
    }
    
    if (!session) {
      return NextResponse.json({
        success: false,
        message: 'No active session found',
        suggestion: 'Please login first',
      });
    }
    
    // ユーザー情報を取得
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();
    
    return NextResponse.json({
      success: true,
      session: {
        user_id: session.user.id,
        email: session.user.email,
        access_token: session.access_token ? 'present' : 'missing',
        expires_at: session.expires_at,
        expires_in: session.expires_in,
      },
      profile: profile || null,
      cookies_info: 'Cookies are handled by Supabase client automatically',
    });
    
  } catch (error) {
    console.error('Session check error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal error',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}