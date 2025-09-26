import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service Role Keyを使用（環境変数が無い場合はエラーを返す）
function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

const supabaseAdmin = getSupabaseAdmin();

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id');
  const action = searchParams.get('action');

  // supabaseAdminが利用できない場合はエラーを返す
  if (!supabaseAdmin) {
    return NextResponse.json({
      success: false,
      error: 'Service configuration error. Admin functions are not available in this environment.',
      message: 'This endpoint requires server-side configuration that is not available.'
    }, { status: 503 });
  }

  try {
    // 証明書の確認
    if (!action || action === 'check') {
      if (userId) {
        // 特定ユーザーの証明書を確認
        const { data: certificates, error } = await supabaseAdmin
          .from('certificates')
          .select(`
            *,
            courses (
              id,
              title,
              description
            )
          `)
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('証明書取得エラー:', error);
          return NextResponse.json({
            success: false,
            error: error.message,
            details: error
          }, { status: 400 });
        }

        // ユーザーの進捗状況も確認
        const { data: progresses } = await supabaseAdmin
          .from('user_course_progress')
          .select('*')
          .eq('user_id', userId);

        return NextResponse.json({
          success: true,
          userId,
          certificates: certificates || [],
          certificateCount: certificates?.length || 0,
          progresses: progresses || [],
          message: certificates?.length > 0
            ? `${certificates.length}件の証明書が見つかりました`
            : '証明書が見つかりません'
        });
      } else {
        // 全証明書の概要を確認
        const { data: allCertificates, error } = await supabaseAdmin
          .from('certificates')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(10);

        if (error) {
          return NextResponse.json({
            success: false,
            error: error.message
          }, { status: 400 });
        }

        const uniqueUsers = new Set(allCertificates?.map(c => c.user_id) || []);
        const uniqueCourses = new Set(allCertificates?.map(c => c.course_id) || []);

        return NextResponse.json({
          success: true,
          totalCertificates: allCertificates?.length || 0,
          uniqueUsers: uniqueUsers.size,
          uniqueCourses: uniqueCourses.size,
          recentCertificates: allCertificates || [],
          message: '全証明書の概要を取得しました'
        });
      }
    }

    // テスト証明書の作成
    if (action === 'create' && userId) {
      const certificateId = `TEST-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
      const testCertificate = {
        id: certificateId,
        user_id: userId,
        course_id: 1,
        user_name: 'テストユーザー',
        course_title: 'テストコース',
        completion_date: new Date().toISOString(),
        pdf_url: null,
        is_active: true,
        created_at: new Date().toISOString()
      };

      const { data, error } = await supabaseAdmin
        .from('certificates')
        .insert(testCertificate)
        .select()
        .single();

      if (error) {
        return NextResponse.json({
          success: false,
          error: error.message,
          details: error
        }, { status: 400 });
      }

      return NextResponse.json({
        success: true,
        message: 'テスト証明書を作成しました',
        created: data
      });
    }

    return NextResponse.json({
      success: false,
      error: '無効なリクエストです'
    }, { status: 400 });

  } catch (error: any) {
    console.error('証明書テストエラー:', error);
    return NextResponse.json({
      success: false,
      error: error.message || '予期しないエラーが発生しました'
    }, { status: 500 });
  }
}