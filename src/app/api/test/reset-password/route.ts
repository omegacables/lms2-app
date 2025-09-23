import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '@/lib/database/supabase';

export async function POST() {
  console.log('[Password Reset] Resetting test user password...');
  
  try {
    const adminSupabase = createAdminSupabaseClient();
    
    // テストユーザーのパスワードをリセット
    const testUsers = [
      { email: 'test@example.com', newPassword: 'Test123456!' },
      { email: 'demo@example.com', newPassword: 'Demo123456!' },
      { email: 'admin@lms.com', newPassword: 'Admin123456!' },
    ];
    
    const results = [];
    
    for (const user of testUsers) {
      try {
        // ユーザーIDを取得
        const { data: { users }, error: listError } = await adminSupabase.auth.admin.listUsers();
        
        if (listError) {
          results.push({
            email: user.email,
            success: false,
            error: listError.message,
          });
          continue;
        }
        
        const existingUser = users?.find(u => u.email === user.email);
        
        if (!existingUser) {
          results.push({
            email: user.email,
            success: false,
            error: 'User not found',
          });
          continue;
        }
        
        // パスワードを更新
        const { error: updateError } = await adminSupabase.auth.admin.updateUserById(
          existingUser.id,
          { 
            password: user.newPassword,
            email_confirm: true,
          }
        );
        
        if (updateError) {
          results.push({
            email: user.email,
            success: false,
            error: updateError.message,
          });
        } else {
          // user_profilesテーブルも確認/作成
          const { error: profileError } = await adminSupabase
            .from('user_profiles')
            .upsert({
              id: existingUser.id,
              display_name: user.email.split('@')[0],
              role: user.email.includes('admin') ? 'admin' : 'student',
              is_active: true,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          
          results.push({
            email: user.email,
            success: true,
            password: user.newPassword,
            profileCreated: !profileError,
          });
        }
      } catch (error) {
        results.push({
          email: user.email,
          success: false,
          error: (error as Error).message,
        });
      }
    }
    
    console.log('[Password Reset] Results:', results);
    
    return NextResponse.json({
      success: true,
      message: 'Password reset completed',
      users: results,
    });
  } catch (error) {
    console.error('[Password Reset] Error:', error);
    return NextResponse.json({
      success: false,
      error: (error as Error).message,
    }, { status: 500 });
  }
}