'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/solid';

interface StudentQuestion {
  id: number;
  question_text: string;
  choices: string[];
  sort_order: number;
  my_answer: {
    selected_index: number | null;
    answer_text: string | null;
    is_correct: boolean | null;
    attempt_no: number;
    answered_at: string;
  } | null;
}
interface QuizMeta {
  id: number;
  course_id: number;
  title: string;
  quiz_type: 'choice' | 'essay';
  after_video_id: number | null;
}
interface GradeResult {
  question_id: number;
  is_correct: boolean;
  correct_index?: number | null;
  explanation?: string | null;
}

async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
  };
}

export default function QuizPage() {
  const params = useParams();
  const router = useRouter();
  const courseId = Number(params.id);
  const quizId = Number(params.quizId);

  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState<QuizMeta | null>(null);
  const [questions, setQuestions] = useState<StudentQuestion[]>([]);
  const [passed, setPassed] = useState(false);
  const [lockedMsg, setLockedMsg] = useState<string | null>(null);

  const [selections, setSelections] = useState<Record<number, number>>({});
  const [results, setResults] = useState<Record<number, GradeResult>>({});
  const [submitting, setSubmitting] = useState(false);
  const [justPassed, setJustPassed] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLockedMsg(null);
    try {
      const res = await fetch(`/api/quizzes/${quizId}`, { headers: await authHeaders() });
      const json = await res.json();
      if (res.status === 403 && json.locked) {
        setLockedMsg(json.error);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        setLockedMsg(json.error || '読み込みに失敗しました');
        setLoading(false);
        return;
      }
      setQuiz(json.quiz);
      setQuestions(json.questions || []);
      setPassed(!!json.passed);
      // 既存回答を初期選択に反映
      const init: Record<number, number> = {};
      (json.questions || []).forEach((q: StudentQuestion) => {
        if (q.my_answer?.selected_index !== null && q.my_answer?.selected_index !== undefined) {
          init[q.id] = q.my_answer.selected_index;
        }
      });
      setSelections(init);
    } catch {
      setLockedMsg('読み込みに失敗しました');
    }
    setLoading(false);
  }, [quizId]);

  useEffect(() => { load(); }, [load]);

  const allAnswered = questions.length > 0 && questions.every((q) => selections[q.id] !== undefined);

  const submit = async () => {
    setSubmitting(true);
    setResults({});
    try {
      const answers = questions
        .filter((q) => selections[q.id] !== undefined)
        .map((q) => ({ question_id: q.id, selected_index: selections[q.id] }));
      const res = await fetch(`/api/quizzes/${quizId}/answer`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ answers }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || '採点に失敗しました');
        setSubmitting(false);
        return;
      }
      const map: Record<number, GradeResult> = {};
      (json.results || []).forEach((r: GradeResult) => { map[r.question_id] = r; });
      setResults(map);
      if (json.passed) {
        setPassed(true);
        setJustPassed(true);
      }
    } catch {
      alert('採点に失敗しました');
    }
    setSubmitting(false);
  };

  const retryWrong = () => {
    // 不正解の設問だけ選択をクリアして再挑戦
    const next = { ...selections };
    Object.values(results).forEach((r) => {
      if (!r.is_correct) delete next[r.question_id];
    });
    setSelections(next);
    setResults({});
    setJustPassed(false);
  };

  return (
    <AuthGuard>
      <MainLayout>
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="mb-4 flex items-center justify-between">
            <Link href={`/courses/${courseId}`} className="text-sm text-blue-600 hover:underline">← コースに戻る</Link>
            <Link href="/messages" className="text-sm text-blue-600 hover:underline">質問する（質疑応答）</Link>
          </div>

          {loading ? (
            <div className="py-16 flex justify-center"><LoadingSpinner size="lg" /></div>
          ) : lockedMsg ? (
            <div className="p-6 rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-800">
              {lockedMsg}
            </div>
          ) : quiz?.quiz_type === 'essay' ? (
            <div className="p-6 rounded-lg border border-gray-200 bg-white dark:bg-gray-800">
              <h1 className="text-xl font-bold mb-2 text-gray-900 dark:text-gray-100">{quiz.title}</h1>
              <p className="text-sm text-gray-600 dark:text-gray-300">
                記述式の最終テストは「添削課題」ページから受験・提出します。
              </p>
              <div className="mt-4">
                <Link href="/homework"><Button size="sm">添削課題ページへ</Button></Link>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{quiz?.title}</h1>
                {passed && (
                  <span className="inline-flex items-center text-green-600 text-sm font-medium">
                    <CheckCircleIcon className="w-5 h-5 mr-1" /> 通過済み
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-6">全{questions.length}問。すべて正解すると次のステップが解放されます。</p>

              <div className="space-y-6">
                {questions.map((q, qi) => {
                  const result = results[q.id];
                  const myCorrect = passed && q.my_answer?.is_correct;
                  return (
                    <div key={q.id} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                      <div className="font-medium text-gray-900 dark:text-gray-100 mb-3">
                        問{qi + 1}. {q.question_text}
                      </div>
                      <div className="space-y-2">
                        {q.choices.map((c, ci) => {
                          const selected = selections[q.id] === ci;
                          const isResolvedWrong = result && !result.is_correct && result.correct_index === ci;
                          return (
                            <label
                              key={ci}
                              className={`flex items-center gap-2 p-2 rounded border cursor-pointer ${
                                selected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'
                              } ${isResolvedWrong ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}`}
                            >
                              <input
                                type="radio"
                                name={`q-${q.id}`}
                                checked={selected}
                                disabled={passed && !result}
                                onChange={() => setSelections({ ...selections, [q.id]: ci })}
                              />
                              <span className="text-sm text-gray-800 dark:text-gray-200">{c}</span>
                              {isResolvedWrong && <span className="text-xs text-green-600 ml-auto">正答</span>}
                            </label>
                          );
                        })}
                      </div>

                      {result && (
                        <div className={`mt-3 text-sm flex items-start gap-2 ${result.is_correct ? 'text-green-700' : 'text-red-700'}`}>
                          {result.is_correct ? (
                            <><CheckCircleIcon className="w-5 h-5 flex-shrink-0" /> 正解</>
                          ) : (
                            <div className="flex items-start gap-2">
                              <XCircleIcon className="w-5 h-5 flex-shrink-0 text-red-600" />
                              <div>
                                <div>不正解</div>
                                {result.explanation && (
                                  <div className="text-gray-600 dark:text-gray-300 mt-1">解説: {result.explanation}</div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {myCorrect && !result && (
                        <div className="mt-3 text-sm text-green-700 flex items-center gap-1">
                          <CheckCircleIcon className="w-5 h-5" /> 正解（{q.my_answer && new Date(q.my_answer.answered_at).toLocaleString('ja-JP')}）
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 通過メッセージ */}
              {justPassed && (
                <div className="mt-6 p-4 rounded-lg border border-green-300 bg-green-50 text-green-800">
                  全問正解しました！次のステップが解放されました。
                  <div className="mt-3">
                    <Link href={`/courses/${courseId}`}><Button size="sm">コースに戻って続ける</Button></Link>
                  </div>
                </div>
              )}

              {/* アクション */}
              {!passed && (
                <div className="mt-6 flex justify-end">
                  <Button onClick={submit} loading={submitting} disabled={!allAnswered}>
                    採点する
                  </Button>
                </div>
              )}
              {!passed && Object.keys(results).length > 0 && Object.values(results).some((r) => !r.is_correct) && (
                <div className="mt-3 flex justify-end">
                  <Button variant="outline" size="sm" onClick={retryWrong}>不正解の問題をやり直す</Button>
                </div>
              )}
            </>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
