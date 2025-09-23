import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export async function POST() {
  console.log('[API] Creating test user...');
  
  try {
    const adminSupabase = createAdminSupabaseClient();
    
    // テストユーザーの情報
    const testEmail = 'test@example.com';
    const testPassword = 'TestPassword123!';
    
    // 1. Auth にユーザーを作成
    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true, // メール確認をスキップ
      user_metadata: {
        display_name: 'Test User',
      },
    });
    
    if (authError) {
      console.error('[API] Auth creation error:', authError);
      
      // ユーザーが既に存在する場合
      if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
        // 既存ユーザーのIDを取得
        const { data: { users }, error: listError } = await adminSupabase.auth.admin.listUsers();
        if (!listError && users) {
          const existingUser = users.find(u => u.email === testEmail);
          if (existingUser) {
            // パスワードをリセット
            const { error: updateError } = await adminSupabase.auth.admin.updateUserById(
              existingUser.id,
              { password: testPassword }
            );
            
            if (!updateError) {
              return NextResponse.json({
                success: true,
                message: 'Password updated for existing user',
                user: {
                  id: existingUser.id,
                  email: testEmail,
                  password: testPassword,
                },
              });
            }
          }
        }
      }
      
      return NextResponse.json({
        success: false,
        error: authError.message,
      }, { status: 400 });
    }
    
    if (!authData?.user) {
      return NextResponse.json({
        success: false,
        error: 'User creation failed',
      }, { status: 400 });
    }
    
    // 2. user_profiles テーブルにプロフィールを作成
    const { error: profileError } = await adminSupabase
      .from('user_profiles')
      .upsert({
        id: authData.user.id,
        display_name: 'Test User',
        role: 'student',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    
    if (profileError) {
      console.error('[API] Profile creation error:', profileError);
      // プロフィール作成に失敗しても続行
    }
    
    console.log('[API] Test user created successfully');
    
    return NextResponse.json({
      success: true,
      message: 'Test user created successfully',
      user: {
        id: authData.user.id,
        email: testEmail,
        password: testPassword,
      },
    });
  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
    }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Use POST method to create a test user',
    testUser: {
      email: 'test@example.com',
      password: 'TestPassword123!',
    },
  });
}