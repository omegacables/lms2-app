'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { RedPenView } from '@/components/quiz/RedPenView';
import { supabase } from '@/lib/database/supabase';
import { useAuth } from '@/stores/auth';
import { revertSegment, type RedPenSegment } from '@/lib/quiz/redpen';
import { CheckCircleIcon, ClockIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface SubQuestion {
  id: number;
  question_text: string;
  answer_text: string;
  // 選択式（提出→添削）
  choices: string[];
  correct_index: number | null;
  explanation: string;
  selected_index: number | null;
  selected_text: string;
  auto_is_correct: boolean | null;
}
interface QuestionReview {
  question_id: number;
  is_correct: boolean | null;
  comment: string | null;
  markup?: RedPenSegment[] | null;
}
interface Submission {
  quiz_id: number;
  user_id: string;
  student_name: string;
  company: string;
  course_id: number;
  course_title: string;
  quiz_title: string;
  quiz_type: 'choice' | 'essay';
  grading_mode: 'auto' | 'review';
  answer_style: 'plain' | 'generated';
  submitted_at: string;
  status: 'pending' | 'passed' | 'needs_revision';
  questions: SubQuestion[];
  latest_review: {
    result: string;
    review_comment: string | null;
    explanation?: string | null;
    question_reviews?: QuestionReview[];
    reviewed_at: string;
  } | null;
}

interface Mark {
  is_correct: boolean | null;
  comment: string;
  markup: RedPenSegment[] | null;
}

async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
  };
}

const statusMeta: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
  pending: { label: '添削待ち', cls: 'bg-yellow-100 text-yellow-700', icon: <ClockIcon className="w-4 h-4" /> },
  passed: { label: '合格', cls: 'bg-green-100 text-green-700', icon: <CheckCircleIcon className="w-4 h-4" /> },
  needs_revision: { label: '要再提出', cls: 'bg-red-100 text-red-700', icon: <ExclamationTriangleIcon className="w-4 h-4" /> },
};

/** 添削対象の文章（選択式は選んだ回答文、記述式は記述） */
const targetText = (s: Submission, q: SubQuestion) => (s.quiz_type === 'choice' ? q.selected_text : q.answer_text);

