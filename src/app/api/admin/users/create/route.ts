import { NextResponse } from 'next/server';
import { supabase } from '@/lib/database/supabase';
import { adminSupabase } from '@/lib/database/adminSupabase';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { email, display_name, company, department, password, role, is_active } = body;

    console.log('[User Create] Request received:', { email, display_name, company, department, role });

    // 入力検証
    if (!email || !password) {
      console.error('[User Create] Missing required fields');
      return NextResponse.json(
        { error: 'メールアドレスとパスワードは必須です' },
        { status: 400 }
      );
    }

    // 管理者権限の確認（実際のプロジェクトでは認証チェックを追加）

    // 新規ユーザーの作成
    const { data: authData, error: authError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      console.error('[User Create] Auth creation error:', {
        email,
        error: authError.message,
        code: authError.status,
        details: authError
      });
      return NextResponse.json(
        { error: `ユーザー作成エラー: ${authError.message}` },
        { status: 400 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'ユーザー作成に失敗しました' },
        { status: 400 }
      );
    }

    // プロフィールの作成
    const profilePayload = {
      id: authData.user.id,
      email,
      display_name: display_name || email.split('@')[0],
      company: company || null,
      department: department || null,
      role: role || 'student',
      is_active: is_active !== undefined ? is_active : true,
    };

    console.log('[User Create] Creating profile with:', {
      ...profilePayload,
      password: '***hidden***'
    });

    // adminSupabaseを使用してRLSポリシーをバイパス
    const { data: profileData, error: profileError } = await adminSupabase
      .from('user_profiles')
      .insert(profilePayload)
      .select()
      .single();

    if (profileError) {
      console.error('[User Create] Profile creation error:', {
        email,
        error: profileError.message,
        code: profileError.code,
        details: profileError.details,
        hint: profileError.hint,
        payload: profilePayload
      });
      // Authユーザーを削除（ロールバック）
      await adminSupabase.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: `プロフィール作成エラー: ${profileError.message}` },
        { status: 400 }
      );
    }

    console.log('[User Create] Success:', { email, id: authData.user.id });

    return NextResponse.json({
      success: true,
      user: profileData,
      message: 'ユーザーが正常に作成されました'
    });

  } catch (error: any) {
    console.error('User creation error:', error);
    return NextResponse.json(
      { error: error.message || 'ユーザー作成中にエラーが発生しました' },
      { status: 500 }
    );
  }
}