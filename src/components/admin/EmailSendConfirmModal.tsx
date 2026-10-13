'use client';

// メール送信前の再確認モーダル（管理者がシステムから受講者へ送るとき）。
// 宛先・件名・本文を確かめてから /api/admin/email/send で1人1通ずつ送る。

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/database/supabase';
import { CheckCircleIcon, EnvelopeIcon, ExclamationTriangleIcon, XMarkIcon } from '@heroicons/react/24/outline';

export interface EmailRecipient {
  id: string;
  display_name: string | null;
  email: string | null;
}

interface EmailSendConfirmModalProps {
  recipients: EmailRecipient[];
  subject: string;
  body: string;
  /** 記録用（例：会社名） */
  context?: string;
  /** sent=true なら送信まで完了した */
  onClose: (sent: boolean) => void;
}

async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
  };
}

export function EmailSendConfirmModal({ recipients, subject, body, context, onClose }: EmailSendConfirmModalProps) {
  // 同じ依頼を二重に送らないための ID（モーダルを開くたびに新しくする）
  const requestId = useMemo(
    () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`),
    []
  );
  const [config, setConfig] = useState<{ configured: boolean; from: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ sent: number; failed: { to: string; error: string }[]; missing_email: number } | null>(null);

  const withEmail = recipients.filter((r) => r.email);
  const withoutEmail = recipients.length - withEmail.length;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/email/send', { headers: await authHeaders() });
        const json = await res.json();
        if (res.ok) setConfig(json);
        else setError(json.error || '送信の設定を確認できませんでした');
      } catch {
        setError('送信の設定を確認できませんでした');
      }
    })();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !sending && onClose(!!result && result.sent > 0);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sending, result, onClose]);

  const send = async () => {
    setSending(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/email/send', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ user_ids: withEmail.map((r) => r.id), subject, body, request_id: requestId, context }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'メールを送信できませんでした');
      setResult(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const close = () => !sending && onClose(!!result && result.sent > 0);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="email-confirm-title"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <div className="flex max-h-[95vh] w-full flex-col rounded-t-xl bg-white shadow-xl dark:bg-neutral-900 sm:max-h-[90vh] sm:max-w-xl sm:rounded-lg">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-4 dark:border-neutral-800 sm:px-6">
          <h3 id="email-confirm-title" className="text-lg font-semibold text-gray-900 dark:text-white">
            {result ? '送信結果' : 'この内容で送信しますか？'}
          </h3>
          <button
            type="button"
            onClick={close}
            disabled={sending}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-neutral-800"
            aria-label="閉じる"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm sm:px-6">
          {result ? (
            <>
              {result.sent > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-green-800 dark:border-green-800 dark:bg-green-900/20 dark:text-green-300">
                  <CheckCircleIcon className="h-5 w-5 flex-shrink-0" />
                  <span>{result.sent}名に送信しました。</span>
                </div>
              )}
              {result.failed.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                  <p className="mb-1 font-medium">{result.failed.length}名に送信できませんでした。</p>
                  <ul className="list-disc space-y-0.5 pl-5 text-xs">
                    {result.failed.map((f) => (
                      <li key={f.to}>
                        {f.to}：{f.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.missing_email > 0 && (
                <p className="text-xs text-gray-500">メールアドレスが無い{result.missing_email}名には送っていません。</p>
              )}
            </>
          ) : (
            <>
              {error && (
                <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                  <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              {config && !config.configured && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
                  <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0" />
                  <span>メール送信の設定（Resend の API キー）がまだのため、送信できません。</span>
                </div>
              )}

              <dl className="space-y-3">
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">送信元</dt>
                  <dd className="text-gray-900 dark:text-gray-100">{config?.from || '…'}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    宛先（{withEmail.length}名・1人ずつ別々のメールで送ります）
                  </dt>
                  <dd>
                    <ul className="mt-1 max-h-36 space-y-0.5 overflow-y-auto rounded border border-gray-200 p-2 text-xs text-gray-700 dark:border-neutral-700 dark:text-gray-300">
                      {withEmail.map((r) => (
                        <li key={r.id} className="flex gap-2">
                          <span className="min-w-0 flex-1 truncate">{r.display_name || '（名前なし）'}</span>
                          <span className="min-w-0 truncate text-gray-500">{r.email}</span>
                        </li>
                      ))}
                    </ul>
                    {withoutEmail > 0 && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">メールアドレスが無い{withoutEmail}名には送りません。</p>
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">件名</dt>
                  <dd className="text-gray-900 dark:text-gray-100">{subject}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-gray-500 dark:text-gray-400">本文</dt>
                  <dd>
                    <pre className="mt-1 max-h-60 overflow-y-auto whitespace-pre-wrap rounded border border-gray-200 bg-gray-50 p-3 font-sans text-xs leading-relaxed text-gray-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-gray-200">
                      {body}
                    </pre>
                  </dd>
                </div>
              </dl>
              <p className="text-xs text-gray-500 dark:text-gray-400">送信したメールは取り消せません。宛先と内容をもう一度ご確認ください。</p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-neutral-800 sm:px-6">
          {result ? (
            <Button onClick={close}>閉じる</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close} disabled={sending}>
                キャンセル
              </Button>
              <Button
                onClick={send}
                loading={sending}
                disabled={!config?.configured || withEmail.length === 0 || sending}
                className="bg-indigo-600 text-white hover:bg-indigo-700"
              >
                <EnvelopeIcon className="mr-1 h-4 w-4" />
                {withEmail.length}名に送信する
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
