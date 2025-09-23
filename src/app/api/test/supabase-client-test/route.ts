import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  console.log('[Supabase Client Test] Testing Supabase client library...');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  const results = {
    environment: {
      url: supabaseUrl,
      hasAnonKey: !!supabaseAnonKey,
      nodeVersion: process.version,
    },
    tests: [] as any[],
  };

  try {
    // 1. クライアント作成テスト
    console.log('[Test] Creating Supabase client...');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    results.tests.push({
      name: 'Client Creation',
      success: true,
      message: 'Client created successfully',
    });

    // 2. getSession テスト
    try {
      console.log('[Test] Testing getSession...');
      const startTime = Date.now();
      const { data: sessionData, error: sessionError } = await Promise.race([
        supabase.auth.getSession(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('getSession timeout')), 5000)
        ),
      ]) as any;
      const sessionTime = Date.now() - startTime;

      results.tests.push({
        name: 'getSession',
        success: !sessionError,
        time: sessionTime,
        hasSession: !!sessionData?.session,
        error: sessionError?.message,
      });
    } catch (error) {
      results.tests.push({
        name: 'getSession',
        success: false,
        error: (error as Error).message,
      });
    }

    // 3. signInWithPassword テスト（タイムアウト付き）
    try {
      console.log('[Test] Testing signInWithPassword...');
      const startTime = Date.now();
      const { data: loginData, error: loginError } = await Promise.race([
        supabase.auth.signInWithPassword({
          email: 'test@example.com',
          password: 'Test123456!',
        }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('signInWithPassword timeout')), 10000)
        ),
      ]) as any;
      const loginTime = Date.now() - startTime;

      results.tests.push({
        name: 'signInWithPassword',
        success: !loginError || loginError.message.includes('Invalid login credentials'),
        time: loginTime,
        hasUser: !!loginData?.user,
        error: loginError?.message,
        note: loginError?.message.includes('Invalid login credentials') 
          ? 'Expected error - credentials may be incorrect but connection works'
          : undefined,
      });
    } catch (error) {
      results.tests.push({
        name: 'signInWithPassword',
        success: false,
        error: (error as Error).message,
        note: 'Connection timeout - this is the main issue',
      });
    }

    // 4. REST API 直接テスト
    try {
      console.log('[Test] Testing REST API via client...');
      const startTime = Date.now();
      const { data: tableData, error: tableError } = await Promise.race([
        supabase.from('user_profiles').select('count').limit(1),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('REST API timeout')), 5000)
        ),
      ]) as any;
      const tableTime = Date.now() - startTime;

      results.tests.push({
        name: 'REST API via Client',
        success: !tableError,
        time: tableTime,
        error: tableError?.message,
      });
    } catch (error) {
      results.tests.push({
        name: 'REST API via Client',
        success: false,
        error: (error as Error).message,
      });
    }

  } catch (error) {
    results.tests.push({
      name: 'Client Creation',
      success: false,
      error: (error as Error).message,
    });
  }

  // 分析
  const analysis = analyzeClientResults(results);

  return NextResponse.json({
    success: results.tests.every(t => t.success),
    results,
    analysis,
  });
}

function analyzeClientResults(results: any) {
  const issues = [];
  const recommendations = [];

  const timeoutTests = results.tests.filter((t: any) => 
    t.error && (t.error.includes('timeout') || t.error.includes('abort'))
  );

  const successfulTests = results.tests.filter((t: any) => t.success);

  if (timeoutTests.length > 0) {
    issues.push('Supabase client operations are timing out');
    
    if (timeoutTests.some((t: any) => t.name === 'signInWithPassword')) {
      recommendations.push('Authentication operations are timing out - this explains your 15s timeout issue');
    }
    
    recommendations.push('Try increasing timeout values or check network configuration');
    recommendations.push('Consider using a different HTTP client or proxy settings');
  }

  if (successfulTests.length === 0) {
    issues.push('All Supabase client operations failed');
    recommendations.push('Check Supabase project status in dashboard');
    recommendations.push('Verify API keys are correct and not expired');
  }

  const fastTests = results.tests.filter((t: any) => t.time && t.time < 1000);
  const slowTests = results.tests.filter((t: any) => t.time && t.time > 3000);

  if (slowTests.length > 0 && fastTests.length > 0) {
    issues.push('Inconsistent response times detected');
    recommendations.push('Network connection may be unstable');
  }

  return { issues, recommendations };
}