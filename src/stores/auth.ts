import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/database/supabase';
import { UserProfile } from '@/types';

export interface AuthUser {
  id: string;
  email: string;
  profile?: UserProfile;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  initialized: boolean;
}

interface AuthActions {
  setUser: (user: AuthUser | null) => void;
  setLoading: (loading: boolean) => void;
  setInitialized: (initialized: boolean) => void;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, displayName: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  updateProfile: (updates: Partial<UserProfile>) => Promise<{ error?: string }>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  changePassword: (newPassword: string) => Promise<{ error?: string }>;
  devBypassAuth: () => Promise<{ error?: string }>; // 開発用認証バイパス
}

type AuthStore = AuthState & AuthActions;

export const useAuthStore = create<AuthStore>()(
  subscribeWithSelector((set, get) => ({
    // State
    user: null,
    loading: false,
    initialized: false,

    // Actions
    setUser: (user) => set({ user }),
    setLoading: (loading) => set({ loading }),
    setInitialized: (initialized) => set({ initialized }),

    // 初期化
    initialize: async () => {
      console.log('[Auth] Initializing authentication...');
      try {
        set({ loading: true });

        // セッション取得（リトライを最小限に）
        let session = null;
        let error = null;
        
        console.log('[Auth] Getting session...');
        
        try {
          const result = await supabase.auth.getSession();
          session = result.data.session;
          error = result.error;
        } catch (fetchError) {
          console.error('[Auth] Session fetch error:', fetchError);
          error = fetchError as any;
        }
        
        console.log('[Auth] Final session data:', {
          hasSession: !!session,
          hasUser: !!session?.user,
          userEmail: session?.user?.email,
          error: error?.message
        });
        
        if (error) {
          console.error('[Auth] Session error after retries:', error);
          set({ user: null, loading: false, initialized: true });
          return;
        }

        console.log('[Auth] Session status:', session ? 'Found' : 'Not found');

        if (session?.user) {
          // プロフィール情報を取得（リトライなし）
          console.log('[Auth] Fetching user profile...');
          let profile = null;
          
          try {
            const { data, error: profileError } = await supabase
              .from('user_profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();
              
            if (!profileError) {
              profile = data;
            } else {
              console.warn('[Auth] Profile fetch failed:', profileError.message);
            }
          } catch (profileFetchError) {
            console.warn('[Auth] Profile fetch error:', profileFetchError);
          }

          const authUser: AuthUser = {
            id: session.user.id,
            email: session.user.email!,
            profile: profile || undefined,
          };

          console.log('[Auth] User authenticated:', authUser.email, 'Profile loaded:', !!profile);
          set({ user: authUser, loading: false, initialized: true });
        } else {
          console.log('[Auth] No active session');
          set({ user: null, loading: false, initialized: true });
        }
      } catch (error) {
        console.error('[Auth] Initialization error:', error);
        set({ user: null, loading: false, initialized: true });
      }
    },

    // ログイン
    signIn: async (email: string, password: string) => {
      console.log('[Auth Store] SignIn called with email:', email);
      try {
        set({ loading: true });

        console.log('[Auth Store] Calling Supabase signInWithPassword...');
        
        // タイムアウトを10秒に設定
        const authPromise = supabase.auth.signInWithPassword({
          email,
          password,
        });
        
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('認証サーバーへの接続がタイムアウトしました。ネットワーク接続を確認してください。')), 10000);
        });
        
        let result;
        try {
          result = await Promise.race([authPromise, timeoutPromise]);
        } catch (timeoutError) {
          console.error('[Auth Store] Authentication timeout:', timeoutError);
          set({ loading: false });
          return { error: (timeoutError as Error).message };
        }
        
        const { data, error } = result as any;

        console.log('[Auth Store] Supabase response:', { 
          hasData: !!data, 
          hasUser: !!data?.user,
          hasError: !!error,
          errorMessage: error?.message 
        });

        if (error) {
          console.error('[Auth Store] Supabase error:', error);
          set({ loading: false });
          
          // より具体的なエラーメッセージ
          if (error.message.includes('Invalid login credentials')) {
            return { error: 'メールアドレスまたはパスワードが正しくありません' };
          } else if (error.message.includes('Email not confirmed')) {
            return { error: 'メールアドレスの確認が完了していません。確認メールをご確認ください。' };
          } else if (error.message.includes('User not found')) {
            return { error: 'ユーザーが見つかりません' };
          }
          
          return { error: error.message };
        }

        if (data?.user) {
          console.log('[Auth Store] User authenticated, fetching profile...');
          
          // プロフィール情報取得（タイムアウトを5秒に短縮）
          const profilePromise = supabase
            .from('user_profiles')
            .select('*')
            .eq('id', data.user.id)
            .single();
            
          const profileTimeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('プロフィール取得がタイムアウトしました')), 5000);
          });
          
          let profile = null;
          try {
            const profileResult = await Promise.race([profilePromise, profileTimeoutPromise]);
            profile = (profileResult as any).data;
            console.log('[Auth Store] Profile fetched:', !!profile);
          } catch (profileError) {
            console.warn('[Auth Store] Profile fetch failed or timed out:', profileError);
            // プロフィール取得失敗でも続行（デフォルトプロフィールで続行）
          }

          // 最終ログイン日時を更新
          try {
            await supabase
              .from('user_profiles')
              .update({ 
                last_login_at: new Date().toISOString()
              })
              .eq('id', data.user.id);
            console.log('[Auth Store] Last login updated');
          } catch (updateError) {
            console.warn('[Auth Store] Failed to update last login:', updateError);
            // エラーが発生しても続行
          }

          const authUser: AuthUser = {
            id: data.user.id,
            email: data.user.email!,
            profile: profile || undefined,
          };

          console.log('[Auth Store] Setting user:', authUser.email, 'Role:', authUser.profile?.role);
          set({ user: authUser, loading: false });

          // セッションの確立を確認
          const { data: sessionData } = await supabase.auth.getSession();
          if (!sessionData?.session) {
            console.warn('[Auth Store] Session not established after login');
          }

          console.log('[Auth Store] Login successful - returning user data');
          return { user: authUser };
        }

        console.warn('[Auth Store] No user data in response');
        set({ loading: false });
        return { error: 'ユーザーデータが見つかりません' };
      } catch (error) {
        console.error('[Auth Store] Login error:', error);
        set({ loading: false });
        
        // ネットワークエラーの可能性を確認
        if (error instanceof TypeError && error.message.includes('fetch')) {
          return { error: 'ネットワークエラー: サーバーに接続できません。インターネット接続を確認してください。' };
        }
        
        return { error: (error as Error).message || '予期しないエラーが発生しました' };
      }
    },

    // ユーザー登録
    signUp: async (email: string, password: string, displayName: string) => {
      try {
        set({ loading: true });

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              display_name: displayName,
            },
          },
        });

        if (error) {
          return { error: error.message };
        }

        // メール確認が必要な場合
        if (data.user && !data.session) {
          return { error: 'メールアドレスに確認メールを送信しました。メール内のリンクをクリックしてアカウントを有効化してください。' };
        }

        return {};
      } catch (error) {
        console.error('ユーザー登録エラー:', error);
        return { error: '予期しないエラーが発生しました' };
      } finally {
        set({ loading: false });
      }
    },

    // ログアウト
    signOut: async () => {
      try {
        const currentUser = get().user;
        
        // 開発用バイパスユーザーの場合はCookieを削除
        if (currentUser?.id === 'dev-admin-001') {
          if (typeof document !== 'undefined') {
            document.cookie = 'dev-bypass-user=; path=/; max-age=0';
            console.log('[Auth] DEV MODE: Cookie cleared');
          }
          set({ user: null });
          return;
        }
        
        // システムログ記録
        if (currentUser) {
          await supabase.from('system_logs').insert({
            user_id: currentUser.id,
            action: 'logout',
            resource_type: 'user',
            resource_id: currentUser.id,
          });
        }

        await supabase.auth.signOut();
        set({ user: null });
      } catch (error) {
        console.error('ログアウトエラー:', error);
      }
    },

    // プロフィール更新
    updateProfile: async (updates: Partial<UserProfile>) => {
      try {
        const currentUser = get().user;
        if (!currentUser) {
          return { error: 'ログインが必要です' };
        }

        const { error } = await supabase
          .from('user_profiles')
          .update({
            ...updates,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentUser.id);

        if (error) {
          return { error: error.message };
        }

        // 更新されたプロフィールを取得
        const { data: updatedProfile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', currentUser.id)
          .single();

        if (updatedProfile) {
          set({
            user: {
              ...currentUser,
              profile: updatedProfile,
            },
          });
        }

        // システムログ記録
        await supabase.from('system_logs').insert({
          user_id: currentUser.id,
          action: 'profile_update',
          resource_type: 'user_profile',
          resource_id: currentUser.id,
          details: updates,
        });

        return {};
      } catch (error) {
        console.error('プロフィール更新エラー:', error);
        return { error: '予期しないエラーが発生しました' };
      }
    },

    // パスワードリセット
    resetPassword: async (email: string) => {
      try {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: typeof window !== 'undefined' 
            ? `${window.location.origin}/auth/reset-password`
            : undefined,
        });

        if (error) {
          return { error: error.message };
        }

        return {};
      } catch (error) {
        console.error('パスワードリセットエラー:', error);
        return { error: '予期しないエラーが発生しました' };
      }
    },

    // パスワード変更
    changePassword: async (newPassword: string) => {
      try {
        const currentUser = get().user;
        if (!currentUser) {
          return { error: 'ログインが必要です' };
        }

        const { error } = await supabase.auth.updateUser({
          password: newPassword,
        });

        if (error) {
          return { error: error.message };
        }

        // パスワード変更日時を更新
        await supabase
          .from('user_profiles')
          .update({
            password_changed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentUser.id);

        // システムログ記録
        await supabase.from('system_logs').insert({
          user_id: currentUser.id,
          action: 'password_change',
          resource_type: 'user',
          resource_id: currentUser.id,
        });

        return {};
      } catch (error) {
        console.error('パスワード変更エラー:', error);
        return { error: '予期しないエラーが発生しました' };
      }
    },

    // 開発用: 認証バイパス（管理者として仮ログイン）
    devBypassAuth: async () => {
      // 本番環境では使用不可
      if (process.env.NODE_ENV === 'production') {
        console.error('[Auth] Dev bypass attempted in production!');
        return { error: '本番環境では使用できません' };
      }

      console.log('[Auth] DEV MODE: Bypassing authentication...');
      
      try {
        set({ loading: true });

        // モック管理者ユーザーデータ
        const mockAdminUser: AuthUser = {
          id: 'dev-admin-001',
          email: 'admin@dev.local',
          profile: {
            id: 'dev-admin-001',
            display_name: '開発用管理者',
            company: 'デベロップメント株式会社',
            department: 'システム開発部',
            role: 'admin',
            avatar_url: undefined,
            bio: undefined,
            phone: undefined,
            last_login_at: new Date().toISOString(),
            password_changed_at: undefined,
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        };

        // ユーザーをストアに設定（initializedもtrueに設定）
        set({ 
          user: mockAdminUser, 
          loading: false,
          initialized: true  // 重要: 初期化完了フラグを設定
        });

        // 開発用バイパスCookieを設定（ミドルウェアで認識するため）
        if (typeof document !== 'undefined') {
          document.cookie = 'dev-bypass-user=dev-admin-001; path=/; max-age=86400'; // 1日有効
          console.log('[Auth] DEV MODE: Cookie set for middleware bypass');
        }

        console.log('[Auth] DEV MODE: Admin bypass successful');
        console.log('[Auth] Mock user:', mockAdminUser.email, 'Role:', mockAdminUser.profile?.role);

        return { user: mockAdminUser };
      } catch (error) {
        console.error('[Auth] DEV MODE: Bypass failed:', error);
        set({ loading: false, initialized: true });
        return { error: '開発用認証バイパスに失敗しました' };
      }
    },
  }))
);

