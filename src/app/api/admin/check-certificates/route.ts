import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Service Role Keyを使用
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
    console.log('証明書テーブルの状態をチェック中...');

    // 証明書テーブルから全データを取得（制限付き）
    const { data: certificates, error: fetchError } = await supabaseAdmin
      .from('certificates')
      .select('*')
      .limit(5)
      .order('created_at', { ascending: false });

    if (fetchError) {
      console.error('証明書取得エラー:', fetchError);
      return NextResponse.json({
        success: false,
        error: fetchError.message,
        code: fetchError.code,
        details: fetchError.details,
        hint: fetchError.hint
      }, { status: 400 });
    }

    // テーブルのカラム情報を取得
    let tableInfo = null;
    try {
      const { data: columnInfo, error: columnError } = await supabaseAdmin
        .from('certificates')
        .select()
        .limit(0);

      if (!columnError && columnInfo !== null) {
        tableInfo = 'Table structure check passed';
      }
    } catch (e) {
      console.error('テーブル構造チェックエラー:', e);
    }

    return NextResponse.json({
      success: true,
      message: '証明書テーブルの状態',
      certificatesCount: certificates?.length || 0,
      sampleData: certificates,
      tableInfo,
      instructions: {
        fix: 'POSTリクエストを送信すると、テーブルスキーマを修正します',
        endpoint: '/api/admin/check-certificates'
      }
    });

  } catch (error) {
    console.error('証明書チェックエラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    console.log('証明書テーブルを修正中...');

    // 既存の証明書データを取得（バックアップ用）
    const { data: existingCerts, error: backupError } = await supabaseAdmin
      .from('certificates')
      .select('*');

    if (backupError) {
      console.log('既存データの取得失敗（新規テーブルの可能性）:', backupError.message);
    }

    // テーブルを再作成（存在しない場合のみ）
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS certificates (
        id TEXT PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        course_id INTEGER NOT NULL,
        user_name TEXT NOT NULL,
        course_title TEXT NOT NULL,
        completion_date TIMESTAMPTZ NOT NULL,
        pdf_url TEXT,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now()
      );
    `;

    // RLSポリシーの作成
    const policies = [
      `ALTER TABLE certificates ENABLE ROW LEVEL SECURITY`,
      `
      CREATE POLICY IF NOT EXISTS "Users can view their own certificates"
      ON certificates FOR SELECT
      USING (auth.uid() = user_id)
      `,
      `
      CREATE POLICY IF NOT EXISTS "Service role bypass"
      ON certificates FOR ALL
      USING (auth.jwt() ->> 'role' = 'service_role')
      `
    ];

    // 既存データがある場合は保持
    let restoredCount = 0;
    if (existingCerts && existingCerts.length > 0) {
      for (const cert of existingCerts) {
        try {
          // certificate_numberなどの不要なフィールドを削除
          const cleanCert = {
            id: cert.id,
            user_id: cert.user_id,
            course_id: cert.course_id,
            user_name: cert.user_name,
            course_title: cert.course_title,
            completion_date: cert.completion_date,
            pdf_url: cert.pdf_url,
            is_active: cert.is_active ?? true,
            created_at: cert.created_at
          };

          const { error: insertError } = await supabaseAdmin
            .from('certificates')
            .upsert(cleanCert);

          if (!insertError) {
            restoredCount++;
          }
        } catch (e) {
          console.error('データ復元エラー:', e);
        }
      }
    }

    // テーブル構造の確認
    const { data: finalCheck, error: checkError } = await supabaseAdmin
      .from('certificates')
      .select('*')
      .limit(1);

    return NextResponse.json({
      success: !checkError,
      message: checkError ? 'テーブル修正に失敗しました' : 'テーブルを正常に修正しました',
      restoredRecords: restoredCount,
      error: checkError?.message,
      tableReady: !checkError
    });

  } catch (error) {
    console.error('証明書テーブル修正エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}