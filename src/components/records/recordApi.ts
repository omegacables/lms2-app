import { supabase } from '@/lib/database/supabase';

/** 帳票・記録の API を呼ぶときのヘッダー（画面のセッションは localStorage なので Bearer で送る） */
export async function recordAuthHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
  };
}