// 認証状態の変化を監視（開発環境では簡素化）
supabase.auth.onAuthStateChange(async (event, session) => {
  console.log('[Auth State Change]', event, session ? 'with session' : 'no session');
  const store = useAuthStore.getState();

  if (event === 'SIGNED_IN' && session?.user) {
    console.log('[Auth State Change] User signed in:', session.user.email);
    
    // 開発環境では迅速にユーザーを設定（プロフィール取得は後回し）
    const authUser: AuthUser = {
      id: session.user.id,
      email: session.user.email!,
      profile: undefined, // プロフィールは後で取得
    };

    console.log('[Auth State Change] Setting user in store:', authUser.email);
    store.setUser(authUser);
    
    // バックグラウンドでプロフィールを取得（非同期）
    setTimeout(async () => {
      try {
        const { data: profile } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', session.user.id)
          .single();

        if (profile) {
          const updatedAuthUser: AuthUser = {
            ...authUser,
            profile: profile,
          };
          console.log('[Auth State Change] Profile loaded for:', updatedAuthUser.email);
          store.setUser(updatedAuthUser);
        }
      } catch (error) {
        console.warn('[Auth State Change] Profile fetch failed:', error);
      }
    }, 100);
    
  } else if (event === 'SIGNED_OUT') {
    console.log('[Auth State Change] User signed out');
    store.setUser(null);
  } else if (event === 'TOKEN_REFRESHED' && session?.user) {
    console.log('[Auth State Change] Token refreshed for:', session.user.email);
    
    const authUser: AuthUser = {
      id: session.user.id,
      email: session.user.email!,
      profile: store.user?.profile || undefined, // 既存のプロフィールを保持
    };

    store.setUser(authUser);
  }
});

// Zustandストアの購読者用フック
export const useAuth = () => {
  const store = useAuthStore();
  
  return {
    user: store.user,
    loading: store.loading,
    initialized: store.initialized,
    isAuthenticated: !!store.user,
    isAdmin: store.user?.profile?.role === 'admin',
    isLaborConsultant: store.user?.profile?.role === 'labor_consultant',
    signIn: store.signIn,
    signUp: store.signUp,
    signOut: store.signOut,
    updateProfile: store.updateProfile,
    resetPassword: store.resetPassword,
    changePassword: store.changePassword,
    initialize: store.initialize,
    devBypassAuth: store.devBypassAuth,
  };
};