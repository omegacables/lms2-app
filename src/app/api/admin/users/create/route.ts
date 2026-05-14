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

    // 既存の auth.users に同じメールアドレスがあるかを確認（孤児レコードのリカバリ用）
    const findExistingUserByEmail = async (targetEmail: string) => {
      // listUsers はページング対応。1000件まで確認すれば実運用上ほぼ十分。
      let page = 1;
      const perPage = 200;
      const maxPages = 5;
      while (page <= maxPages) {
        const { data, error } = await adminSupabase.auth.admin.listUsers({ page, perPage });
        if (error || !data) break;
        const found = data.users.find(u => u.email?.toLowerCase() === targetEmail.toLowerCase());
        if (found) return found;
        if (data.users.length < perPage) break;
        page++;
      }
      return null;
    };

    // 新規ユーザーの作成
    let authData: { user: { id: string; email?: string | null } } = { user: { id: '', email: null } };
    const { data: createdAuth, error: authError } = await adminSupabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) {
      const alreadyRegistered = authError.message?.toLowerCase().includes('already');

      if (alreadyRegistered) {
        // auth.users には居るが user_profiles が無いケース（孤児）を救出
        const existing = await findExistingUserByEmail(email);
        if (!existing) {
          return NextResponse.json(
            { error: 'このメールアドレスは既に登録されています。別のメールアドレスをご利用ください。' },
            { status: 409 }
          );
        }

        const { data: existingProfile } = await adminSupabase
          .from('user_profiles')
          .select('id')
          .eq('id', existing.id)
          .maybeSingle();

        if (existingProfile) {
          return NextResponse.json(
            { error: 'このメールアドレスは既に登録されています。別のメールアドレスをご利用ください。' },
            { status: 409 }
          );
        }

        // 孤児 auth ユーザーをリカバリ: パスワードを今回の値に更新し、プロフィールを作る
        console.log('[User Create] Recovering orphan auth user:', { email, id: existing.id });
        const { error: updateError } = await adminSupabase.auth.admin.updateUserById(existing.id, {
          password,
          email_confirm: true,
        });
        if (updateError) {
          console.error('[User Create] Failed to update orphan auth user:', updateError);
          return NextResponse.json(
            { error: `既存の認証情報の更新に失敗しました: ${updateError.message}` },
            { status: 500 }
          );
        }
        authData = { user: { id: existing.id, email: existing.email } };
      } else {
        console.error('[User Create] Auth creation error:', {
          email,
          error: authError.message,
          code: authError.status,
          details: authError,
        });
        return NextResponse.json(
          { error: `ユーザー作成エラー: ${authError.message}` },
          { status: 400 }
        );
      }
    } else if (createdAuth?.user) {
      authData = { user: { id: createdAuth.user.id, email: createdAuth.user.email } };
    } else {
      return NextResponse.json(
        { error: 'ユーザー作成に失敗しました' },
        { status: 400 }
      );
    }

    // プロフィールの更新（トリガーで既に作成されているため）
    const profilePayload = {
      display_name: display_name || email.split('@')[0],
      company: company || null,
      department: department || null,
      role: role || 'student',
      is_active: is_active !== undefined ? is_active : true,
    };

    console.log('[User Create] Updating profile with:', {
      id: authData.user.id,
      ...profilePayload,
      password: '***hidden***'
    });

    // adminSupabase を使用して RLS をバイパス
    // 通常はトリガーで自動作成されるが、孤児リカバリ時にはレコードが無い可能性があるため upsert
    const { data: profileData, error: profileError } = await adminSupabase
      .from('user_profiles')
      .upsert({ id: authData.user.id, ...profilePayload }, { onConflict: 'id' })
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
      // Auth ユーザーを削除（ロールバック）
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