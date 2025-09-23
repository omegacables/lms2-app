import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  console.log('[Direct Auth] Testing direct authentication without Supabase client...');
  
  try {
    const { email, password } = await request.json();
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    console.log('[Direct Auth] Using URL:', supabaseUrl);
    console.log('[Direct Auth] Testing with:', email);
    
    // 直接fetchを使って認証APIを呼び出し
    const authUrl = `${supabaseUrl}/auth/v1/token?grant_type=password`;
    
    console.log('[Direct Auth] Calling:', authUrl);
    const startTime = Date.now();
    
    const response = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
      }),
      signal: AbortSignal.timeout(10000), // 10秒でタイムアウト
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log('[Direct Auth] Response received in', duration, 'ms');
    console.log('[Direct Auth] Response status:', response.status);
    
    const responseText = await response.text();
    let responseData;
    
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = { raw: responseText };
    }
    
    console.log('[Direct Auth] Response data:', responseData);
    
    return NextResponse.json({
      success: response.ok,
      status: response.status,
      duration,
      data: responseData,
      message: response.ok ? 'Authentication successful' : 'Authentication failed',
    });
    
  } catch (error: any) {
    const errorMessage = error.message || 'Unknown error';
    const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('abort');
    
    console.error('[Direct Auth] Error:', error);
    
    return NextResponse.json({
      success: false,
      error: errorMessage,
      isTimeout,
      message: isTimeout ? 'Request timed out - network issue detected' : 'Request failed',
    }, { status: 500 });
  }
}