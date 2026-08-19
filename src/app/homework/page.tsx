'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import {
  CheckCircleIcon,
  ClockIcon,
  LockClosedIcon,
  ExclamationTriangleIcon,
  DocumentTextIcon,
} from '@heroicons/react/24/outline';

type HomeworkStatus = 'locked' | 'not_submitted' | 'under_review' | 'needs_revision' | 'passed';

interface HwQuestion {
  id: number;
  question_text: string;
  my_answer: string;
  answered_at: string | null;
}
interface HwItem {
  quiz_id: number;
  course_id: number;
  course_title: string;
  title: string;
  status: HomeworkStatus;
  lock_reason: string | null;
  questions: HwQuestion[];
  review: { result: string; comment: string | null; explanation: string | null; reviewed_at: string; reviewer_name: string | null } | null;
  can_submit: boolean;
}

interface QuizResult {
  quiz_id: number;
  course_id: number;
  course_title: string;
  title: string;
  questions: {
    question_text: string;
    choices: string[];
    selected_index: number | null;
    selected_text: string;
    is_correct: boolean | null;
    explanation: string;
    answered_at: string | null;
  }[];
}

async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
  };
}

const statusMeta: Record<HomeworkStatus, { label: string; cls: string; icon: React.ReactNode }> = {
  locked: { label: '未解放', cls: 'bg-gray-200 text-gray-600', icon: <LockClosedIcon className="w-4 h-4" /> },
  not_submitted: { label: '未提出', cls: 'bg-blue-100 text-blue-700', icon: <DocumentTextIcon className="w-4 h-4" /> },
  under_review: { label: '添削中', cls: 'bg-yellow-100 text-yellow-700', icon: <ClockIcon className="w-4 h-4" /> },
  needs_revision: { label: '要再提出', cls: 'bg-red-100 text-red-700', icon: <ExclamationTriangleIcon className="w-4 h-4" /> },
  passed: { label: '合格', cls: 'bg-green-100 text-green-700', icon: <CheckCircleIcon className="w-4 h-4" /> },
};

