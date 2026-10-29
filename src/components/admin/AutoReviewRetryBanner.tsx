'use client';

// 作成に失敗した自動添削（最終テストの添削待ち・小テストの失敗）をまとめて作り直すための案内とボタン。
// サーバー側は1回の呼び出しで時間内に終わる分だけ処理するので、残りが無くなるまで繰り返し呼ぶ。

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/database/supabase';
import { ArrowPathIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface Counts {
  final: number;
  quiz: number;
}

async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
  };
}

export function AutoReviewRetryBanner({ onDone }: { onDone?: () => void }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<Counts>({ final: 0, quiz: 0 });
  const [message, setMessage] = useState<string | null>(null);

  const loadCounts = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/auto-reviews/retry', { headers: await authHeaders() });
      const json = await res.json();
      if (res.ok) setCounts(json.counts);
    } catch {
      /* 件数が取れないときは表示しない */
    }
  }, []);

  useEffect(() => { loadCounts(); }, [loadCounts]);

  const total = counts ? counts.final + counts.quiz : 0;

  const run = async () => {
    if (!counts) return;
    if (!confirm(
      `作成に失敗した自動添削を作り直します（最終テスト ${counts.final}件・小テスト ${counts.quiz}件）。\n` +
      '最終テストは作成できたものから受講者に返却され、合格なら修了証も発行されます。\n' +
      '件数が多いと数十分かかります。終わるまでこの画面を開いたままにしてください。よろしいですか？'
    )) return;

    setRunning(true);
    setMessage(null);
    const sum: Counts = { final: 0, quiz: 0 };
    setDone(sum);
    let remaining = counts;
    try {
      // 進まなくなったら止める（同じ件数のまま失敗が続く場合など）
      for (let round = 0; round < 100; round++) {
        const res = await fetch('/api/admin/auto-reviews/retry', { method: 'POST', headers: await authHeaders() });
        const json = await res.json();
        if (!res.ok) {
          setMessage(json.error || '作り直しに失敗しました');
          break;
        }
        sum.final += json.succeeded.final;
        sum.quiz += json.succeeded.quiz;
        setDone({ ...sum });
        remaining = json.remaining;
        setCounts(remaining);

        if (remaining.final + remaining.quiz === 0) {
          setMessage('すべて作り直しました。');
          break;
        }
        if (json.stopped === 'failures') {
          setMessage(`失敗が続いたため中断しました。AI の利用上限や API キーの設定を確認してください。${json.lastError ? `（${json.lastError}）` : ''}`);
          break;
        }
        if (json.succeeded.final + json.succeeded.quiz === 0) {
          setMessage(`作り直せませんでした。${json.lastError ? `（${json.lastError}）` : ''}`);
          break;
        }
      }
    } catch {
      setMessage('通信に失敗しました。もう一度実行すると続きから作り直します。');
    }
    setRunning(false);
    onDone?.();
  };

  if (!counts || (total === 0 && !running && !message)) return null;

  return (
    <div className="mb-5 rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <ExclamationTriangleIcon className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-amber-900 dark:text-amber-100">
            {total > 0 ? (
              <>
                自動添削を作成できなかったものがあります（最終テストの添削待ち <b>{counts.final}件</b>・小テスト <b>{counts.quiz}件</b>）。
                AI の利用上限などで失敗したものは、まとめて作り直せます。
              </>
            ) : (
              <>作り直しが必要な自動添削はありません。</>
            )}
            {running && (
              <div className="mt-1 text-xs">
                作り直し中… 完了 最終テスト {done.final}件・小テスト {done.quiz}件（この画面を開いたままにしてください）
              </div>
            )}
            {!running && message && <div className="mt-1 text-xs">{message}</div>}
          </div>
        </div>
        {total > 0 && (
          <Button size="sm" onClick={run} loading={running}>
            <ArrowPathIcon className="w-4 h-4 mr-1" /> まとめて作り直す
          </Button>
        )}
      </div>
    </div>
  );
}
