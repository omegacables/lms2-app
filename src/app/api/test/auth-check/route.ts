import { NextResponse } from 'next/server';
import { supabase } from '@/lib/database/supabase';
import { cookies } from 'next/headers';

export async function GET() {
  try {
    // クッキーから認証トークンを取得
    const cookieStore = await cookies();
    const authToken = cookieStore.get('sb-access-token');

    if (!authToken) {
      return NextResponse.json({
        authenticated: false,
        message: 'No auth token found'
      });
    }

    // Supabaseセッションを確認
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error || !session) {
      return NextResponse.json({
        authenticated: false,
        message: 'No active session'
      });
    }

    // ユーザープロファイルを取得
    const { data: profile } = await supabase
      .from('users')
      .select('role')
      .eq('id', session.user.id)
      .single();

    return NextResponse.json({
      authenticated: true,
      userId: session.user.id,
      email: session.user.email,
      role: profile?.role || 'unknown',
      message: 'User is authenticated'
    });

  } catch (error) {
    console.error('Auth check error:', error);
    return NextResponse.json({
      authenticated: false,
      message: 'Error checking authentication',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}