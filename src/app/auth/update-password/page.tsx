'use client';

// パスワード再設定メールのリンク先：新しいパスワードを決める画面。
//
// メールのリンクは Supabase のテンプレートで
//   {{ .SiteURL }}/auth/update-password?token_hash={{ .TokenHash }}&type=recovery
// にしておく。token_hash をこの画面（ブラウザ）で verifyOtp するので、
// 再設定を申し込んだのとは別のブラウザ・端末でメールを開いても使える。
// 既定テンプレート（{{ .ConfirmationURL }} → ?code=...）で来た場合は、
// Supabase クライアントの detectSessionInUrl（PKCE）がログイン状態にする。

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import {
  PASSWORD_MIN_LENGTH,
  PasswordInput,
  PasswordStrengthField,
  evaluatePassword,
  generatePassword,
} from '@/components/ui/PasswordStrength';
import { supabase } from '@/lib/database/supabase';
import { CheckCircleIcon, ExclamationTriangleIcon, SparklesIcon } from '@heroicons/react/24/outline';
import { CheckIcon as CheckIconSolid } from '@heroicons/react/24/solid';

type Phase = 'verifying' | 'ready' | 'invalid' | 'done';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('verifying');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get('token_hash');
      const type = params.get('type');
      try {
        if (tokenHash && type === 'recovery') {
          const { error: verifyError } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
          if (cancelled) return;
          // トークンは1回しか使えないので、再読み込みで失敗しないよう URL から消す
          window.history.replaceState(null, '', window.location.pathname);
          setPhase(verifyError ? 'invalid' : 'ready');
          return;
        }
        // ?code=...（PKCE）は detectSessionInUrl が処理する。少し待ってからログイン状態を確認する
        if (params.get('code')) await new Promise((r) => setTimeout(r, 800));
        const { data: { session } } = await supabase.auth.getSession();
        if (!cancelled) setPhase(session ? 'ready' : 'invalid');
      } catch {
        if (!cancelled) setPhase('invalid');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const strength = evaluatePassword(password);
  const matches = confirm.length > 0 && confirm === password;
  const canSubmit = strength.requiredMet && matches && !saving;

  const suggest = () => {
    const pw = generatePassword();
    setPassword(pw);
    setConfirm(pw);
    setRevealed(true);
    setError(null);
  };

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(
          /different from the old password/i.test(updateError.message)
            ? '今までと同じパスワードは使えません。別のパスワードにしてください。'
            : 'パスワードを変更できませんでした。リンクの有効期限が切れている可能性があります。もう一度メールを送ってください。'
        );
        return;
      }
      setPhase('done');
    } catch {
      setError('パスワードを変更できませんでした。時間をおいて再度お試しください。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AuthLayout>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h2 className="mb-2 text-3xl font-bold text-gray-900 dark:text-white">新しいパスワードの設定</h2>
          {phase === 'ready' && (
            <p className="text-gray-600 dark:text-gray-400">新しいパスワードを決めてください。</p>
          )}
        </div>

        <div className="rounded-lg border bg-white p-6 shadow-sm dark:bg-neutral-900 dark:shadow-gray-900/20">
          {phase === 'verifying' && (
            <div className="flex flex-col items-center gap-3 py-8 text-sm text-gray-600 dark:text-gray-400">
              <LoadingSpinner size="lg" />
              リンクを確認しています…
            </div>
          )}

          {phase === 'invalid' && (
            <div className="space-y-5 text-center">
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
                <span>
                  このリンクは使えません（有効期限が切れたか、すでに使われています）。お手数ですが、もう一度パスワード再設定のメールを送ってください。
                </span>
              </div>
              <Link href="/auth/reset-password">
                <Button className="w-full">再設定のメールを送る</Button>
              </Link>
              <Link href="/auth/login" className="block text-sm text-blue-600 hover:underline">
                ログインページに戻る
              </Link>
            </div>
          )}

          {phase === 'done' && (
            <div className="space-y-5 text-center">
              <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-left text-sm text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
                <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
                <span>パスワードを変更しました。次回からは新しいパスワードでログインしてください。</span>
              </div>
              <Button className="w-full" onClick={() => router.replace('/dashboard')}>
                学習を始める
              </Button>
            </div>
          )}

          {phase === 'ready' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
              className="space-y-5"
              noValidate
            >
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {PASSWORD_MIN_LENGTH}文字以上で、英字と数字を両方使ってください。
              </p>
              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                  <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              <div>
                <PasswordStrengthField
                  id="new-password"
                  name="new-password"
                  label="新しいパスワード"
                  autoComplete="new-password"
                  value={password}
                  onValueChange={(value) => {
                    setPassword(value);
                    setError(null);
                  }}
                  revealed={revealed}
                  onRevealedChange={setRevealed}
                  disabled={saving}
                />
                <div className="mt-3">
                  <Button type="button" variant="outline" size="sm" onClick={suggest} disabled={saving}>
                    <SparklesIcon className="mr-1.5 h-4 w-4 text-indigo-500" />
                    パスワードを提案
                  </Button>
                </div>
              </div>
              <div>
                <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  新しいパスワード（確認）
                </label>
                <PasswordInput
                  id="confirm-password"
                  name="confirm-password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => {
                    setConfirm(e.target.value);
                    setError(null);
                  }}
                  revealed={revealed}
                  onRevealedChange={setRevealed}
                  invalid={confirm.length > 0 && !matches}
                  disabled={saving}
                />
                {confirm.length > 0 && (
                  <p className={`mt-1.5 flex items-center gap-1 text-sm ${matches ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    {matches && <CheckIconSolid className="h-4 w-4" />}
                    {matches ? '一致しています' : '新しいパスワードと一致しません'}
                  </p>
                )}
              </div>
              {revealed && password && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  パスワードはメモやパスワード管理アプリに控えておいてください。
                </p>
              )}
              <Button type="submit" className="w-full" disabled={!canSubmit} loading={saving}>
                {saving ? '変更中...' : 'パスワードを変更'}
              </Button>
            </form>
          )}
        </div>
      </div>
    </AuthLayout>
  );
}
