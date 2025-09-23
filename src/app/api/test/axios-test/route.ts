import { NextResponse } from 'next/server';
import axios from 'axios';

export async function GET() {
  console.log('[Axios Test] Testing connection with axios...');
  
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  
  const results = {
    fetch: null as any,
    axios: null as any,
    directLogin: null as any,
  };

  // 1. fetch でのテスト
  try {
    console.log('[Test] Using fetch...');
    const startTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const fetchResponse = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: {
        'apikey': supabaseAnonKey,
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    const fetchTime = Date.now() - startTime;
    
    results.fetch = {
      success: true,
      status: fetchResponse.status,
      time: fetchTime,
      data: await fetchResponse.json(),
    };
  } catch (error: any) {
    results.fetch = {
      success: false,
      error: error.message,
      type: error.name,
    };
  }

  // 2. axios でのテスト
  try {
    console.log('[Test] Using axios...');
    const startTime = Date.now();
    
    const axiosResponse = await axios.get(`${supabaseUrl}/auth/v1/settings`, {
      headers: {
        'apikey': supabaseAnonKey,
      },
      timeout: 10000,
    });
    
    const axiosTime = Date.now() - startTime;
    
    results.axios = {
      success: true,
      status: axiosResponse.status,
      time: axiosTime,
      data: axiosResponse.data,
    };
  } catch (error: any) {
    results.axios = {
      success: false,
      error: error.message,
      code: error.code,
      response: error.response?.status,
    };
  }

  // 3. 直接ログインテスト（axios使用）
  try {
    console.log('[Test] Direct login with axios...');
    const startTime = Date.now();
    
    const loginResponse = await axios.post(
      `${supabaseUrl}/auth/v1/token?grant_type=password`,
      {
        email: 'test@example.com',
        password: 'Test123456!',
      },
      {
        headers: {
          'apikey': supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
        validateStatus: (status) => status < 500, // 400番台も成功とみなす
      }
    );
    
    const loginTime = Date.now() - startTime;
    
    results.directLogin = {
      success: loginResponse.status === 200 || loginResponse.status === 400,
      status: loginResponse.status,
      time: loginTime,
      message: loginResponse.data?.msg || loginResponse.data?.error_description || 'Response received',
    };
  } catch (error: any) {
    results.directLogin = {
      success: false,
      error: error.message,
      code: error.code,
    };
  }

  // 分析
  const analysis = {
    fetchWorks: results.fetch?.success,
    axiosWorks: results.axios?.success,
    recommendation: '',
  };

  if (!results.fetch?.success && results.axios?.success) {
    analysis.recommendation = 'fetch API has issues, but axios works. Consider using axios for HTTP requests.';
  } else if (results.fetch?.success && !results.axios?.success) {
    analysis.recommendation = 'axios has issues, but fetch works. Continue using fetch API.';
  } else if (!results.fetch?.success && !results.axios?.success) {
    analysis.recommendation = 'Both HTTP clients failing. Check network configuration or firewall settings.';
  } else {
    analysis.recommendation = 'Both HTTP clients working. The issue might be in the Supabase client library configuration.';
  }

  console.log('[Axios Test] Results:', results);

  return NextResponse.json({
    success: results.fetch?.success || results.axios?.success,
    results,
    analysis,
  });
}