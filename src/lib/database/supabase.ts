import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

// 環境変数のバリデーション
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// デバッグ用：環境変数の状態を確認
if (typeof window !== 'undefined') {
  console.log('[Supabase] Client-side environment check:');
  console.log('[Supabase] URL:', supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'NOT SET');
  console.log('[Supabase] Anon Key:', supabaseAnonKey ? 'SET' : 'NOT SET');
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[Supabase] Missing environment variables:', {
    url: !!supabaseUrl,
    anonKey: !!supabaseAnonKey
  });
  throw new Error('Supabaseの環境変数が設定されていません');
}

/**
 * タブごとに独立した認証セッションを実現するための仕組み。
 *
 * 背景: supabase-js は storageKey を共有する全タブでセッションを同期するため、
 * 同一ブラウザの別タブで2つ目のアカウントにログインすると最初のタブも
 * そのアカウントに上書きされてしまう。
 * そこで storageKey をタブごとに分け（sessionStorageに保持したタブIDを付与）、
 * タブ単位で別アカウントに同時ログインできるようにする。
 *
 * 注意:
 * - sessionStorage はタブを閉じると消えるため、ブラウザ／タブを閉じると
 *   そのタブのログインは切れる（共有PCではむしろ望ましい挙動）。
 * - PKCE の code-verifier だけはタブ間で共有する。パスワードリセットや
 *   メール確認のリンクが別タブで開かれてもセッション交換が成功するようにするため。
 */
const LEGACY_AUTH_KEY = 'supabase.auth.token';
const TAB_ID_SESSION_KEY = 'lms.auth.tab-id';
const TAB_ALIVE_PREFIX = 'lms.auth.alive.';
const SHARED_VERIFIER_KEY = 'supabase.auth.code-verifier';
const TAB_ORPHAN_TTL_MS = 24 * 60 * 60 * 1000; // 24時間動きのないタブのセッションは掃除

const getTabId = (): string => {
  const existing = window.sessionStorage.getItem(TAB_ID_SESSION_KEY);
  if (existing) return existing;
  const id =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.sessionStorage.setItem(TAB_ID_SESSION_KEY, id);
  return id;
};

const isVerifierKey = (key: string) => key.includes('code-verifier');

// 閉じられたタブが残した古いセッションを localStorage から掃除する
const cleanupOrphanTabSessions = (currentTabId: string) => {
  try {
    const now = Date.now();
    const tokenPrefix = `${LEGACY_AUTH_KEY}.`;
    const orphanIds: string[] = [];

    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(tokenPrefix)) continue;
      const tabId = key.slice(tokenPrefix.length);
      if (tabId === currentTabId) continue;
      const aliveRaw = window.localStorage.getItem(`${TAB_ALIVE_PREFIX}${tabId}`);
      const alive = aliveRaw ? parseInt(aliveRaw, 10) : 0;
      if (!alive || now - alive > TAB_ORPHAN_TTL_MS) {
        orphanIds.push(tabId);
      }
    }

    orphanIds.forEach((tabId) => {
      window.localStorage.removeItem(`${LEGACY_AUTH_KEY}.${tabId}`);
      window.localStorage.removeItem(`${TAB_ALIVE_PREFIX}${tabId}`);
    });
  } catch {
    // 掃除に失敗しても致命的ではないので無視
  }
};

let resolvedStorageKey = LEGACY_AUTH_KEY;
let perTabStorage: Storage | undefined;

