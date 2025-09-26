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
    const { userId, courseId } = body;

    if (!userId || !courseId) {
      return NextResponse.json({
        success: false,
        error: 'Missing required parameters'
      }, { status: 400 });
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

    const { data: completedLogs } = await supabaseAdmin
      .from('video_view_logs')
      .select('video_id')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .eq('status', 'completed');

    const completedVideos = completedLogs?.length || 0;

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

    // 5. Create certificate
    const certificateId = generateCertificateId();
    const certificateData = {
      id: certificateId,
      user_id: userId,
      course_id: courseId,
      user_name: userProfile.display_name || userProfile.email || 'ユーザー',
      course_title: course.title,
      completion_date: new Date().toISOString(),
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