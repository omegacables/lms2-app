import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(request: NextRequest) {
  try {
    // すべてのクッキーを取得
    const cookieStore = await cookies();
    const allCookies = cookieStore.getAll();
    
    console.log('All cookies:', allCookies.map(c => ({ name: c.name, hasValue: !!c.value })));
    
    // 可能なトークンの場所を確認
    const possibleTokens = [
      'supabase-auth-token',
      'sb-access-token',
      'sb-tjzdsiaehksqpxuvzqvp-auth-token',
      'sb-tjzdsiaehksqpxuvzqvp-auth-token.0',
      'sb-tjzdsiaehksqpxuvzqvp-auth-token.1',
    ];
    
    let foundToken = null;
    let tokenSource = null;
    
    for (const tokenName of possibleTokens) {
      const cookie = cookieStore.get(tokenName);
      if (cookie?.value) {
        // JSONをパースしてaccess_tokenを取得
        try {
          const parsed = JSON.parse(cookie.value);
          if (parsed.access_token) {
            foundToken = parsed.access_token;
            tokenSource = `${tokenName} (parsed)`;
            break;
          }
        } catch {
          // JSONでない場合はそのまま使用
          foundToken = cookie.value;
          tokenSource = tokenName;
          break;
        }
      }
    }
    
    // Authorizationヘッダーも確認
    const authHeader = request.headers.get('authorization');
    if (authHeader && !foundToken) {
      foundToken = authHeader.replace('Bearer ', '');
      tokenSource = 'Authorization header';
    }
    
    if (!foundToken) {
      return NextResponse.json({
        success: false,
        message: 'No auth token found',
        cookies: allCookies.map(c => c.name),
      }, { status: 401 });
    }
    
    // トークンを使用してユーザー情報を取得
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${foundToken}`
        }
      }
    });
    
    const { data: { user }, error } = await supabase.auth.getUser(foundToken);
    
    if (error || !user) {
      return NextResponse.json({
        success: false,
        message: 'Failed to get user from token',
        tokenSource,
        error: error?.message,
      }, { status: 401 });
    }
    
    // ユーザーの権限を確認
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('role, display_name, email')
      .eq('id', user.id)
      .single();
    
    return NextResponse.json({
      success: true,
      tokenSource,
      user: {
        id: user.id,
        email: user.email,
        role: profile?.role,
        display_name: profile?.display_name,
      },
    });
    
  } catch (error) {
    console.error('Auth test error:', error);
    return NextResponse.json({
      success: false,
      message: 'Internal error',
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}