if (typeof window !== 'undefined') {
  const tabId = getTabId();
  resolvedStorageKey = `${LEGACY_AUTH_KEY}.${tabId}`;

  // 既存ログイン（旧キーのセッション）を最初のタブへ引き継ぐ。
  // 引き継いだ後は旧キーを消すので、他の新規タブは未ログイン状態になる。
  try {
    const legacySession = window.localStorage.getItem(LEGACY_AUTH_KEY);
    if (legacySession && !window.localStorage.getItem(resolvedStorageKey)) {
      window.localStorage.setItem(resolvedStorageKey, legacySession);
      window.localStorage.removeItem(LEGACY_AUTH_KEY);
    }
  } catch {
    // 移行に失敗しても通常ログインで続行可能
  }

  // このタブの生存マーカーを更新し、古いタブのセッションを掃除
  const markAlive = () => {
    try {
      window.localStorage.setItem(`${TAB_ALIVE_PREFIX}${tabId}`, Date.now().toString());
    } catch {
      // 無視
    }
  };
  markAlive();
  cleanupOrphanTabSessions(tabId);
  window.setInterval(markAlive, 5 * 60 * 1000); // 5分ごとに生存を記録
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') markAlive();
  });

  // code-verifier はタブ間共有、それ以外はタブ固有キーで localStorage に保存
  perTabStorage = {
    getItem: (key: string) =>
      isVerifierKey(key)
        ? window.localStorage.getItem(SHARED_VERIFIER_KEY)
        : window.localStorage.getItem(key),
    setItem: (key: string, value: string) => {
      if (isVerifierKey(key)) window.localStorage.setItem(SHARED_VERIFIER_KEY, value);
      else window.localStorage.setItem(key, value);
    },
    removeItem: (key: string) => {
      if (isVerifierKey(key)) window.localStorage.removeItem(SHARED_VERIFIER_KEY);
      else window.localStorage.removeItem(key);
    },
    clear: () => window.localStorage.clear(),
    key: (index: number) => window.localStorage.key(index),
    get length() {
      return window.localStorage.length;
    },
  } as Storage;
}

/**
 * クライアントサイド用Supabaseクライアント
 * 認証セッションを適切に管理（タブごとに独立）
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,    // トークンの自動更新を有効化
    persistSession: true,      // セッションの永続化を有効化
    detectSessionInUrl: true,  // URLからセッション検出を有効化
    storage: perTabStorage,
    storageKey: resolvedStorageKey, // タブごとに分けて同時複数ログインを可能にする
    flowType: 'pkce',          // より安全な認証フロー
    // デバッグモードを有効化
    debug: process.env.NODE_ENV === 'development',
  },
  global: {
    fetch: (url, options = {}) => {
      console.log('[Supabase Fetch]', url, options.method || 'GET');
      
      // より長いタイムアウトと詳細なエラーハンドリング
      // アップロード用に十分長いタイムアウトを設定
      const isUploadRequest = url.includes('/storage/') && (options.method === 'POST' || options.method === 'PUT');
      const timeout = isUploadRequest ? 600000 : 45000; // アップロードは10分、それ以外は45秒
      const controller = new AbortController();
      
      const timeoutId = setTimeout(() => {
        console.warn('[Supabase Fetch] Timing out request to:', url);
        controller.abort();
      }, timeout);
      
      return fetch(url, {
        ...options,
        signal: controller.signal,
      }).then((response) => {
        clearTimeout(timeoutId);
        console.log('[Supabase Fetch] Response:', response.status, response.statusText);
        return response;
      }).catch((error) => {
        clearTimeout(timeoutId);
        console.error('[Supabase Fetch] Error:', error.name, error.message, 'URL:', url);
        
        if (error.name === 'AbortError') {
          throw new Error('Supabaseへの接続がタイムアウトしました。ネットワーク接続を確認してください。');
        }
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          throw new Error('ネットワークエラー: インターネット接続を確認してください。');
        }
        throw error;
      });
    },
  },
  db: {
    schema: 'public',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

/**
 * サーバーサイド用Supabaseクライアント（cookies使用）
 * 使用時にcookiesをimportして呼び出す
 */
export const createServerSupabaseClient = (cookieStore: any) => {
  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: any) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch (error) {
          // SSR中のクッキー操作エラーを無視
        }
      },
      remove(name: string, options: any) {
        try {
          cookieStore.set({ name, value: '', ...options });
        } catch (error) {
          // SSR中のクッキー操作エラーを無視
        }
      },
    },
  });
};

/**
 * ミドルウェア用Supabaseクライアント
 */
