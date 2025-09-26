import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 管理者権限のSupabaseクライアント
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

export async function POST(request: NextRequest) {
  try {
    console.log('証明書テーブルのスキーマを修正中...');

    // 必要なカラムが存在するかチェックし、存在しない場合は追加
    const alterTableQueries = [
      `ALTER TABLE certificates ADD COLUMN IF NOT EXISTS certificate_number TEXT`,
      `ALTER TABLE certificates ADD COLUMN IF NOT EXISTS verification_code TEXT`,
      `ALTER TABLE certificates ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ DEFAULT now()`,
      `ALTER TABLE certificates ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`
    ];

    const results = [];
    for (const query of alterTableQueries) {
      try {
        const { data, error } = await supabaseAdmin.rpc('exec_sql', {
          sql: query
        });

        if (error) {
          console.error(`クエリ実行エラー: ${query}`, error);
          // カラムが既に存在する場合のエラーは無視
          if (!error.message?.includes('already exists')) {
            results.push({ query, success: false, error: error.message });
          } else {
            results.push({ query, success: true, message: 'カラムは既に存在します' });
          }
        } else {
          results.push({ query, success: true, data });
        }
      } catch (e) {
        console.error('クエリ実行エラー:', e);
        results.push({ query, success: false, error: String(e) });
      }
    }

    // RLSポリシーの確認と作成
    const policyQueries = [
      `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'certificates'
          AND policyname = 'Users can view their own certificates'
        ) THEN
          CREATE POLICY "Users can view their own certificates" ON certificates
            FOR SELECT USING (auth.uid() = user_id);
        END IF;
      END $$;
      `,
      `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_policies
          WHERE tablename = 'certificates'
          AND policyname = 'Service role can manage certificates'
        ) THEN
          CREATE POLICY "Service role can manage certificates" ON certificates
            FOR ALL USING (auth.role() = 'service_role');
        END IF;
      END $$;
      `
    ];

    for (const query of policyQueries) {
      try {
        const { error } = await supabaseAdmin.rpc('exec_sql', {
          sql: query
        });

        if (error) {
          console.error('ポリシー作成エラー:', error);
        }
      } catch (e) {
        console.error('ポリシー作成エラー:', e);
      }
    }

    // Supabaseのキャッシュをクリア（可能な場合）
    // Note: これは直接的にはできないため、テーブルの簡単な操作を行う
    const { data: testData, error: testError } = await supabaseAdmin
      .from('certificates')
      .select('id')
      .limit(1);

    if (testError) {
      console.error('テスト選択エラー:', testError);
    }

    return NextResponse.json({
      success: true,
      message: '証明書テーブルのスキーマを修正しました',
      results
    });

  } catch (error) {
    console.error('証明書スキーマ修正エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}

// exec_sql関数が存在しない場合の代替処理
export async function GET(request: NextRequest) {
  try {
    // 現在の証明書テーブルの構造を取得
    const { data, error } = await supabaseAdmin
      .from('certificates')
      .select('*')
      .limit(0);

    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message,
        hint: 'Supabaseダッシュボードから直接以下のSQLを実行してください',
        sql: `
-- 証明書テーブルに必要なカラムを追加
ALTER TABLE certificates
ADD COLUMN IF NOT EXISTS certificate_number TEXT,
ADD COLUMN IF NOT EXISTS verification_code TEXT,
ADD COLUMN IF NOT EXISTS issued_at TIMESTAMPTZ DEFAULT now(),
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- RLSポリシーを設定
ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

-- ユーザーが自分の証明書を閲覧できるポリシー
CREATE POLICY "Users can view their own certificates" ON certificates
  FOR SELECT USING (auth.uid() = user_id);

-- サービスロールが証明書を管理できるポリシー
CREATE POLICY "Service role can manage certificates" ON certificates
  FOR ALL USING (auth.role() = 'service_role');
        `
      });
    }

    return NextResponse.json({
      success: true,
      message: 'テーブル構造の確認が完了しました',
      tableInfo: data
    });

  } catch (error) {
    console.error('証明書スキーマ確認エラー:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}