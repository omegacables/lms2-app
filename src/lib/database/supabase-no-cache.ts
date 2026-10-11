import { supabase } from '@/lib/database/supabase';

/**
 * 証明書用のクライアント。
 *
 * 以前はここで別の Supabase クライアントを生成していたが、メインのクライアントとセッションの保存先が
 * 異なるため常に未ログイン（anon）として動き、証明書の取得・発行が失敗していた。
 * いまはメインの `supabase` クライアントを使い、発行（insert）はサーバー API に委ねる
 * （受講者本人による certificates への直接 INSERT は RLS で禁止する方針のため）。
 */
const CERT_COLUMNS = `
        id,
        user_id,
        course_id,
        user_name,
        course_title,
        completion_date,
        pdf_url,
        is_active,
        created_at
      `;

export const certificatesClient = {
  select(userId: string, courseId?: number) {
    const query = supabase
      .from('certificates')
      .select(CERT_COLUMNS)
      .eq('user_id', userId);

    if (courseId) {
      query.eq('course_id', courseId);
    }

    return query;
  },

  /**
   * サーバー API で発行し、発行後の行を返す。
   * 戻り値の形（{ data, error }）は以前の insert と同じにして呼び出し側の変更を最小にしている。
   */
  async insert(data: { user_id: string; course_id: number }) {
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/certificates/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ userId: data.user_id, courseId: data.course_id, access_token: session?.access_token }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json?.success) {
      return { data: null, error: { message: json?.error || '証明書の発行に失敗しました', code: String(res.status) } };
    }
    const { data: rows, error } = await supabase
      .from('certificates')
      .select(CERT_COLUMNS)
      .eq('user_id', data.user_id)
      .eq('course_id', data.course_id)
      .eq('is_active', true)
      .limit(1);
    return { data: rows, error };
  },

  async delete(certificateId: string) {
    return supabase
      .from('certificates')
      .delete()
      .eq('id', certificateId);
  }
};
