'use client';

// 小テストの自動添削（赤ペン・講評）を講師が確認する画面。
// 受講者には回答直後に「講師　担当講師の名前」の署名で返却済み。講師が確認（必要なら修正）すると、
// 確認した講師と日時が記録され、学習記録PDFにも載る（受講者に見える署名は変わらない）。複数をまとめて確認することもできる。

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { RedPenView } from '@/components/quiz/RedPenView';
import { supabase } from '@/lib/database/supabase';
import { revertSegment, type RedPenSegment } from '@/lib/quiz/redpen';
import { useAuth } from '@/stores/auth';

interface AutoQuestion {
  id: number;
  question_text: string;
  answer_text: string;
  comment: string | null;
  markup: RedPenSegment[] | null;
}

interface AutoItem {
  id: number;
  quiz_id: number;
  user_id: string;
  student_name: string;
  company: string;
  course_title: string;
  quiz_title: string;
  status: 'pending' | 'ready' | 'failed';
  /** 「講師　名前」 */
  signature: string;
  error: string | null;
  generated_at: string | null;
  updated_at: string | null;
  edited_at: string | null;
  confirmed: boolean;
  confirmed_at: string | null;
  reviewer_name: string | null;
  review_comment: string | null;
  questions: AutoQuestion[];
}

async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
  };
}

const statusMeta = (item: AutoItem): { label: string; cls: string } => {
  if (item.status === 'pending') return { label: '作成中', cls: 'bg-gray-100 text-gray-600' };
  if (item.status === 'failed') return { label: '作成失敗', cls: 'bg-red-100 text-red-700' };
  if (item.confirmed) return { label: '確認済み', cls: 'bg-green-100 text-green-700' };
  return { label: '返却済み・未確認', cls: 'bg-yellow-100 text-yellow-700' };
};