export default function AdminEssayReviewsPage() {
  const { user } = useAuth();
  const myName = user?.profile?.display_name || user?.email || '';

  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [explanation, setExplanation] = useState('');
  const [marks, setMarks] = useState<Record<number, Mark>>({}); // key: question_id
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);
  const [aiResult, setAiResult] = useState<'passed' | 'needs_revision' | null>(null);
  // 下書き生成中に別の提出を開いた場合、古い結果で上書きしないための現在の行
  const openKeyRef = useRef<string | null>(null);

  const load = useCallback(async (f: 'pending' | 'all') => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/essay-reviews?status=${f}`, { headers: await authHeaders() });
      const json = await res.json();
      if (res.ok) setSubs(json.submissions || []);
      else alert(json.error || '取得に失敗しました');
    } catch {
      alert('取得に失敗しました');
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(filter); }, [filter, load]);

  const keyOf = (s: Submission) => `${s.quiz_id}-${s.user_id}`;

  const generateAiDraft = async (s: Submission) => {
    const requestKey = keyOf(s);
    setAiLoading(true);
    try {
      const res = await fetch('/api/admin/essay-reviews/ai-draft', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ quiz_id: s.quiz_id, user_id: s.user_id }),
      });
      const json = await res.json();
      if (openKeyRef.current !== requestKey) return; // すでに別の提出を開いている
      if (res.ok) {
        setComment(json.comment || '');
        setExplanation(json.explanation || '');
        setAiResult(json.result === 'passed' ? 'passed' : json.result === 'needs_revision' ? 'needs_revision' : null);
        const byQ = new Map<number, QuestionReview>(
          (json.question_reviews || []).map((r: QuestionReview) => [r.question_id, r])
        );
        setMarks((prev) => {
          const next: Record<number, Mark> = { ...prev };
          s.questions.forEach((q) => {
            const r = byQ.get(q.id);
            if (!r) return;
            next[q.id] = {
              is_correct: r.is_correct ?? prev[q.id]?.is_correct ?? null,
              comment: r.comment || '',
              markup: r.markup && r.markup.length > 0 ? r.markup : null,
            };
          });
          return next;
        });
        setAiUsed(true);
      } else {
        alert(json.error || 'AI下書きの生成に失敗しました');
      }
    } catch {
      alert('AI下書きの生成に失敗しました');
    }
    setAiLoading(false);
  };

  const openRow = (s: Submission) => {
    const k = keyOf(s);
    if (expanded === k) { setExpanded(null); openKeyRef.current = null; return; }
    setExpanded(k);
    openKeyRef.current = k;
    setAiUsed(false);
    setAiResult(null);

    // 添削待ち（＝新しい提出）は前回の添削を引き継がない。添削済みを開き直したときは返却内容を表示する
    const keepPrevious = s.status !== 'pending';
    setComment(keepPrevious ? s.latest_review?.review_comment || '' : '');
    setExplanation(keepPrevious ? s.latest_review?.explanation || '' : '');

    const prev = new Map<number, QuestionReview>(
      (s.latest_review?.question_reviews || []).map((r) => [r.question_id, r])
    );
    const init: Record<number, Mark> = {};
    s.questions.forEach((q) => {
      const p = keepPrevious ? prev.get(q.id) : undefined;
      init[q.id] = {
        is_correct: p ? p.is_correct : q.auto_is_correct,
        comment: p?.comment || '',
        markup: p?.markup && p.markup.length > 0 ? p.markup : null,
      };
    });
    setMarks(init);

    // 添削待ちは開いた時点で赤ペンの下書きを作る（最終確定は講師が返却ボタンで行う）
    if (s.status === 'pending') generateAiDraft(s);
  };

  const setMark = (questionId: number, patch: Partial<Mark>) => {
    setMarks((m) => ({
      ...m,
      [questionId]: { ...(m[questionId] || { is_correct: null, comment: '', markup: null }), ...patch },
    }));
  };

  const editNote = (questionId: number, index: number, note: string) => {
    const current = marks[questionId]?.markup;
    if (!current) return;
    const next = current.map((sg, i) => (i === index ? { ...sg, note } : sg));
    setMark(questionId, { markup: next });
  };

  const revertMark = (questionId: number, index: number) => {
    const current = marks[questionId]?.markup;
    if (!current) return;
    setMark(questionId, { markup: revertSegment(current, index) });
  };

  const submitReview = async (s: Submission, result: 'passed' | 'needs_revision') => {
    if (result === 'needs_revision' && !comment.trim()) {
      alert('要再提出の場合はコメントを入力してください');
      return;
    }
    const question_reviews = s.questions.map((q) => ({
      question_id: q.id,
      is_correct: marks[q.id]?.is_correct ?? null,
      comment: marks[q.id]?.comment || null,
      markup: marks[q.id]?.markup || null,
    }));
    setSaving(true);
    try {
      const res = await fetch('/api/admin/essay-reviews', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({
          quiz_id: s.quiz_id,
          user_id: s.user_id,
          result,
          review_comment: comment,
          explanation,
          question_reviews,
          ai_assisted: aiUsed,
        }),
      });
      const json = await res.json();
      if (res.ok) {
        setExpanded(null);
        setComment('');
        setExplanation('');
        setMarks({});
        setAiUsed(false);
        setAiResult(null);
        load(filter);
      } else {
        alert(json.error || '添削の保存に失敗しました');
      }
    } catch {
      alert('添削の保存に失敗しました');
    }
    setSaving(false);
  };

  // 全問正解なら「合格」を推奨表示する
  const allMarkedCorrect = (s: Submission) =>
    s.questions.length > 0 && s.questions.every((q) => marks[q.id]?.is_correct === true);

  return (
    <AuthGuard requiredRoles={['admin', 'instructor']}>
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">最終テストの添削</h1>
          <p className="text-sm text-gray-500 mb-6">
            受講者が提出した回答を開くと、AIが赤ペン添削の下書きを作成します。内容を確認・修正し、正誤とコメントを付けて返却してください。
            返却すると受講者の課題ページに赤ペンで表示され、最後にあなたの名前で署名されます。
          </p>

          <div className="border-b border-gray-200 dark:border-gray-700 mb-6 flex gap-4">
            <button className={`pb-2 text-sm font-medium ${filter === 'pending' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`} onClick={() => setFilter('pending')}>添削待ち</button>
            <button className={`pb-2 text-sm font-medium ${filter === 'all' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'}`} onClick={() => setFilter('all')}>すべて</button>
          </div>

          {loading ? (
            <div className="py-16 flex justify-center"><LoadingSpinner size="lg" /></div>
          ) : subs.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">{filter === 'pending' ? '添削待ちの提出はありません。' : '提出はありません。'}</p>
          ) : (
            <div className="space-y-3">
              {subs.map((s) => {
                const k = keyOf(s);
                const meta = statusMeta[s.status];
                const isChoice = s.quiz_type === 'choice';
                const editableDraft = s.status !== 'passed';
                return (
                  <div key={k} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <button className="w-full flex items-center justify-between gap-3 p-4 text-left" onClick={() => openRow(s)}>
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{s.student_name} <span className="text-xs text-gray-500">{s.company}</span></div>
                        <div className="text-xs text-gray-500">
                          {s.course_title} ／ {s.quiz_title}
                          <span className="ml-1">（{isChoice ? '選択式' : '記述式'}）</span>
                          ／ 提出 {new Date(s.submitted_at).toLocaleString('ja-JP')}
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded whitespace-nowrap ${meta.cls}`}>{meta.icon}{meta.label}</span>
                    </button>

                    {expanded === k && (
                      <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-4 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs text-gray-500">
                            {aiLoading
                              ? 'AIが赤ペン添削の下書きを作成しています…'
                              : aiUsed
                              ? `AIの下書きを表示中${aiResult ? `（合否案: ${aiResult === 'passed' ? '合格' : '要再提出'}）` : ''}。確認・修正してから返却してください。`
                              : ''}
                          </div>
                          {editableDraft && (
                            <Button variant="outline" size="sm" onClick={() => generateAiDraft(s)} loading={aiLoading}>
                              ✨ AIで赤ペン添削を作り直す
                            </Button>
                          )}
                        </div>

                        {s.questions.map((q, qi) => {
                          const mark = marks[q.id] || { is_correct: null, comment: '', markup: null };
                          const text = targetText(s, q);
                          return (
                            <div key={q.id} className="rounded border border-gray-100 dark:border-gray-700 p-3">
                              <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">問{qi + 1}. {q.question_text}</div>

                              <div className="text-xs text-gray-500 mb-1">受講者の回答{isChoice ? '（選んだ回答文）' : ''}</div>
                              {mark.markup ? (
                                <RedPenView
                                  segments={mark.markup}
                                  reviewerName={myName}
                                  reviewedAt={new Date().toISOString()}
                                  showSignature={false}
                                  editable={editableDraft ? {
                                    onNoteChange: (i, note) => editNote(q.id, i, note),
                                    onRevert: (i) => revertMark(q.id, i),
                                  } : undefined}
                                />
                              ) : (
                                <div
                                  className="text-[15px] leading-7 text-gray-800 dark:text-gray-200 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 rounded p-3 border border-gray-100 dark:border-gray-700"
                                  style={{ fontFamily: '"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif' }}
                                >
                                  {text || '（未回答）'}
                                </div>
                              )}

                              {isChoice && (
                                <details className="mt-2">
                                  <summary className="text-xs text-gray-500 cursor-pointer">回答パターンと正答（参考）</summary>
                                  <div className="space-y-1 mt-2">
                                    {q.choices.map((c, ci) => (
                                      <div
                                        key={ci}
                                        className={`text-xs rounded border px-2 py-1 flex items-center gap-2 ${
                                          q.selected_index === ci
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-gray-900 dark:text-gray-100'
                                            : 'border-gray-100 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                                        }`}
                                      >
                                        <span>{ci + 1}. {c}</span>
                                        {q.selected_index === ci && <span className="text-blue-600 whitespace-nowrap">受講者が選んだ内容</span>}
                                        {q.correct_index === ci && <span className="text-green-600 ml-auto whitespace-nowrap">正答</span>}
                                      </div>
                                    ))}
                                    {q.explanation && <div className="text-xs text-gray-500 mt-1">登録済みの解説：{q.explanation}</div>}
                                  </div>
                                </details>
                              )}

                              {/* 設問ごとの正誤 */}
                              <div className="flex flex-wrap items-center gap-2 mt-3 mb-2">
                                <span className="text-xs text-gray-500">正誤:</span>
                                {([
                                  { v: true, label: '○ 正解', on: 'border-green-500 bg-green-50 text-green-700' },
                                  { v: false, label: '× 不正解', on: 'border-red-500 bg-red-50 text-red-700' },
                                  { v: null, label: '— 判定なし', on: 'border-gray-500 bg-gray-100 text-gray-700' },
                                ] as const).map((opt) => (
                                  <button
                                    key={String(opt.v)}
                                    type="button"
                                    onClick={() => setMark(q.id, { is_correct: opt.v })}
                                    className={`text-xs px-3 py-1 rounded border ${
                                      mark.is_correct === opt.v ? opt.on : 'border-gray-300 text-gray-500 dark:border-gray-600'
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                                {isChoice && q.auto_is_correct !== null && (
                                  <span className="text-xs text-gray-400">
                                    （登録正答との照合: {q.auto_is_correct ? '一致' : '不一致'}）
                                  </span>
                                )}
                              </div>

                              {s.questions.length > 1 && (
                                <textarea
                                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                                  rows={2}
                                  value={mark.comment}
                                  onChange={(e) => setMark(q.id, { comment: e.target.value })}
                                  placeholder="この設問への添削コメント（任意）"
                                />
                              )}
                            </div>
                          );
                        })}

                        <div>
                          <label className="block text-xs text-gray-500 mb-1">添削コメント（全体）</label>
                          <textarea
                            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                            rows={5}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="添削コメントを入力（要再提出の場合は必須）"
                          />
                          {myName && (
                            <div className="text-right text-red-600 font-bold text-sm mt-1">講師　{myName}</div>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">解説（押さえるべきポイント）</label>
                          <textarea
                            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                            rows={3}
                            value={explanation}
                            onChange={(e) => setExplanation(e.target.value)}
                            placeholder="解説を入力"
                          />
                        </div>

                        {s.status === 'passed' ? (
                          <p className="text-sm text-green-700">この受講者は合格済みです。</p>
                        ) : (
                          <div className="flex flex-wrap items-center justify-end gap-2">
                            {allMarkedCorrect(s) && (
                              <span className="text-xs text-green-600 mr-auto">全問「正解」です</span>
                            )}
                            <Button variant="destructive" size="sm" onClick={() => submitReview(s, 'needs_revision')} loading={saving} disabled={aiLoading}>
                              要再提出で返却
                            </Button>
                            <Button size="sm" onClick={() => submitReview(s, 'passed')} loading={saving} disabled={aiLoading}>
                              合格で返却
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
