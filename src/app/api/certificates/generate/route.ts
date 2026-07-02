import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    // 1. Check for existing certificate
    const { data: existingCert } = await supabaseAdmin
      .from('certificates')
      .select('id')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .maybeSingle();

    if (existingCert) {
      console.log('⚠️ 証明書はすでに存在します:', existingCert.id);
      return NextResponse.json({
        success: true,
        certificateId: existingCert.id,
        message: '証明書は既に発行済みです'
      });
    }

    // 2. Get course information
    const { data: course, error: courseError } = await supabaseAdmin
      .from('courses')
      .select('id, title')
      .eq('id', courseId)
      .single();

    if (courseError || !course) {
      console.error('コース情報取得エラー:', courseError);
      return NextResponse.json({
        success: false,
        error: 'コース情報の取得に失敗しました'
      }, { status: 404 });
    }

    // 3. Get user information
    const { data: userProfile, error: userError } = await supabaseAdmin
      .from('user_profiles')
      .select('display_name, email')
      .eq('id', userId)
      .single();

    if (userError || !userProfile) {
      console.error('ユーザー情報取得エラー:', userError);
      return NextResponse.json({
        success: false,
        error: 'ユーザー情報の取得に失敗しました'
      }, { status: 404 });
    }

    // 4. Verify course completion
    const { data: videos } = await supabaseAdmin
      .from('videos')
      .select('id')
      .eq('course_id', courseId)
      .eq('status', 'active');

    const totalVideos = videos?.length || 0;

    // 完了した動画のログを取得（status = 'completed' で判定、受講状況ページと同じ）
    const { data: completedLogs } = await supabaseAdmin
      .from('video_view_logs')
      .select('video_id, completed_at, last_updated, created_at, status')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .eq('status', 'completed')
      .order('completed_at', { ascending: false });

    // 重複を除いた完了動画数をカウント
    const completedVideoIds = new Set(completedLogs?.map(log => log.video_id) || []);
    const completedVideos = completedVideoIds.size;

    console.log(`進捗確認: ${completedVideos}/${totalVideos} 動画完了`);

    if (completedVideos < totalVideos) {
      return NextResponse.json({
        success: false,
        error: `コースが完了していません (${completedVideos}/${totalVideos} 動画完了)`,
        progress: {
          completed: completedVideos,
          total: totalVideos
        }
      }, { status: 400 });
    }

    // コース完了日付を計算（最後に完了した動画の日時）
    const lastCompletedLog = completedLogs && completedLogs.length > 0
      ? completedLogs.reduce((latest, log) => {
          const logDate = new Date(log.completed_at || log.last_updated || log.created_at);
          const latestDate = new Date(latest.completed_at || latest.last_updated || latest.created_at);
          return logDate > latestDate ? log : latest;
        }, completedLogs[0])
      : null;

    const courseCompletionDate = lastCompletedLog
      ? new Date(lastCompletedLog.completed_at || lastCompletedLog.last_updated || lastCompletedLog.created_at)
      : new Date();

    console.log('コース完了日付:', courseCompletionDate.toISOString());

    // 5. Create certificate
    const certificateId = generateCertificateId();
    const certificateData = {
      id: certificateId,
      user_id: userId,
      course_id: courseId,
      user_name: userProfile.display_name || userProfile.email || 'ユーザー',
      course_title: course.title,
      completion_date: courseCompletionDate.toISOString(),
      is_active: true,
      created_at: new Date().toISOString()
    };

    console.log('証明書データ:', certificateData);

    const { data: newCertificate, error: insertError } = await supabaseAdmin
      .from('certificates')
      .insert(certificateData)
      .select()
      .single();

    if (insertError) {
      // Handle duplicate key error
      if (insertError.code === '23505' || insertError.message?.includes('duplicate')) {
        const { data: existingData } = await supabaseAdmin
          .from('certificates')
          .select('id')
          .eq('user_id', userId)
          .eq('course_id', courseId)
          .maybeSingle();

        if (existingData) {
          return NextResponse.json({
            success: true,
            certificateId: existingData.id,
            message: '証明書は既に発行済みです'
          });
        }
      }

      console.error('証明書作成エラー:', insertError);
      return NextResponse.json({
        success: false,
        error: '証明書の作成に失敗しました',
        details: insertError.message
      }, { status: 500 });
    }

    console.log('🎉 証明書が正常に作成されました！');
    console.log('  証明書ID:', certificateId);
    console.log('  コース名:', course.title);
    console.log('  ユーザー名:', userProfile.display_name || userProfile.email);

    return NextResponse.json({
      success: true,
      certificateId: newCertificate?.id || certificateId,
      message: '証明書が正常に発行されました',
      certificate: newCertificate
    });

  } catch (error) {
    console.error('証明書生成APIエラー:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '予期しないエラーが発生しました'
    }, { status: 500 });
  }
}