export function QuizAutoReviewsPanel() {
  const { user } = useAuth();
  const myName = user?.profile?.display_name || user?.email || '';

  const [filter, setFilter] = useState<'unconfirmed' | 'all'>('unconfirmed');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AutoItem[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [expanded, setExpanded] = useState<number | null>(null);
  // 開いている添削の編集内容
  const [draftComment, setDraftComment] = useState('');
  const [draftQuestions, setDraftQuestions] = useState<Record<number, { comment: string; markup: RedPenSegment[] | null }>>({});
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState<number | null>(null);

  const load = useCallback(async (f: 'unconfirmed' | 'all') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/quiz-auto-reviews?filter=${f}`, { headers: await authHeaders() });
      const json = await res.json();
      if (res.ok) setItems(json.items || []);
      else alert(json.error || '取得に失敗しました');
    } catch {
      alert('取得に失敗しました');
    }
    setSelected(new Set());
    setLoading(false);
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  const confirmable = items.filter((i) => i.status === 'ready' && !i.confirmed);
  const allSelected = confirmable.length > 0 && confirmable.every((i) => selected.has(i.id));

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) confirmable.forEach((i) => next.delete(i.id));
      else confirmable.forEach((i) => next.add(i.id));
      return next;
    });

  const openItem = (item: AutoItem) => {
    if (expanded === item.id) {
      setExpanded(null);
      return;
    }
    setExpanded(item.id);
    setDraftComment(item.review_comment || '');
    const d: Record<number, { comment: string; markup: RedPenSegment[] | null }> = {};
    item.questions.forEach((q) => { d[q.id] = { comment: q.comment || '', markup: q.markup }; });
    setDraftQuestions(d);
  };

  const confirm = async (payload: { id: number; review_comment?: string | null; question_reviews?: unknown }[]) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/quiz-auto-reviews', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ items: payload }),
      });
      const json = await res.json();
      if (res.ok) {
        if (json.skipped?.length) alert(`${json.confirmed}件を確認しました（${json.skipped.length}件は作成中・作成失敗のため確認できませんでした）`);
        setExpanded(null);
        await load(filter);
      } else {
        alert(json.error || '確認に失敗しました');
      }
    } catch {
      alert('確認に失敗しました');
    }
    setSaving(false);
  };

  const confirmOne = (item: AutoItem) =>
    confirm([
      {
        id: item.id,
        review_comment: draftComment.trim() ? draftComment : null,
        question_reviews: item.questions.map((q) => ({
          question_id: q.id,
          comment: draftQuestions[q.id]?.comment ?? q.comment ?? '',
          markup: draftQuestions[q.id]?.markup ?? q.markup,
        })),
      },
    ]);

  const confirmSelected = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    if (!window.confirm(`選択した ${ids.length} 件の自動添削を、内容を確認済みにします（確認者：${myName}）。よろしいですか？`)) return;
    confirm(ids.map((id) => ({ id })));
  };

  const regenerate = async (item: AutoItem) => {
    if (item.confirmed && !window.confirm('作り直すと確認済みの記録が外れます。よろしいですか？')) return;
    setRegenerating(item.id);
    try {
      const res = await fetch('/api/admin/quiz-auto-reviews/regenerate', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ id: item.id }),
      });
      const json = await res.json();
      if (!res.ok) alert(json.error || '作り直しに失敗しました');
      setExpanded(null);
      await load(filter);
    } catch {
      alert('作り直しに失敗しました');
    }
    setRegenerating(null);
  };

  const setQuestionDraft = (questionId: number, patch: Partial<{ comment: string; markup: RedPenSegment[] | null }>) =>
    setDraftQuestions((prev) => ({ ...prev, [questionId]: { ...(prev[questionId] || { comment: '', markup: null }), ...patch } }));

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        受講者が小テストに回答すると、AIが赤ペンと講評を作り、コースの担当講師の署名（「講師　名前」）で受講者にすぐ返却します。
        内容を確認したいときはここで開いてください。「確認済みにする」を押すと、確認者（{myName || 'あなた'}）と日時が記録され、学習記録PDFにも載ります（受講者に見える署名は変わりません）。
      </p>

      <div className="border-b border-gray-200 dark:border-gray-700 mb-4 flex gap-4">
        <button className={`pb-2 text-sm font-medium ${filter === 'unconfirmed' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`} onClick={() => setFilter('unconfirmed')}>未確認</button>
        <button className={`pb-2 text-sm font-medium ${filter === 'all' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`} onClick={() => setFilter('all')}>すべて</button>
      </div>

      {confirmable.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <label className="inline-flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
            <input type="checkbox" checked={allSelected} onChange={toggleAll} /> 未確認をすべて選択
          </label>
          <Button size="sm" onClick={confirmSelected} disabled={selected.size === 0} loading={saving}>
            選択したものを確認済みにする{selected.size > 0 ? `（${selected.size}件）` : ''}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex justify-center"><LoadingSpinner size="lg" /></div>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500 py-8 text-center">{filter === 'unconfirmed' ? '未確認の自動添削はありません。' : '自動添削はまだありません。'}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const meta = statusMeta(item);
            const canConfirm = item.status === 'ready' && !item.confirmed;
            return (
              <div key={item.id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <div className="flex items-center gap-3 p-4">
                  {canConfirm ? (
                    <input type="checkbox" checked={selected.has(item.id)} onChange={() => toggle(item.id)} title="まとめて確認する" />
                  ) : (
                    <span className="w-[13px]" />
                  )}
                  <button className="flex-1 min-w-0 flex items-center justify-between gap-3 text-left" onClick={() => openItem(item)}>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 dark:text-gray-100">{item.student_name} <span className="text-xs text-gray-500">{item.company}</span></div>
                      <div className="text-xs text-gray-500">
                        {item.course_title} ／ {item.quiz_title}
                        {item.generated_at && <> ／ 作成 {new Date(item.generated_at).toLocaleString('ja-JP')}</>}
                        {' ／ '}{item.signature}
                        {item.confirmed && item.reviewer_name && <> ／ 確認 {item.reviewer_name}</>}
                      </div>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded whitespace-nowrap ${meta.cls}`}>{meta.label}</span>
                  </button>
                </div>

                {expanded === item.id && (
                  <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-4 space-y-4">
                    {item.status === 'failed' && (
                      <p className="text-sm text-red-600">作成に失敗しました{item.error ? `（${item.error}）` : ''}。「AIで作り直す」を押してください。</p>
                    )}
                    {item.status === 'pending' && <p className="text-sm text-gray-500">AIが作成中です。しばらくしてから開き直してください。</p>}

                    {item.questions.map((q, qi) => {
                      const d = draftQuestions[q.id] || { comment: q.comment || '', markup: q.markup };
                      const editable = !item.confirmed && item.status === 'ready';
                      return (
                        <div key={q.id} className="rounded border border-gray-100 dark:border-gray-700 p-3">
                          <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">問{qi + 1}. {q.question_text}</div>
                          <div className="text-xs text-gray-500 mb-1">受講者の回答（赤ペン）</div>
                          {d.markup && d.markup.length > 0 ? (
                            <RedPenView
                              segments={d.markup}
                              reviewerName={item.signature}
                              reviewedAt={item.confirmed_at || item.generated_at}
                              showSignature={false}
                              editable={editable ? {
                                onNoteChange: (i, note) => setQuestionDraft(q.id, { markup: d.markup!.map((sg, idx) => (idx === i ? { ...sg, note } : sg)) }),
                                onRevert: (i) => setQuestionDraft(q.id, { markup: revertSegment(d.markup!, i) }),
                              } : undefined}
                            />
                          ) : (
                            <div className="text-[15px] leading-7 text-gray-800 dark:text-gray-200 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 rounded p-3 border border-gray-100 dark:border-gray-700">
                              {q.answer_text || '（回答なし）'}
                            </div>
                          )}
                          <textarea
                            className="w-full mt-2 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                            rows={2}
                            value={d.comment}
                            disabled={!editable}
                            onChange={(e) => setQuestionDraft(q.id, { comment: e.target.value })}
                            placeholder="この設問への講評"
                          />
                        </div>
                      );
                    })}

                    {item.questions.length > 1 && (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">全体のコメント</label>
                        <textarea
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                          rows={3}
                          value={draftComment}
                          disabled={item.confirmed || item.status !== 'ready'}
                          onChange={(e) => setDraftComment(e.target.value)}
                        />
                      </div>
                    )}

                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {item.confirmed && (
                        <span className="text-sm text-green-700 mr-auto">
                          確認済み（確認者：{item.reviewer_name}{item.confirmed_at ? `／${new Date(item.confirmed_at).toLocaleString('ja-JP')}` : ''}）
                          {item.edited_at ? '・講師が修正' : ''}
                        </span>
                      )}
                      <Button variant="outline" size="sm" onClick={() => regenerate(item)} loading={regenerating === item.id} disabled={saving}>
                        ✨ AIで作り直す
                      </Button>
                      {canConfirm && (
                        <Button size="sm" onClick={() => confirmOne(item)} loading={saving} disabled={regenerating !== null}>
                          確認済みにする（確認者：{myName}）
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
