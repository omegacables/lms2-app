/**
 * Supabase Storage バケット初期化スクリプト
 * 
 * 使用方法:
 * 1. このスクリプトを実行: node setup-storage-buckets.js
 * 2. コース画像とビデオ用のバケットが作成されます
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ 環境変数が設定されていません。.env.localファイルを確認してください。');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupStorageBuckets() {
  console.log('🚀 Supabase Storage バケットをセットアップ中...\n');

  const buckets = [
    {
      name: 'course-thumbnails',
      public: true,
      description: 'コースのサムネイル画像用バケット'
    },
    {
      name: 'videos',
      public: true,
      description: '動画ファイル用バケット'
    },
    {
      name: 'user-avatars',
      public: true,
      description: 'ユーザーアバター画像用バケット'
    }
  ];

  for (const bucket of buckets) {
    try {
      // バケットが既に存在するか確認
      const { data: existingBucket } = await supabase.storage.getBucket(bucket.name);
      
      if (existingBucket) {
        console.log(`✅ バケット "${bucket.name}" は既に存在します`);
        
        // パブリック設定を更新
        if (bucket.public) {
          const { error: updateError } = await supabase.storage.updateBucket(bucket.name, {
            public: true
          });
          
          if (updateError) {
            console.error(`⚠️ バケット "${bucket.name}" のパブリック設定更新エラー:`, updateError.message);
          } else {
            console.log(`   → パブリックアクセスを有効化しました`);
          }
        }
      } else {
        // バケットを作成
        const { data, error } = await supabase.storage.createBucket(bucket.name, {
          public: bucket.public,
          fileSizeLimit: bucket.name === 'videos' ? 3221225472 : 52428800, // videos: 3GB, others: 50MB
          allowedMimeTypes: bucket.name === 'videos' 
            ? ['video/mp4', 'video/webm', 'video/quicktime']
            : bucket.name === 'course-thumbnails' || bucket.name === 'user-avatars'
            ? ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
            : undefined
        });

        if (error) {
          console.error(`❌ バケット "${bucket.name}" の作成エラー:`, error.message);
        } else {
          console.log(`✅ バケット "${bucket.name}" を作成しました`);
          console.log(`   → 説明: ${bucket.description}`);
          console.log(`   → パブリック: ${bucket.public ? 'はい' : 'いいえ'}`);
        }
      }
    } catch (error) {
      console.error(`❌ バケット "${bucket.name}" の処理中にエラー:`, error);
    }
  }

  console.log('\n✨ バケットのセットアップが完了しました！');
  console.log('\nℹ️ 注意事項:');
  console.log('  - Supabaseダッシュボードでバケットの設定を確認してください');
  console.log('  - RLSポリシーが必要な場合は、ダッシュボードから設定してください');
  console.log('  - CORSの設定が必要な場合は、ダッシュボードから設定してください');
}

// スクリプトを実行
setupStorageBuckets().catch(console.error);