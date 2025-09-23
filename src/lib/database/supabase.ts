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
 * クライアントサイド用Supabaseクライアント
 * 認証セッションを適切に管理
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,    // トークンの自動更新を有効化
    persistSession: true,      // セッションの永続化を有効化
    detectSessionInUrl: true,  // URLからセッション検出を有効化
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'supabase.auth.token',
    flowType: 'pkce',          // より安全な認証フロー
    // デバッグモードを有効化
    debug: process.env.NODE_ENV === 'development',
  },
  global: {
    fetch: (url, options = {}) => {
      console.log('[Supabase Fetch]', url, options.method || 'GET');
      
      // より長いタイムアウトと詳細なエラーハンドリング
      const timeout = 45000; // 45秒のタイムアウト
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