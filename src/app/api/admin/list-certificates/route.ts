import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service Role Keyを使用して全証明書を取得
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

export async function GET(request: NextRequest) {
  try {
    console.log('全証明書を取得中...');

    // URLパラメータからユーザーIDを取得（オプション）
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');

    // 証明書を取得
    let query = supabaseAdmin
      .from('certificates')
      .select(`
        id,
        user_id,
        course_id,
        user_name,
        course_title,
        completion_date,
        pdf_url,
        is_active,
        created_at
      `)
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data: certificates, error } = await query;

    if (error) {
      console.error('証明書取得エラー:', error);
      return NextResponse.json({
        success: false,
        error: error.message,
        details: error.details,
        hint: error.hint
      }, { status: 400 });
    }

    // ユーザーごとにグループ化
    const certificatesByUser: Record<string, any[]> = {};
    certificates?.forEach(cert => {
      const userName = cert.user_name || 'Unknown User';
      if (!certificatesByUser[userName]) {
        certificatesByUser[userName] = [];
      }
      certificatesByUser[userName].push(cert);
    });

    // コースごとの証明書数を集計
    const courseStats: Record<string, number> = {};
    certificates?.forEach(cert => {
      const courseTitle = cert.course_title || 'Unknown Course';
      courseStats[courseTitle] = (courseStats[courseTitle] || 0) + 1;
    });

    return NextResponse.json({
      success: true,
      total: certificates?.length || 0,
      certificates: certificates || [],
      byUser: certificatesByUser,
      courseStats,
      message: `${certificates?.length || 0}件の証明書が見つかりました`
    });

  } catch (error) {
    console.error('証明書リスト取得エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

// 証明書を手動で作成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, course_id, user_name, course_title } = body;

    if (!user_id || !course_id || !user_name || !course_title) {
      return NextResponse.json({
        success: false,
        error: '必須フィールドが不足しています'
      }, { status: 400 });
    }

    // 証明書IDを生成
    const certificateId = `CERT-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    // 証明書を作成
    const certificateData = {
      id: certificateId,
      user_id,
      course_id,
      user_name,
      course_title,
      completion_date: new Date().toISOString(),
      pdf_url: null,
      is_active: true,
      created_at: new Date().toISOString()
    };

    const { data, error } = await supabaseAdmin
      .from('certificates')
      .insert(certificateData)
      .select()
      .single();

    if (error) {
      console.error('証明書作成エラー:', error);
      return NextResponse.json({
        success: false,
        error: error.message
      }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      certificate: data,
      message: '証明書を作成しました'
    });

  } catch (error) {
    console.error('証明書作成エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}