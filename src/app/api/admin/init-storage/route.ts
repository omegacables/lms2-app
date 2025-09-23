import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(request: NextRequest) {
  try {
    // Service Role Keyを使用してSupabase Adminクライアントを作成
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 認証チェック
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token);
    
    if (userError || !user) {
      return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
    }

    // 管理者権限を確認
    const { data: currentUser, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profileError || !currentUser || currentUser.role !== 'admin') {
      return NextResponse.json({ error: '管理者権限が必要です' }, { status: 403 });
    }

    // ストレージバケットを作成または確認
    const buckets = [
      {
        name: 'course-thumbnails',
        public: true,
        fileSizeLimit: 5242880, // 5MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      },
      {
        name: 'videos',
        public: false,
        fileSizeLimit: 524288000, // 500MB
        allowedMimeTypes: ['video/mp4', 'video/webm', 'video/quicktime']
      },
      {
        name: 'avatars',
        public: true,
        fileSizeLimit: 2097152, // 2MB
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      },
      {
        name: 'certificates',
        public: false,
        fileSizeLimit: 10485760, // 10MB
        allowedMimeTypes: ['application/pdf']
      }
    ];

    const results = [];

    for (const bucket of buckets) {
      try {
        // バケットが既に存在するか確認
        const { data: existingBucket } = await supabaseAdmin.storage.getBucket(bucket.name);
        
        if (existingBucket) {
          results.push({
            bucket: bucket.name,
            status: 'already_exists',
            message: `バケット ${bucket.name} は既に存在します`
          });
        } else {
          // バケットを作成
          const { error: createError } = await supabaseAdmin.storage.createBucket(bucket.name, {
            public: bucket.public,
            fileSizeLimit: bucket.fileSizeLimit,
            allowedMimeTypes: bucket.allowedMimeTypes
          });

          if (createError) {
            results.push({
              bucket: bucket.name,
              status: 'error',
              message: createError.message
            });
          } else {
            results.push({
              bucket: bucket.name,
              status: 'created',
              message: `バケット ${bucket.name} を作成しました`
            });
          }
        }
      } catch (error) {
        results.push({
          bucket: bucket.name,
          status: 'error',
          message: error instanceof Error ? error.message : '不明なエラー'
        });
      }
    }

    return NextResponse.json({
      success: true,
      results
    });

  } catch (error) {
    console.error('Storage initialization error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'ストレージの初期化に失敗しました' 
    }, { status: 500 });
  }
}