import { NextRequest, NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export async function POST(request: NextRequest) {
  try {
    // 管理者権限のSupabaseクライアントを使用
    const supabase = createAdminSupabaseClient();

    // 作成するバケットの設定
    const buckets = [
      {
        name: 'videos',
        public: false,
        fileSizeLimit: 3221225472, // 3GB
        allowedMimeTypes: ['video/*']
      },
      {
        name: 'thumbnails',
        public: true,
        fileSizeLimit: 10485760, // 10MB
        allowedMimeTypes: ['image/*']
      },
      {
        name: 'avatars',
        public: true,
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: ['image/*']
      },
      {
        name: 'certificates',
        public: false,
        fileSizeLimit: 52428800, // 50MB
        allowedMimeTypes: ['application/pdf']
      },
      {
        name: 'attachments',
        public: false,
        fileSizeLimit: 104857600, // 100MB
        allowedMimeTypes: null // All types allowed
      }
    ];

    const results = [];

    for (const bucket of buckets) {
      try {
        // まず既存のバケットを確認
        const { data: existingBucket, error: checkError } = await supabase.storage
          .getBucket(bucket.name);

        if (existingBucket) {
          results.push({
            bucket: bucket.name,
            status: 'exists',
            message: 'Bucket already exists'
          });
          continue;
        }

        // バケットが存在しない場合は作成
        const { data, error } = await supabase.storage
          .createBucket(bucket.name, {
            public: bucket.public,
            fileSizeLimit: bucket.fileSizeLimit,
            allowedMimeTypes: bucket.allowedMimeTypes
          });

        if (error) {
          // 既に存在するエラーの場合は成功とみなす
          if (error.message?.includes('already exists')) {
            results.push({
              bucket: bucket.name,
              status: 'exists',
              message: 'Bucket already exists'
            });
          } else {
            results.push({
              bucket: bucket.name,
              status: 'error',
              message: error.message
            });
          }
        } else {
          results.push({
            bucket: bucket.name,
            status: 'created',
            message: 'Bucket created successfully'
          });
        }
      } catch (error) {
        results.push({
          bucket: bucket.name,
          status: 'error',
          message: (error as Error).message
        });
      }
    }

    // RLSポリシーの設定（必要に応じて）
    // 注: これはSQL実行が必要な場合があります

    return NextResponse.json({
      success: true,
      results,
      message: 'Storage initialization completed'
    });

  } catch (error) {
    console.error('Storage initialization error:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message
      },
      { status: 500 }
    );
  }
}

// バケットの状態を確認
export async function GET(request: NextRequest) {
  try {
    const supabase = createAdminSupabaseClient();

    // すべてのバケットを取得
    const { data: buckets, error } = await supabase.storage.listBuckets();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      buckets: buckets || [],
      count: buckets?.length || 0
    });

  } catch (error) {
    console.error('Storage check error:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message
      },
      { status: 500 }
    );
  }
}