'use client';

// 動画再生の不調の記録（プレイヤーが自動で送ってくる「途切れ」「復旧」「エラー」）。
// 「動画が途切れる」の問い合わせがあったとき、誰が・どの動画で・どんな状況だったかを確認する。

import { useCallback, useEffect, useState } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';

interface IssueEvent {
  type: string;
  at: string | null;
  position: number | null;
  buffered_ahead: number | null;
  src_kind: string;
  attempt: number | null;
  detail: string | null;
}
interface Issue {
  id: number;
  created_at: string;
  user_name: string;
  company: string;
  video_id: number;
  video_title: string;
  course_title: string;
  file_size: number | null;
  video_duration: number | null;
  user_agent: string;
  session: string;
  client: { connection?: string; downlink_mbps?: number | null; duration?: number | null; mobile?: boolean; src?: string };
  events: IssueEvent[];
}

const EVENT_LABEL: Record<string, string> = {
  stall: '読み込み待ち',
  stall_summary: '読み込み待ち（まとめ）',
  recover_reload: '復旧（読み直し）',
  recover_relay: '復旧（サイト経由に切替）',
  recover_primary: '復旧（配信CDNに戻す）',
  error: 'エラー',
  gave_up: '断念（エラー表示）',
  manual_retry: '手動で再試行',
};
const SRC_LABEL: Record<string, string> = { cdn: '配信CDN', relay: 'サイト経由', supabase: 'Supabase' };

const fmtPos = (sec: number | null) => {
  if (sec === null || sec === undefined) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};
const fmtSize = (b: number | null) => (b ? `${(b / 1e9).toFixed(2)} GB` : '—');
const browserOf = (ua: string) => {
  if (/iPhone|iPad/.test(ua)) return 'iOS Safari';
  if (/Android/.test(ua)) return /Chrome/.test(ua) ? 'Android Chrome' : 'Android';
  if (/Edg\//.test(ua)) return 'Edge';
  if (/Chrome\//.test(ua)) return 'Chrome';
  if (/Safari\//.test(ua)) return 'Safari';
  if (/Firefox\//.test(ua)) return 'Firefox';
  return ua ? 'その他' : '—';
};

export default function AdminPlaybackIssuesPage() {
  const [days, setDays] = useState(14);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<number | null>(null);

  const load = useCallback(async (d: number) => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/admin/playback-issues?days=${d}`, {
        headers: { Authorization: session?.access_token ? `Bearer ${session.access_token}` : '' },
      });
      const json = await res.json();
      if (res.ok) setIssues(json.issues || []);
      else alert(json.error || '取得に失敗しました');
    } catch {
      alert('取得に失敗しました');
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(days);
  }, [days, load]);

  const summary = (i: Issue) => {
    const counts: Record<string, number> = {};
    i.events.forEach((e) => (counts[e.type] = (counts[e.type] || 0) + 1));
    return Object.entries(counts)
      .map(([t, n]) => `${EVENT_LABEL[t] || t}×${n}`)
      .join('、');
  };

  return (
    <AuthGuard requiredRoles={['admin', 'instructor']}>
      <MainLayout>
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">動画再生の不調</h1>
          <p className="text-sm text-gray-500 mb-4">
            受講者の画面で「10秒以上の読み込み待ち」「自動復旧」「再生エラー」が起きると、プレイヤーがここに記録します。
            正常に再生できたときは記録されません（読み込み待ちは回数・合計時間にまとめ、1回の視聴で最大6件。60日を過ぎた記録は自動で消えます）。「動画が途切れる」の問い合わせがあったら、ここで誰が・どの動画で・どんな回線だったかを確認してください。
          </p>
          <div className="mb-4 flex items-center gap-3 text-sm">
            <label className="text-gray-600 dark:text-gray-300">期間:</label>
            <select
              className="border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
            >
              <option value={7}>7日</option>
              <option value={14}>14日</option>
              <option value={30}>30日</option>
              <option value={90}>90日</option>
            </select>
            <span className="text-gray-500">{issues.length} 件</span>
          </div>

          {loading ? (
            <div className="py-12 flex justify-center">
              <LoadingSpinner size="lg" />
            </div>
          ) : issues.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">この期間の記録はありません。</p>
          ) : (
            <div className="space-y-2">
              {issues.map((i) => (
                <div key={i.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-neutral-900">
                  <button className="w-full text-left p-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm" onClick={() => setOpen(open === i.id ? null : i.id)}>
                    <span className="text-gray-500 whitespace-nowrap">{new Date(i.created_at).toLocaleString('ja-JP')}</span>
                    <span className="font-medium text-gray-900 dark:text-gray-100">
                      {i.user_name} <span className="text-xs text-gray-500">{i.company}</span>
                    </span>
                    <span className="text-gray-700 dark:text-gray-300 truncate max-w-[22rem]" title={`${i.course_title} / ${i.video_title}`}>
                      {i.video_title || `動画 ${i.video_id}`}
                    </span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {fmtSize(i.file_size)}・{browserOf(i.user_agent)}
                      {i.client.connection ? `・回線 ${i.client.connection}` : ''}
                      {i.client.downlink_mbps ? `（${i.client.downlink_mbps}Mbps）` : ''}
                    </span>
                    <span className="text-xs text-rose-700 dark:text-rose-300">{summary(i)}</span>
                  </button>
                  {open === i.id && (
                    <div className="px-3 pb-3 text-xs text-gray-700 dark:text-gray-300">
                      <div className="mb-2 text-gray-500">
                        コース: {i.course_title || '—'} ／ 動画の長さ: {fmtPos(i.video_duration)} ／ 配信元: {i.client.src || '—'}
                      </div>
                      <table className="w-full">
                        <thead className="text-left text-gray-500">
                          <tr>
                            <th className="py-1 pr-3">時刻</th>
                            <th className="py-1 pr-3">内容</th>
                            <th className="py-1 pr-3">再生位置</th>
                            <th className="py-1 pr-3">先読み</th>
                            <th className="py-1 pr-3">経路</th>
                            <th className="py-1">詳細</th>
                          </tr>
                        </thead>
                        <tbody>
                          {i.events.map((e, k) => (
                            <tr key={k} className="border-t border-gray-100 dark:border-gray-800">
                              <td className="py-1 pr-3 whitespace-nowrap">{e.at ? new Date(e.at).toLocaleTimeString('ja-JP') : '—'}</td>
                              <td className="py-1 pr-3 whitespace-nowrap">{EVENT_LABEL[e.type] || e.type}{e.attempt ? `（${e.attempt}回目）` : ''}</td>
                              <td className="py-1 pr-3 whitespace-nowrap">{fmtPos(e.position)}</td>
                              <td className="py-1 pr-3 whitespace-nowrap">{e.buffered_ahead !== null ? `${e.buffered_ahead}秒` : '—'}</td>
                              <td className="py-1 pr-3 whitespace-nowrap">{SRC_LABEL[e.src_kind] || e.src_kind}</td>
                              <td className="py-1 break-all">{e.detail || ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="mt-2 text-gray-500 break-all">UA: {i.user_agent}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
