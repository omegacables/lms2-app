import { createClient } from '@supabase/supabase-js';

// Service Role Keyを使用したクライアント（RLSを回避）
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

/**
 * 証明書データを管理者権限で取得（デバッグ用）
 */
export async function fetchAllCertificatesAdmin(userId?: string) {
  try {
    let query = supabaseAdmin
      .from('certificates')
      .select(`
        *,
        courses (
          id,
          title,
          description,
          thumbnail_url
        )
      `)
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Admin fetch error:', error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data, error: null };
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return { success: false, error: error.message, data: null };
  }
}

/**
 * 証明書を強制的に作成（デバッグ用）
 */
export async function forceCreateCertificate(
  userId: string,
  courseId: number,
  userName: string,
  courseTitle: string
) {
  try {
    const certificateId = `CERT-${Date.now()}-${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

    const { data, error } = await supabaseAdmin
      .from('certificates')
      .insert({
        id: certificateId,
        user_id: userId,
        course_id: courseId,
        user_name: userName,
        course_title: courseTitle,
        completion_date: new Date().toISOString(),
        pdf_url: null,
        is_active: true,
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('Force create error:', error);
      return { success: false, error: error.message, data: null };
    }

    return { success: true, data, error: null };
  } catch (error: any) {
    console.error('Unexpected error:', error);
    return { success: false, error: error.message, data: null };
  }
}