import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { issueCertificateIfEligible } from '@/lib/certificate/issue';

// Admin client for bypassing RLS
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.warn('Admin credentials not available - using anon key');
    // Fallback to anon key if service role key is not available
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

// Generate certificate ID
function generateCertificateId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 9).toUpperCase();
  return `CERT-${timestamp}-${random}`;
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
    const body = await request.json();
    const { userId, courseId, access_token } = body;

    if (!userId || !courseId) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameters'
      }, { status: 400 });
    }

    // 認証：本文のトークンまたはAuthorizationヘッダで本人を検証
    const headerToken = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
    const token = access_token || headerToken;
    if (!token) {
      return NextResponse.json({ success: false, error: '認証が必要です' }, { status: 401 });
    }
    const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !authUser) {
      return NextResponse.json({ success: false, error: '認証に失敗しました' }, { status: 401 });
    }
    // 本人、または admin / instructor / labor_consultant のみ発行可
    if (authUser.id !== userId) {
      const { data: requester } = await supabaseAdmin
        .from('user_profiles')
        .select('role')
        .eq('id', authUser.id)
        .single();
      const role = requester?.role;
      if (role !== 'admin' && role !== 'instructor' && role !== 'labor_consultant') {
        return NextResponse.json({ success: false, error: '権限がありません' }, { status: 403 });
      }
    }

    console.log('✨ 証明書生成API開始');
    console.log(`  ユーザーID: ${userId}`);
    console.log(`  コースID: ${courseId}`);

    // 修了要件チェック＋証明書発行は共通ヘルパーに集約
    //（通常コース＝全動画完了 / 通信制コース＝加えて全テスト通過＋添削合格）
    const result = await issueCertificateIfEligible(supabaseAdmin, userId, Number(courseId));

    if (!result.ok) {
      return NextResponse.json(
        { success: false, error: result.reason, progress: result.progress },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      certificateId: result.certificateId,
      message: result.created ? '証明書が正常に発行されました' : '証明書は既に発行済みです',
    });

  } catch (error) {
    console.error('証明書生成APIエラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '予期しないエラーが発生しました'
    }, { status: 500 });
  }
}