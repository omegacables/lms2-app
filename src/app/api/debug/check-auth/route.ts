import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerSupabaseClient(cookieStore);

    // セッションチェック
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    
    if (sessionError || !session) {
      return NextResponse.json({ 
        authenticated: false,
        error: sessionError?.message || 'No session found'
      });
    }

    // ユーザープロフィール取得
    const { data: profile, error: profileError } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();

    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        role: profile?.role,
        display_name: profile?.display_name,
        is_admin: profile?.role === 'admin',
        is_instructor: profile?.role === 'instructor',
        can_upload: profile?.role === 'admin' || profile?.role === 'instructor'
      },
      profile,
      session: {
        expires_at: session.expires_at,
        access_token: session.access_token ? 'present' : 'missing'
      }
    });

  } catch (error) {
    console.error('Debug auth check error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}