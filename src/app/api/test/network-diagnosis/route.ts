import { NextResponse } from 'next/server';

export async function GET() {
  console.log('[Network Diagnosis] Starting comprehensive network diagnosis...');
  
  const results = {
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      url: process.env.NEXT_PUBLIC_SUPABASE_URL || 'NOT SET',
    },
    tests: [] as any[],
  };

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  // 1. DNS解決テスト
  try {
    const url = new URL(supabaseUrl);
    const dns = await import('dns').then(m => m.promises);
    const addresses = await dns.resolve4(url.hostname);
    results.tests.push({
      name: 'DNS Resolution',
      success: true,
      hostname: url.hostname,
      addresses,
    });
  } catch (error) {
    results.tests.push({
      name: 'DNS Resolution',
      success: false,
      error: (error as Error).message,
    });
  }

  // 2. 異なるHTTPメソッドでテスト
  const testUrls = [
    {
      name: 'Direct HTTPS Test',
      url: 'https://www.google.com',
      expectedStatus: [200, 301, 302],
    },
    {
      name: 'Supabase Main Domain',
      url: 'https://supabase.com',
      expectedStatus: [200, 301, 302],
    },
    {
      name: 'Your Supabase Project',
      url: supabaseUrl,
      expectedStatus: [200, 301, 302, 400, 401],
    },
    {
      name: 'Supabase REST Endpoint',
      url: `${supabaseUrl}/rest/v1/`,
      expectedStatus: [200, 401],
      headers: {
        'apikey': supabaseAnonKey,
      },
    },
  ];

  for (const test of testUrls) {
    try {
      console.log(`[Network Test] Testing ${test.name}: ${test.url}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(test.url, {
        method: 'GET',
        headers: test.headers || {},
        signal: controller.signal,
      });
      
      clearTimeout(timeoutId);
      
      results.tests.push({
        name: test.name,
        success: test.expectedStatus.includes(response.status),
        url: test.url,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
      });
    } catch (error: any) {
      const errorMessage = error.message || 'Unknown error';
      const isTimeout = errorMessage.includes('abort') || errorMessage.includes('timeout');
      const isNetworkError = errorMessage.includes('fetch failed') || errorMessage.includes('ECONNREFUSED');
      
      results.tests.push({
        name: test.name,
        success: false,
        url: test.url,
        error: errorMessage,
        errorType: isTimeout ? 'TIMEOUT' : isNetworkError ? 'NETWORK_ERROR' : 'OTHER',
      });
    }
  }

  // 3. Node.js HTTPSモジュールを使った直接テスト
  try {
    const https = await import('https');
    const url = new URL(supabaseUrl);
    
    await new Promise((resolve, reject) => {
      const req = https.get({
        hostname: url.hostname,
        path: '/',
        timeout: 5000,
        headers: {
          'User-Agent': 'Node.js Test',
        },
      }, (res) => {
        results.tests.push({
          name: 'Node.js HTTPS Module Test',
          success: true,
          statusCode: res.statusCode,
          statusMessage: res.statusMessage,
        });
        resolve(null);
      });
      
      req.on('error', (err) => {
        results.tests.push({
          name: 'Node.js HTTPS Module Test',
          success: false,
          error: err.message,
        });
        resolve(null);
      });
      
      req.on('timeout', () => {
        req.destroy();
        results.tests.push({
          name: 'Node.js HTTPS Module Test',
          success: false,
          error: 'Timeout after 5 seconds',
        });
        resolve(null);
      });
    });
  } catch (error) {
    results.tests.push({
      name: 'Node.js HTTPS Module Test',
      success: false,
      error: (error as Error).message,
    });
  }

  // 4. プロキシ設定確認
  const proxySettings = {
    HTTP_PROXY: process.env.HTTP_PROXY || 'Not set',
    HTTPS_PROXY: process.env.HTTPS_PROXY || 'Not set',
    NO_PROXY: process.env.NO_PROXY || 'Not set',
    http_proxy: process.env.http_proxy || 'Not set',
    https_proxy: process.env.https_proxy || 'Not set',
    no_proxy: process.env.no_proxy || 'Not set',
  };

  results.tests.push({
    name: 'Proxy Settings',
    success: true,
    settings: proxySettings,
  });

  // 診断結果の分析
  const analysis = analyzeResults(results);

  return NextResponse.json({
    success: results.tests.every(t => t.success || t.name === 'Proxy Settings'),
    results,
    analysis,
  });
}

function analyzeResults(results: any) {
  const analysis = {
    issues: [] as string[],
    recommendations: [] as string[],
  };

  // Google/Supabase.comへの接続が失敗している場合
  const googleTest = results.tests.find((t: any) => t.name === 'Direct HTTPS Test');
  const supabaseMainTest = results.tests.find((t: any) => t.name === 'Supabase Main Domain');
  
  if (googleTest && !googleTest.success) {
    analysis.issues.push('General internet connectivity issue detected');
    analysis.recommendations.push('Check your internet connection');
    analysis.recommendations.push('Check if you are behind a corporate firewall or proxy');
  }

  if (supabaseMainTest && !supabaseMainTest.success && googleTest?.success) {
    analysis.issues.push('Cannot reach Supabase services');
    analysis.recommendations.push('Supabase services might be blocked by firewall');
    analysis.recommendations.push('Check if you need to configure proxy settings');
  }

  // プロジェクト固有の問題
  const projectTest = results.tests.find((t: any) => t.name === 'Your Supabase Project');
  if (projectTest && !projectTest.success) {
    if (projectTest.errorType === 'TIMEOUT') {
      analysis.issues.push('Connection timeout to your Supabase project');
      analysis.recommendations.push('Project might be paused or inactive');
      analysis.recommendations.push('Check project status in Supabase dashboard');
    } else if (projectTest.errorType === 'NETWORK_ERROR') {
      analysis.issues.push('Network error connecting to your project');
      analysis.recommendations.push('Verify the project URL is correct');
      analysis.recommendations.push('Check if the project is active in Supabase dashboard');
    }
  }

  // DNS問題
  const dnsTest = results.tests.find((t: any) => t.name === 'DNS Resolution');
  if (dnsTest && !dnsTest.success) {
    analysis.issues.push('DNS resolution failed');
    analysis.recommendations.push('Check your DNS settings');
    analysis.recommendations.push('Try using Google DNS (8.8.8.8) or Cloudflare DNS (1.1.1.1)');
  }

  // プロキシ設定
  const proxyTest = results.tests.find((t: any) => t.name === 'Proxy Settings');
  if (proxyTest) {
    const hasProxy = Object.values(proxyTest.settings).some((v: any) => v !== 'Not set');
    if (hasProxy) {
      analysis.issues.push('Proxy settings detected');
      analysis.recommendations.push('Ensure proxy allows HTTPS connections to Supabase');
      analysis.recommendations.push('You may need to add Supabase URLs to proxy whitelist');
    }
  }

  return analysis;
}