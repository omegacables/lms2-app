import { createServerSupabaseClient } from '@/lib/database/supabase';
import { UserRole } from '@/types';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

/**
 * サーバーサイドで現在のユーザー情報を取得
 */
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const supabase = createServerSupabaseClient(cookieStore);
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser();
    
    if (error || !user) {
      return null;
    }

    // ユーザープロフィール情報も取得
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return {
      ...user,
      profile,
    };
  } catch (error) {
    console.error('ユーザー情報取得エラー:', error);
    return null;
  }
}

/**
 * 認証が必要なページの保護
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  
  if (!user) {
    redirect('/auth/login');
  }
  
  return user;
}

/**
 * 特定の権限が必要なページの保護
 */
export async function requireRole(requiredRoles: UserRole[]) {
  const user = await requireAuth();
  
  if (!user.profile || !requiredRoles.includes(user.profile.role)) {
    redirect('/unauthorized');
  }
  
  return user;
}

/**
 * 管理者権限が必要なページの保護
 */
export async function requireAdmin() {
  return requireRole(['admin']);
}

/**
 * インストラクター以上の権限が必要なページの保護
 */
export async function requireInstructor() {
  return requireRole(['instructor', 'admin']);
}

/**
 * ユーザーの権限チェック
 */
export function hasRole(userRole: UserRole, requiredRoles: UserRole[]): boolean {
  return requiredRoles.includes(userRole);
}

/**
 * 管理者権限チェック
 */
export function isAdmin(userRole: UserRole): boolean {
  return userRole === 'admin';
}

/**
 * インストラクター以上権限チェック
 */
export function isInstructorOrAbove(userRole: UserRole): boolean {
  return ['instructor', 'admin'].includes(userRole);
}

/**
 * パスワード強度チェック
 */
export function validatePassword(password: string): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('パスワードは8文字以上である必要があります');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('パスワードには大文字を含める必要があります');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('パスワードには小文字を含める必要があります');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('パスワードには数字を含める必要があります');
  }
  
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    errors.push('パスワードには特殊文字を含める必要があります');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * メールアドレス形式チェック
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * セッションタイムアウトチェック（2時間）
 */
export function isSessionExpired(lastActivity: Date): boolean {
  const now = new Date();
  const diffInMinutes = (now.getTime() - lastActivity.getTime()) / (1000 * 60);
  return diffInMinutes > 120; // 2時間
}

/**
 * システムログ記録
 */
export async function logSystemAction(
  action: string,
  resourceType?: string,
  resourceId?: string,
  details?: Record<string, any>
) {
  const cookieStore = await cookies();
  const supabase = createServerSupabaseClient(cookieStore);
  
  try {
    const user = await getCurrentUser();
    
    await supabase.from('system_logs').insert({
      user_id: user?.id || null,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      ip_address: null, // サーバーサイドでは取得困難
      user_agent: null, // サーバーサイドでは取得困難
      details,
    });
  } catch (error) {
    console.error('システムログ記録エラー:', error);
  }
}

/**
 * ログイン履歴更新
 */
export async function updateLastLogin(userId: string) {
  const cookieStore = await cookies();
  const supabase = createServerSupabaseClient(cookieStore);
  
  try {
    await supabase
      .from('user_profiles')
      .update({ 
        last_login_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', userId);
      
    await logSystemAction('login', 'user', userId);
  } catch (error) {
    console.error('ログイン履歴更新エラー:', error);
  }
}

/**
 * アカウント無効化チェック
 */
export async function checkAccountActive(userId: string): Promise<boolean> {
  const cookieStore = await cookies();
  const supabase = createServerSupabaseClient(cookieStore);
  
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('is_active')
      .eq('id', userId)
      .single();
      
    if (error || !data) {
      return false;
    }
    
    return data.is_active;
  } catch (error) {
    console.error('アカウント状態チェックエラー:', error);
    return false;
  }
}

/**
 * パスワード変更必要チェック（初回ログイン）
 */
export async function shouldChangePassword(userId: string): Promise<boolean> {
  const cookieStore = await cookies();
  const supabase = createServerSupabaseClient(cookieStore);
  
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('password_changed_at, created_at')
      .eq('id', userId)
      .single();
      
    if (error || !data) {
      return false;
    }
    
    // パスワード変更日時と作成日時が同じ場合は初回パスワード
    return data.password_changed_at === data.created_at;
  } catch (error) {
    console.error('パスワード変更必要チェックエラー:', error);
    return false;
  }
}