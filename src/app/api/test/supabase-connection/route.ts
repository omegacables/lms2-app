import { NextResponse } from 'next/server';

export async function GET() {
  console.log('[Connection Test] Starting comprehensive Supabase connection test...');
  
  const results = {
    environment: {
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT SET',
      anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'SET' : 'NOT SET',
      serviceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'NOT SET',
    },
    tests: [] as any[],
  };

  // 1. 環境変数の検証
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({
      success: false,
      error: 'Missing environment variables',
      results,
    }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // 2. 基本的なHTTP接続テスト（404も成功とみなす）
  try {
    console.log('[Test 1] Testing basic HTTP connection...');
    const pingResponse = await fetch(supabaseUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000), // 5秒タイムアウト
    });
    
    // 404は正常（ルートパスにコンテンツがないため）
    const isSuccessful = pingResponse.status === 404 || pingResponse.status === 200 || pingResponse.status === 301;
    
    results.tests.push({
      name: 'Basic HTTP Connection',
      success: isSuccessful,
      status: pingResponse.status,
      statusText: pingResponse.statusText,
      note: pingResponse.status === 404 ? 'Normal - root path returns 404' : undefined,
    });
  } catch (error) {
    results.tests.push({
      name: 'Basic HTTP Connection',
      success: false,
      error: (error as Error).message,
    });
  }

  // 3. REST APIエンドポイントテスト
  try {
    console.log('[Test 2] Testing REST API endpoint...');
    const restUrl = `${supabaseUrl}/rest/v1/`;
    const restResponse = await fetch(restUrl, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
        'Authorization': `Bearer ${supabaseAnonKey}`,
      },
      signal: AbortSignal.timeout(5000),
    });
    
    results.tests.push({
      name: 'REST API Endpoint',
      success: restResponse.ok,
      status: restResponse.status,
      statusText: restResponse.statusText,
    });
  } catch (error) {
    results.tests.push({
      name: 'REST API Endpoint',
      success: false,
      error: (error as Error).message,
    });
  }

  // 4. Auth APIエンドポイントテスト
  try {
    console.log('[Test 3] Testing Auth API endpoint...');
    const authUrl = `${supabaseUrl}/auth/v1/settings`;
    const authResponse = await fetch(authUrl, {
      method: 'GET',
      headers: {
        'apikey': supabaseAnonKey,
      },
      signal: AbortSignal.timeout(5000),
    });
    
    const authData = await authResponse.json();
    
    results.tests.push({
      name: 'Auth API Endpoint',
      success: authResponse.ok,
      status: authResponse.status,
      data: authData,
    });
  } catch (error) {
    results.tests.push({
      name: 'Auth API Endpoint',
      success: false,
      error: (error as Error).message,
    });
  }

  // 5. 実際の認証APIテスト（無効な認証情報で）
  try {
    console.log('[Test 4] Testing Auth login endpoint...');
    const loginUrl = `${supabaseUrl}/auth/v1/token?grant_type=password`;
    const loginResponse = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'apikey': supabaseAnonKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: 'test@test.com',
        password: 'test',
      }),
      signal: AbortSignal.timeout(5000),
    });
    
    const loginData = await loginResponse.json();
    
    results.tests.push({
      name: 'Auth Login Endpoint',
      success: loginResponse.status === 400, // 400は期待される（無効な認証情報）
      status: loginResponse.status,
      message: loginData.msg || loginData.error_description || 'Connection successful',
    });
  } catch (error) {
    results.tests.push({
      name: 'Auth Login Endpoint',
      success: false,
      error: (error as Error).message,
    });
  }

  // 6. URLの形式チェック
  try {
    const url = new URL(supabaseUrl);
    const isSupabaseUrl = url.hostname.includes('supabase.co') || url.hostname.includes('supabase.io');
    
    results.tests.push({
      name: 'URL Format Check',
      success: isSupabaseUrl,
      hostname: url.hostname,
      protocol: url.protocol,
      isSupabaseUrl,
    });
  } catch (error) {
    results.tests.push({
      name: 'URL Format Check',
      success: false,
      error: 'Invalid URL format',
    });
  }

  // 結果の集計
  const allTestsPassed = results.tests.every(test => test.success);
  
  console.log('[Connection Test] Results:', results);

  return NextResponse.json({
    success: allTestsPassed,
    message: allTestsPassed ? 'All tests passed' : 'Some tests failed',
    results,
    recommendations: getRecommendations(results),
  });
}

function getRecommendations(results: any): string[] {
  const recommendations = [];
  
  // 環境変数チェック
  if (results.environment.url === 'NOT SET') {
    recommendations.push('NEXT_PUBLIC_SUPABASE_URL is not set in environment variables');
  }
  if (results.environment.anonKey === 'NOT SET') {
    recommendations.push('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set in environment variables');
  }
  
  // テスト結果チェック
  const failedTests = results.tests.filter((test: any) => !test.success);
  
  if (failedTests.some((test: any) => test.name === 'Basic HTTP Connection')) {
    recommendations.push('Cannot connect to Supabase URL. Check if the URL is correct and the project is active.');
  }
  
  if (failedTests.some((test: any) => test.name === 'Auth API Endpoint')) {
    recommendations.push('Auth API is not responding. Check Supabase dashboard for Auth service status.');
  }
  
  if (failedTests.some((test: any) => test.error && test.error.includes('timeout'))) {
    recommendations.push('Connection timeouts detected. Check your network connection or firewall settings.');
  }
  
  if (results.tests.some((test: any) => test.name === 'URL Format Check' && !test.isSupabaseUrl)) {
    recommendations.push('URL does not appear to be a valid Supabase URL. Verify your project URL in Supabase dashboard.');
  }
  
  if (recommendations.length === 0 && results.tests.every((test: any) => test.success)) {
    recommendations.push('All connections are working. The issue might be with specific authentication settings or user data.');
  }
  
  return recommendations;
}