export default function HomeworkPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<HwItem[]>([]);
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);
  const [stampUrl, setStampUrl] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({}); // key: `${quizId}-${questionId}`
  const [submitting, setSubmitting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/homework', { headers: await authHeaders() });
      const json = await res.json();
      if (res.ok) {
        setItems(json.items || []);
        setQuizResults(json.quizResults || []);
        setStampUrl(json.stampUrl || null);
        // 既存回答を下書きに反映
        const d: Record<string, string> = {};
        (json.items || []).forEach((it: HwItem) => {
          it.questions.forEach((q) => { d[`${it.quiz_id}-${q.id}`] = q.my_answer || ''; });
        });
        setDrafts(d);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const submit = async (item: HwItem) => {
    const answers = item.questions.map((q) => ({
      question_id: q.id,
      answer_text: drafts[`${item.quiz_id}-${q.id}`] || '',
    }));
    if (answers.some((a) => a.answer_text.trim() === '')) {
      alert('すべての設問に回答してください');
      return;
    }
    if (!confirm('提出後は添削が返るまで編集できません。提出しますか？')) return;
    setSubmitting(item.quiz_id);
    try {
      const res = await fetch(`/api/quizzes/${item.quiz_id}/submit-essay`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ answers }),
      });
      const json = await res.json();
      if (res.ok) {
        await load();
      } else {
        alert(json.error || '提出に失敗しました');
      }
    } catch {
      alert('提出に失敗しました');
    }
    setSubmitting(null);
  };

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">添削課題（記述式最終テスト）</h1>
            <Link href="/messages" className="text-sm text-blue-600 hover:underline">質問する（質疑応答）</Link>
          </div>
          <p className="text-sm text-gray-500 mb-6">通信制コースの記述式最終テストの提出・添削結果を確認できます。</p>

          {loading ? (
            <div className="py-16 flex justify-center"><LoadingSpinner size="lg" /></div>
          ) : (
            <>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">記述式最終テスト</h2>
            {items.length === 0 ? (
              <p className="text-sm text-gray-500 py-4">現在、対象の記述式テストはありません。</p>
            ) : (
            <div className="space-y-4">
              {items.map((item) => {
                const meta = statusMeta[item.status];
                return (
                  <div key={item.quiz_id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="min-w-0">
                        <div className="text-xs text-gray-500">{item.course_title}</div>
                        <div className="font-bold text-gray-900 dark:text-gray-100">{item.title}</div>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded whitespace-nowrap ${meta.cls}`}>
                        {meta.icon}{meta.label}
                      </span>
                    </div>

                    {item.status === 'locked' && (
                      <div className="text-sm text-gray-500">
                        先に{item.lock_reason || '前のステップ'}を完了すると受験できます。
                        <Link href={`/courses/${item.course_id}`} className="text-blue-600 hover:underline ml-2">コースを開く</Link>
                      </div>
                    )}

                    {/* 添削結果（添削コメント＋解説＋印鑑） */}
                    {item.review && (
                      <div className={`mb-3 p-3 rounded border text-sm relative ${
                        item.review.result === 'passed' ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800'
                      }`}>
                        <div className="font-medium mb-1">
                          添削結果: {item.review.result === 'passed' ? '合格' : '要再提出'}
                          {item.review.reviewer_name && <span className="ml-2 text-xs">（添削者: {item.review.reviewer_name}）</span>}
                          <span className="ml-2 text-xs text-gray-500">{new Date(item.review.reviewed_at).toLocaleString('ja-JP')}</span>
                        </div>
                        {item.review.comment && (
                          <div className="mt-1">
                            <div className="text-xs font-semibold text-gray-500">添削</div>
                            <div className="whitespace-pre-wrap text-gray-700">{item.review.comment}</div>
                          </div>
                        )}
                        {item.review.explanation && (
                          <div className="mt-2">
                            <div className="text-xs font-semibold text-gray-500">解説</div>
                            <div className="whitespace-pre-wrap text-gray-700">{item.review.explanation}</div>
                          </div>
                        )}
                        {stampUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={stampUrl} alt="印" className="absolute top-2 right-2 w-14 h-14 object-contain opacity-90" />
                        )}
                      </div>
                    )}

                    {/* 設問・回答 */}
                    {item.status !== 'locked' && (
                      <div className="space-y-3">
                        {item.questions.map((q, qi) => (
                          <div key={q.id}>
                            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">問{qi + 1}. {q.question_text}</div>
                            {item.can_submit ? (
                              <textarea
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 text-sm"
                                rows={4}
                                value={drafts[`${item.quiz_id}-${q.id}`] ?? ''}
                                onChange={(e) => setDrafts({ ...drafts, [`${item.quiz_id}-${q.id}`]: e.target.value })}
                                placeholder="回答を入力"
                              />
                            ) : (
                              <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 rounded p-2 border border-gray-100 dark:border-gray-700">
                                {q.my_answer || '（未回答）'}
                              </div>
                            )}
                          </div>
                        ))}

                        {item.can_submit && (
                          <div className="flex justify-end">
                            <Button size="sm" onClick={() => submit(item)} loading={submitting === item.quiz_id}>
                              {item.status === 'needs_revision' ? '再提出する' : '提出する'}
                            </Button>
                          </div>
                        )}
                        {item.status === 'under_review' && (
                          <p className="text-xs text-gray-500">指導者が添削中です。結果が出るまでお待ちください。</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            )}

            {/* 小テストの結果（問題・選択した回答・正誤・解説） */}
            {quizResults.length > 0 && (
              <div className="mt-8">
                <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-3">小テストの結果</h2>
                <div className="space-y-4">
                  {quizResults.map((qr) => (
                    <div key={qr.quiz_id} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
                      <div className="text-xs text-gray-500">{qr.course_title}</div>
                      <div className="font-bold text-gray-900 dark:text-gray-100 mb-3">{qr.title}</div>
                      <div className="space-y-3">
                        {qr.questions.map((q, qi) => (
                          <div key={qi} className="border border-gray-100 dark:border-gray-700 rounded p-3">
                            <div className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-1">問{qi + 1}. {q.question_text}</div>
                            <div className="text-sm text-gray-700 dark:text-gray-300">
                              あなたの回答：{q.selected_text || '（未回答）'}
                              {q.is_correct === null ? null : q.is_correct ? (
                                <span className="ml-2 text-green-600">正解</span>
                              ) : (
                                <span className="ml-2 text-red-600">不正解</span>
                              )}
                            </div>
                            {q.explanation && (
                              <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">解説：{q.explanation}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            </>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
