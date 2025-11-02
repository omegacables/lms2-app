import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

// スキーマキャッシュを無効化したSupabaseクライアント
export const supabaseNoCache = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    db: {
      schema: 'public'
    },
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    },
    global: {
      headers: {
        'x-client-info': 'supabase-js-web'
      }
    }
  }
);

// 証明書専用のクライアント（スキーマキャッシュ問題を回避）
export const certificatesClient = {
  async select(userId: string, courseId?: number) {
    const query = supabaseNoCache
      .from('certificates')
      .select(`
        id,
        user_id,
        course_id,
        user_name,
        course_title,
        completion_date,
        pdf_url,
        is_active,
        created_at
      `)
      .eq('user_id', userId);

    if (courseId) {
      query.eq('course_id', courseId);
    }

    return query;
  },

  async insert(data: any) {
    // certificate_numberなどの問題のあるフィールドを除外
    const cleanData = {
      id: data.id,
      user_id: data.user_id,
      course_id: data.course_id,
      user_name: data.user_name,
      course_title: data.course_title,
      completion_date: data.completion_date,
      pdf_url: data.pdf_url || null,
      is_active: data.is_active !== undefined ? data.is_active : true,
      created_at: data.created_at || new Date().toISOString()
    };

    return supabaseNoCache
      .from('certificates')
      .insert(cleanData)
      .select(`
        id,
        user_id,
        course_id,
        user_name,
        course_title,
        completion_date,
        pdf_url,
        is_active,
        created_at
      `);
  },

  async delete(certificateId: string) {
    return supabaseNoCache
      .from('certificates')
      .delete()
      .eq('id', certificateId);
  }
};