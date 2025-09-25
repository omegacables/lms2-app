import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase環境変数が設定されていません');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkStorageSetup() {
  console.log('🔍 Supabaseストレージ設定を確認中...\n');

  try {
    // 1. バケット一覧を取得
    console.log('1. ストレージバケット一覧:');
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();

    if (bucketsError) {
      console.error('❌ バケット一覧の取得に失敗:', bucketsError.message);
    } else {
      const videoBucket = buckets?.find(b => b.name === 'videos');
      if (videoBucket) {
        console.log('✅ "videos" バケットが見つかりました');
        console.log('   - ID:', videoBucket.id);
        console.log('   - Public:', videoBucket.public);
        console.log('   - Created:', videoBucket.created_at);
      } else {
        console.error('❌ "videos" バケットが見つかりません');
        console.log('   利用可能なバケット:', buckets?.map(b => b.name).join(', '));
      }
    }

    // 2. テスト用のユーザー認証
    console.log('\n2. 認証テスト:');
    const { data: { session }, error: authError } = await supabase.auth.getSession();

    if (authError) {
      console.error('❌ 認証エラー:', authError.message);
    } else if (session) {
      console.log('✅ 認証済みユーザー:', session.user.email);
    } else {
      console.log('⚠️  未認証状態です');
    }

    // 3. videosテーブルの構造を確認
    console.log('\n3. videosテーブルの構造確認:');
    const { data: videos, error: videosError } = await supabase
      .from('videos')
      .select('*')
      .limit(0);

    if (videosError) {
      console.error('❌ videosテーブルへのアクセスエラー:', videosError.message);
    } else {
      console.log('✅ videosテーブルにアクセスできます');
    }

    // 4. テストファイルのアップロード（小さいテキストファイル）
    if (session) {
      console.log('\n4. テストアップロード:');
      const testFile = new Blob(['test content'], { type: 'text/plain' });
      const testPath = `test/${Date.now()}_test.txt`;

      const { error: uploadError } = await supabase.storage
        .from('videos')
        .upload(testPath, testFile);

      if (uploadError) {
        console.error('❌ テストアップロード失敗:', uploadError.message);
        if (uploadError.message.includes('row-level security')) {
          console.log('   → RLSポリシーの設定が必要です');
        } else if (uploadError.message.includes('bucket')) {
          console.log('   → バケットの設定を確認してください');
        }
      } else {
        console.log('✅ テストアップロード成功');

        // クリーンアップ
        await supabase.storage.from('videos').remove([testPath]);
      }
    }

    // 5. 推奨設定
    console.log('\n📋 推奨設定:');
    console.log('1. Supabaseダッシュボードで以下を確認してください:');
    console.log('   - Storage > Buckets > videos が存在する');
    console.log('   - Bucket設定でFile size limitが3GB以上');
    console.log('   - Allowed MIME typesに video/* が含まれる');
    console.log('\n2. 上記のSQLスクリプト (setup_storage_3gb.sql) を実行してください');
    console.log('\n3. Authentication > Policiesで適切なRLSポリシーが設定されていることを確認');

  } catch (error) {
    console.error('予期しないエラー:', error);
  }
}

checkStorageSetup().catch(console.error);