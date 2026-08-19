'use client';

import { useState, useEffect, useCallback } from 'react';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import { CheckCircleIcon, ClockIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface Submission {
  quiz_id: number;
  user_id: string;
  student_name: string;
  company: string;
  course_id: number;
  course_title: string;
  quiz_title: string;
  submitted_at: string;
  status: 'pending' | 'passed' | 'needs_revision';
  questions: { id: number; question_text: string; answer_text: string }[];
  latest_review: { result: string; review_comment: string | null; explanation?: string | null; reviewed_at: string } | null;
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

export default function AdminEssayReviewsPage() {
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [explanation, setExplanation] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);

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

  const openRow = (s: Submission) => {
    const k = keyOf(s);
    if (expanded === k) { setExpanded(null); return; }
    setExpanded(k);
    setComment(s.latest_review?.review_comment || '');
    setExplanation(s.latest_review?.explanation || '');
    setAiUsed(false);
  };

  const generateAiDraft = async (s: Submission) => {
    setAiLoading(true);
    try {
      const res = await fetch('/api/admin/essay-reviews/ai-draft', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ quiz_id: s.quiz_id, user_id: s.user_id }),
      });
      const json = await res.json();
      if (res.ok) {
        setComment(json.comment || '');
        setExplanation(json.explanation || '');
        setAiUsed(true);
      } else {
        alert(json.error || 'AI下書きの生成に失敗しました');
      }
    } catch {
      alert('AI下書きの生成に失敗しました');
    }
    setAiLoading(false);
  };

  const submitReview = async (s: Submission, result: 'passed' | 'needs_revision') => {
    if (result === 'needs_revision' && !comment.trim()) {
      alert('要再提出の場合はコメントを入力してください');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/essay-reviews', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ quiz_id: s.quiz_id, user_id: s.user_id, result, review_comment: comment, explanation, ai_assisted: aiUsed }),
      });
      const json = await res.json();
      if (res.ok) {
        setExpanded(null);
        setComment('');
        setExplanation('');
        setAiUsed(false);
        load(filter);
      } else {
        alert(json.error || '添削の保存に失敗しました');
      }
    } catch {
      alert('添削の保存に失敗しました');
    }
    setSaving(false);
  };

  return (
    <AuthGuard requiredRoles={['admin', 'instructor']}>
      <MainLayout>
        <div className="max-w-4xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-1">記述式テストの添削</h1>
          <p className="text-sm text-gray-500 mb-6">受講者が提出した記述式最終テストを確認し、添削コメントと合否を返却します。</p>

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
                return (
                  <div key={k} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                    <button className="w-full flex items-center justify-between gap-3 p-4 text-left" onClick={() => openRow(s)}>
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 dark:text-gray-100">{s.student_name} <span className="text-xs text-gray-500">{s.company}</span></div>
                        <div className="text-xs text-gray-500">{s.course_title} ／ {s.quiz_title} ／ 提出 {new Date(s.submitted_at).toLocaleString('ja-JP')}</div>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded whitespace-nowrap ${meta.cls}`}>{meta.icon}{meta.label}</span>
                    </button>

                    {expanded === k && (
                      <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-4 space-y-4">
                        {s.questions.map((q, qi) => (
                          <div key={q.id}>
                            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">問{qi + 1}. {q.question_text}</div>
                            <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 rounded p-3 border border-gray-100 dark:border-gray-700">
                              {q.answer_text || '（未回答）'}
                            </div>
                          </div>
                        ))}

                        <div className="flex items-center justify-between">
                          <label className="block text-sm text-gray-600 dark:text-gray-300">添削コメント・解説</label>
                          <Button variant="outline" size="sm" onClick={() => generateAiDraft(s)} loading={aiLoading}>
                            ✨ AIで添削案を生成（Gemini）
                          </Button>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">添削コメント</label>
                          <textarea
                            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                            rows={4}
                            value={comment}
                            onChange={(e) => setComment(e.target.value)}
                            placeholder="添削コメントを入力（要再提出の場合は必須）"
                          />
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">解説（模範解答の要点など）</label>
                          <textarea
                            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                            rows={3}
                            value={explanation}
                            onChange={(e) => setExplanation(e.target.value)}
                            placeholder="解説を入力"
                          />
                        </div>
                        {aiUsed && (
                          <p className="text-xs text-amber-600">AIが下書きを生成しました。内容を確認・修正のうえ、指導者の判断で返却してください（最終確定は指導者が行います）。</p>
                        )}

                        {s.status === 'passed' ? (
                          <p className="text-sm text-green-700">この受講者は合格済みです。</p>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button variant="destructive" size="sm" onClick={() => submitReview(s, 'needs_revision')} loading={saving}>
                              要再提出で返却
                            </Button>
                            <Button size="sm" onClick={() => submitReview(s, 'passed')} loading={saving}>
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
