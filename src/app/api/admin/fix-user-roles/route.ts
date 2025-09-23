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

    // すべてのユーザープロファイルを取得
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from('user_profiles')
      .select('*');

    if (profilesError) {
      throw profilesError;
    }

    const updates = [];

    // roleがnullまたは空のユーザーを修正
    for (const profile of profiles || []) {
      if (!profile.role || profile.role === '') {
        // デフォルトでstudentに設定（最初のユーザーはadminに）
        const newRole = profile.id === user.id ? 'admin' : 'student';
        
        const { error: updateError } = await supabaseAdmin
          .from('user_profiles')
          .update({ 
            role: newRole,
            updated_at: new Date().toISOString()
          })
          .eq('id', profile.id);

        if (updateError) {
          console.error(`Failed to update user ${profile.id}:`, updateError);
          updates.push({
            id: profile.id,
            email: profile.email,
            status: 'error',
            error: updateError.message
          });
        } else {
          updates.push({
            id: profile.id,
            email: profile.email,
            status: 'updated',
            newRole: newRole
          });
        }
      } else {
        updates.push({
          id: profile.id,
          email: profile.email,
          status: 'skipped',
          currentRole: profile.role
        });
      }
    }

    // 現在のユーザーを確実にadminに設定
    const { error: currentUserError } = await supabaseAdmin
      .from('user_profiles')
      .update({ 
        role: 'admin',
        updated_at: new Date().toISOString()
      })
      .eq('id', user.id);

    if (currentUserError) {
      console.error('Failed to update current user to admin:', currentUserError);
    }

    return NextResponse.json({
      success: true,
      message: 'ユーザーロールの修正が完了しました',
      updates,
      currentUserId: user.id
    });

  } catch (error) {
    console.error('Fix user roles error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'ユーザーロールの修正に失敗しました' 
    }, { status: 500 });
  }
}