export const createMiddlewareSupabaseClient = (request: NextRequest) => {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options) {
        request.cookies.set({
          name,
          value,
          ...options,
        });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({
          name,
          value,
          ...options,
        });
      },
      remove(name: string, options) {
        request.cookies.set({
          name,
          value: '',
          ...options,
        });
        response = NextResponse.next({
          request: {
            headers: request.headers,
          },
        });
        response.cookies.set({
          name,
          value: '',
          ...options,
        });
      },
    },
  });

  return { supabase, response };
};

/**
 * 管理者権限用Supabaseクライアント（Service Role Key使用）
 */
export const createAdminSupabaseClient = () => {
  if (!supabaseServiceRoleKey) {
    throw new Error('Service Role Keyが設定されていません');
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};

/**
 * データベース型定義
 */
export type Database = {
  public: {
    Tables: {
      user_profiles: {
        Row: {
          id: string;
          display_name: string | null;
          company: string | null;
          department: string | null;
          role: 'student' | 'instructor' | 'admin';
          avatar_url: string | null;
          last_login_at: string | null;
          password_changed_at: string | null;
          is_active: boolean;
          can_skip_videos: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          company?: string | null;
          department?: string | null;
          role?: 'student' | 'instructor' | 'admin';
          avatar_url?: string | null;
          last_login_at?: string | null;
          password_changed_at?: string | null;
          is_active?: boolean;
          can_skip_videos?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
          company?: string | null;
          department?: string | null;
          role?: 'student' | 'instructor' | 'admin';
          avatar_url?: string | null;
          last_login_at?: string | null;
          password_changed_at?: string | null;
          is_active?: boolean;
          can_skip_videos?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      user_courses: {
        Row: {
          id: number;
          user_id: string;
          course_id: number;
          assigned_at: string;
          assigned_by: string | null;
          due_date: string | null;
          status: 'assigned' | 'in_progress' | 'completed' | 'overdue';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          course_id: number;
          assigned_at?: string;
          assigned_by?: string | null;
          due_date?: string | null;
          status?: 'assigned' | 'in_progress' | 'completed' | 'overdue';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          course_id?: number;
          assigned_at?: string;
          assigned_by?: string | null;
          due_date?: string | null;
          status?: 'assigned' | 'in_progress' | 'completed' | 'overdue';
          created_at?: string;
          updated_at?: string;
        };
      };
      messages: {
        Row: {
          id: number;
          sender_id: string;
          receiver_id: string | null;
          course_id: number | null;
          subject: string | null;
          content: string;
          message_type: 'private' | 'course' | 'announcement';
          is_read: boolean;
          parent_message_id: number | null;
          attachment_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          sender_id: string;
          receiver_id?: string | null;
          course_id?: number | null;
          subject?: string | null;
          content: string;
          message_type?: 'private' | 'course' | 'announcement';
          is_read?: boolean;
          parent_message_id?: number | null;
          attachment_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          sender_id?: string;
          receiver_id?: string | null;
          course_id?: number | null;
          subject?: string | null;
          content?: string;
          message_type?: 'private' | 'course' | 'announcement';
          is_read?: boolean;
          parent_message_id?: number | null;
          attachment_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      system_settings: {
        Row: {
          id: number;
          setting_key: string;
          setting_value: string | null;
          setting_type: 'string' | 'number' | 'boolean' | 'json';
          description: string | null;
          category: string;
          is_public: boolean;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          setting_key: string;
          setting_value?: string | null;
          setting_type?: 'string' | 'number' | 'boolean' | 'json';
          description?: string | null;
          category?: string;
          is_public?: boolean;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          setting_key?: string;
          setting_value?: string | null;
          setting_type?: 'string' | 'number' | 'boolean' | 'json';
          description?: string | null;
          category?: string;
          is_public?: boolean;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      courses: {
        Row: {
          id: number;
          title: string;
          description: string | null;
          thumbnail_url: string | null;
          status: 'active' | 'inactive';
          category: string | null;
          difficulty_level: 'beginner' | 'intermediate' | 'advanced' | null;
          estimated_duration: number | null;
          completion_threshold: number;
          show_viewing_notice: boolean;
          order_index: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          title: string;
          description?: string | null;
          thumbnail_url?: string | null;
          status?: 'active' | 'inactive';
          category?: string | null;
          difficulty_level?: 'beginner' | 'intermediate' | 'advanced' | null;
          estimated_duration?: number | null;
          completion_threshold?: number;
          show_viewing_notice?: boolean;
          order_index?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          title?: string;
          description?: string | null;
          thumbnail_url?: string | null;
          status?: 'active' | 'inactive';
          category?: string | null;
          difficulty_level?: 'beginner' | 'intermediate' | 'advanced' | null;
          estimated_duration?: number | null;
          completion_threshold?: number;
          show_viewing_notice?: boolean;
          order_index?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      videos: {
        Row: {
          id: number;
          course_id: number;
          title: string;
          description: string | null;
          file_url: string;
          duration: number;
          file_size: number | null;
          mime_type: string | null;
          thumbnail_url: string | null;
          order_index: number;
          status: 'active' | 'inactive';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: number;
          course_id: number;
          title: string;
          description?: string | null;
          file_url: string;
          duration: number;
          file_size?: number | null;
          mime_type?: string | null;
          thumbnail_url?: string | null;
          order_index?: number;
          status?: 'active' | 'inactive';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: number;
          course_id?: number;
          title?: string;
          description?: string | null;
          file_url?: string;
          duration?: number;
          file_size?: number | null;
          mime_type?: string | null;
          thumbnail_url?: string | null;
          order_index?: number;
          status?: 'active' | 'inactive';
          created_at?: string;
          updated_at?: string;
        };
      };
      video_view_logs: {
        Row: {
          id: number;
          user_id: string;
          video_id: number;
          course_id: number;
          session_id: string;
          start_time: string;
          end_time: string | null;
          current_position: number;
          total_watched_time: number;
          progress_percent: number;
          status: 'not_started' | 'in_progress' | 'completed';
          completed_at: string | null;
          last_updated: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          video_id: number;
          course_id: number;
          session_id?: string;
          start_time?: string;
          end_time?: string | null;
          current_position?: number;
          total_watched_time?: number;
          progress_percent?: number;
          status?: 'not_started' | 'in_progress' | 'completed';
          completed_at?: string | null;
          last_updated?: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          video_id?: number;
          course_id?: number;
          session_id?: string;
          start_time?: string;
          end_time?: string | null;
          current_position?: number;
          total_watched_time?: number;
          progress_percent?: number;
          status?: 'not_started' | 'in_progress' | 'completed';
          completed_at?: string | null;
          last_updated?: string;
          created_at?: string;
        };
      };
      course_completions: {
        Row: {
          id: number;
          user_id: string;
          course_id: number;
          completion_date: string;
          completion_rate: number;
          certificate_id: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          course_id: number;
          completion_date?: string;
          completion_rate: number;
          certificate_id: string;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string;
          course_id?: number;
          completion_date?: string;
          completion_rate?: number;
          certificate_id?: string;
          created_at?: string;
        };
      };
      certificates: {
        Row: {
          id: string;
          user_id: string;
          course_id: number;
          user_name: string;
          course_title: string;
          completion_date: string;
          pdf_url: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id: string;
          user_id: string;
          course_id: number;
          user_name: string;
          course_title: string;
          completion_date: string;
          pdf_url?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          course_id?: number;
          user_name?: string;
          course_title?: string;
          completion_date?: string;
          pdf_url?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
      };
      system_logs: {
        Row: {
          id: number;
          user_id: string | null;
          action: string;
          resource_type: string | null;
          resource_id: string | null;
          ip_address: string | null;
          user_agent: string | null;
          details: any | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          user_id?: string | null;
          action: string;
          resource_type?: string | null;
          resource_id?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          details?: any | null;
          created_at?: string;
        };
        Update: {
          id?: number;
          user_id?: string | null;
          action?: string;
          resource_type?: string | null;
          resource_id?: string | null;
          ip_address?: string | null;
          user_agent?: string | null;
          details?: any | null;
          created_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
};

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update'];