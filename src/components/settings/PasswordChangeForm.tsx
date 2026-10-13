'use client';

// 設定 → セキュリティ：パスワード変更（強さメーター・条件チェック・パスワードの提案）

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import {
  PASSWORD_MIN_LENGTH,
  PasswordInput,
  PasswordStrengthField,
  evaluatePassword,
  generatePassword,
} from '@/components/ui/PasswordStrength';
import { supabase } from '@/lib/database/supabase';
import {
  CheckCircleIcon,
  ClipboardDocumentIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { CheckIcon as CheckIconSolid } from '@heroicons/react/24/solid';

interface PasswordChangeFormProps {
  /** ログイン中の人のメールアドレス（現在のパスワードの確認に使う） */
  email: string;
}

export function PasswordChangeForm({ email }: PasswordChangeFormProps) {
  const [form, setForm] = useState({ current: '', new: '', confirm: '' });
  const [changing, setChanging] = useState(false);
  const [revealCurrent, setRevealCurrent] = useState(false);
  const [revealNew, setRevealNew] = useState(false);
  const [suggested, setSuggested] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const strength = evaluatePassword(form.new);
  const confirmMatches = form.confirm.length > 0 && form.confirm === form.new;
  const sameAsCurrent = form.new.length > 0 && form.new === form.current;
  const canSubmit = !!form.current && strength.requiredMet && confirmMatches && !sameAsCurrent && !changing;

  const update = (patch: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setMessage(null);
  };

  /** 強いパスワードを作って新しいパスワードと確認欄に入れる（見えるように表示に切り替える） */
  const suggest = () => {
    const pw = generatePassword();
    update({ new: pw, confirm: pw });
    setSuggested(pw);
    setRevealNew(true);
    setCopied(false);
  };

  const copySuggested = async () => {
    if (!suggested) return;
    try {
      await navigator.clipboard.writeText(suggested);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  const submit = async () => {
    if (!canSubmit || !email) return;
    setChanging(true);
    setMessage(null);
    try {
      // 現在のパスワードを実際に検証する（誤入力のまま変更してしまう事故を防ぐ）
      const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: form.current });
      if (verifyError) {
        setMessage({ type: 'error', text: '現在のパスワードが正しくありません。' });
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: form.new });
      if (error) throw error;

      setForm({ current: '', new: '', confirm: '' });
      setSuggested(null);
      setRevealNew(false);
      setRevealCurrent(false);
      setMessage({ type: 'success', text: 'パスワードを変更しました。次回から新しいパスワードでログインしてください。' });
    } catch (error) {
      console.error('パスワード変更エラー:', error);
      setMessage({ type: 'error', text: 'パスワードの変更に失敗しました。時間をおいて再度お試しください。' });
    } finally {
      setChanging(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="max-w-lg"
      noValidate
    >
      <h3 className="text-base font-semibold text-gray-900 dark:text-white">パスワード変更</h3>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        {PASSWORD_MIN_LENGTH}文字以上で、英字と数字を両方使ってください。「パスワードを提案」で強いパスワードを作ることもできます。
      </p>

      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          className={`mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm ${
            message.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300'
              : 'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
          ) : (
            <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="mt-5 space-y-5">
        <div>
          <label htmlFor="current-password" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            現在のパスワード
          </label>
          <PasswordInput
            id="current-password"
            name="current-password"
            autoComplete="current-password"
            value={form.current}
            onChange={(e) => update({ current: e.target.value })}
            revealed={revealCurrent}
            onRevealedChange={setRevealCurrent}
            disabled={changing}
          />
        </div>

        <div>
          <PasswordStrengthField
            id="new-password"
            name="new-password"
            label="新しいパスワード"
            autoComplete="new-password"
            value={form.new}
            onValueChange={(value) => {
              update({ new: value });
              if (value !== suggested) setSuggested(null);
            }}
            revealed={revealNew}
            onRevealedChange={setRevealNew}
            invalid={sameAsCurrent}
            disabled={changing}
          />
          {sameAsCurrent && <p className="mt-2 text-sm text-red-600 dark:text-red-400">現在と同じパスワードは使えません。</p>}
          <div className="mt-3">
            <Button type="button" variant="outline" size="sm" onClick={suggest} disabled={changing}>
              <SparklesIcon className="mr-1.5 h-4 w-4 text-indigo-500" />
              パスワードを提案
            </Button>
          </div>
          {suggested && suggested === form.new && (
            <div className="mt-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-800 dark:bg-indigo-900/20">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-indigo-800 dark:text-indigo-200">提案したパスワード</span>
                <code className="rounded bg-white px-2 py-0.5 font-mono text-base tracking-wide text-gray-900 dark:bg-neutral-900 dark:text-gray-100">
                  {suggested}
                </code>
                <button
                  type="button"
                  onClick={copySuggested}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-900/40"
                >
                  {copied ? <CheckIconSolid className="h-3.5 w-3.5" /> : <ClipboardDocumentIcon className="h-3.5 w-3.5" />}
                  {copied ? 'コピーしました' : 'コピー'}
                </button>
              </div>
              <p className="mt-1.5 text-xs text-indigo-800 dark:text-indigo-200">
                新しいパスワードと確認欄に入れました。メモやパスワード管理アプリに控えてから「パスワードを変更」を押してください。
              </p>
            </div>
          )}
        </div>

        <div>
          <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
            新しいパスワード（確認）
          </label>
          <PasswordInput
            id="confirm-password"
            name="confirm-password"
            autoComplete="new-password"
            value={form.confirm}
            onChange={(e) => update({ confirm: e.target.value })}
            revealed={revealNew}
            onRevealedChange={setRevealNew}
            invalid={form.confirm.length > 0 && !confirmMatches}
            disabled={changing}
          />
          {form.confirm.length > 0 && (
            <p
              className={`mt-1.5 flex items-center gap-1 text-sm ${
                confirmMatches ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}
            >
              {confirmMatches && <CheckIconSolid className="h-4 w-4" />}
              {confirmMatches ? '一致しています' : '新しいパスワードと一致しません'}
            </p>
          )}
        </div>

        <div className="border-t border-gray-200 pt-4 dark:border-neutral-800">
          <Button type="submit" disabled={!canSubmit} loading={changing} className="w-full sm:w-auto">
            {changing ? '変更中...' : 'パスワードを変更'}
          </Button>
        </div>
      </div>
    </form>
  );
}
