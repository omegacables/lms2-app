'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { supabase } from '@/lib/database/supabase';
import { CheckCircleIcon, XCircleIcon, ClockIcon } from '@heroicons/react/24/solid';

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
  grading_mode: 'auto' | 'review';
  after_video_id: number | null;
}
interface GradeResult {
  question_id: number;
  is_correct: boolean;
  correct_index?: number | null;
  explanation?: string | null;
}
interface QuestionReview {
  question_id: number;
  is_correct: boolean | null;
  comment: string | null;
}
interface ReviewInfo {
  result: 'passed' | 'needs_revision';
  comment: string | null;
  explanation: string | null;
  question_reviews: QuestionReview[];
  reviewed_at: string;
  reviewer_name: string | null;
}
type SubmissionStatus = 'not_submitted' | 'under_review' | 'needs_revision' | 'passed';

async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    Authorization: session?.access_token ? `Bearer ${session.access_token}` : '',
  };
}

export default function QuizPage() {
  const params = useParams();
  const courseId = Number(params.id);
  const quizId = Number(params.quizId);

  const [loading, setLoading] = useState(true);
  const [quiz, setQuiz] = useState<QuizMeta | null>(null);
  const [questions, setQuestions] = useState<StudentQuestion[]>([]);
  const [passed, setPassed] = useState(false);
  const [lockedMsg, setLockedMsg] = useState<string | null>(null);

  // 提出制（添削）テスト用
  const [reviewMode, setReviewMode] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('not_submitted');
  const [canSubmit, setCanSubmit] = useState(false);
  const [review, setReview] = useState<ReviewInfo | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

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
      setReviewMode(!!json.review_mode);
      setSubmissionStatus(json.submission_status || 'not_submitted');
      setCanSubmit(!!json.can_submit);
      setReview(json.review || null);
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

  // 即時採点（小テスト）
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

  // 提出（添削依頼）
  const submitForReview = async () => {
    if (!confirm('回答を提出して添削を依頼します。提出後は添削が返るまで変更できません。よろしいですか？')) return;
    setSubmitting(true);
    try {
      const answers = questions
        .filter((q) => selections[q.id] !== undefined)
        .map((q) => ({ question_id: q.id, selected_index: selections[q.id] }));
      const res = await fetch(`/api/quizzes/${quizId}/submit`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ answers }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || '提出に失敗しました');
        setSubmitting(false);
        return;
      }
      setJustSubmitted(true);
      await load();
    } catch {
      alert('提出に失敗しました');
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

  const questionReview = (questionId: number): QuestionReview | null =>
    review?.question_reviews?.find((r) => r.question_id === questionId) || null;

  const statusBadge = () => {
    if (!reviewMode) {
      return passed ? (
        <span className="inline-flex items-center text-green-600 text-sm font-medium">
          <CheckCircleIcon className="w-5 h-5 mr-1" /> 通過済み
        </span>
      ) : null;
    }
    if (submissionStatus === 'under_review') {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-yellow-100 text-yellow-700">
          <ClockIcon className="w-4 h-4" /> 添削中
        </span>
      );
    }
    if (submissionStatus === 'needs_revision') {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-red-100 text-red-700">
          <XCircleIcon className="w-4 h-4" /> 要再提出
        </span>
      );
    }
    if (submissionStatus === 'passed') {
      return (
        <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-green-100 text-green-700">
          <CheckCircleIcon className="w-4 h-4" /> 合格
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">未提出</span>
    );
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
                <Link href="/homework"><Button size="sm">課題ページへ</Button></Link>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{quiz?.title}</h1>
                {statusBadge()}
              </div>
              <p className="text-sm text-gray-500 mb-6">
                {reviewMode
                  ? `全${questions.length}問。回答を提出すると指導者が添削します。添削結果は課題ページで確認できます。`
                  : `全${questions.length}問。すべて正解すると次のステップが解放されます。`}
              </p>

              {/* 提出直後 */}
              {reviewMode && justSubmitted && (
                <div className="mb-6 p-4 rounded-lg border border-blue-300 bg-blue-50 text-blue-800">
                  回答を提出しました。指導者の添削をお待ちください。結果は課題ページに表示されます。
                  <div className="mt-3">
                    <Link href="/homework"><Button size="sm">課題ページへ</Button></Link>
                  </div>
                </div>
              )}

              {/* 添削結果 */}
              {reviewMode && review && (
                <div className={`mb-6 p-4 rounded-lg border text-sm ${
                  review.result === 'passed' ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800'
                }`}>
                  <div className="font-medium mb-1">
                    添削結果: {review.result === 'passed' ? '合格' : '要再提出'}
                    {review.reviewer_name && <span className="ml-2 text-xs">（添削者: {review.reviewer_name}）</span>}
                    <span className="ml-2 text-xs text-gray-500">{new Date(review.reviewed_at).toLocaleString('ja-JP')}</span>
                  </div>
                  {review.comment && (
                    <div className="mt-1">
                      <div className="text-xs font-semibold text-gray-500">添削</div>
                      <div className="whitespace-pre-wrap text-gray-700">{review.comment}</div>
                    </div>
                  )}
                  {review.explanation && (
                    <div className="mt-2">
                      <div className="text-xs font-semibold text-gray-500">解説</div>
                      <div className="whitespace-pre-wrap text-gray-700">{review.explanation}</div>
                    </div>
                  )}
                  <div className="mt-3">
                    <Link href="/homework" className="text-blue-600 hover:underline text-xs">課題ページで詳しく見る →</Link>
                  </div>
                </div>
              )}

              <div className="space-y-6">
                {questions.map((q, qi) => {
                  const result = results[q.id];
                  const myCorrect = !reviewMode && passed && q.my_answer?.is_correct;
                  const qr = questionReview(q.id);
                  const editable = reviewMode ? canSubmit : !(passed && !result);
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
                              className={`flex items-center gap-2 p-2 rounded border ${editable ? 'cursor-pointer' : 'cursor-default'} ${
                                selected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'
                              } ${isResolvedWrong ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : ''}`}
                            >
                              <input
                                type="radio"
                                name={`q-${q.id}`}
                                checked={selected}
                                disabled={!editable}
                                onChange={() => setSelections({ ...selections, [q.id]: ci })}
                              />
                              <span className="text-sm text-gray-800 dark:text-gray-200">{c}</span>
                              {isResolvedWrong && <span className="text-xs text-green-600 ml-auto">正答</span>}
                            </label>
                          );
                        })}
                      </div>

                      {/* 指導者による設問ごとの添削 */}
                      {reviewMode && qr && (
                        <div className="mt-3 text-sm">
                          {qr.is_correct !== null && (
                            <div className={`flex items-center gap-1 font-medium ${qr.is_correct ? 'text-green-700' : 'text-red-700'}`}>
                              {qr.is_correct ? <CheckCircleIcon className="w-5 h-5" /> : <XCircleIcon className="w-5 h-5" />}
                              {qr.is_correct ? '正解' : '不正解'}
                            </div>
                          )}
                          {qr.comment && (
                            <div className="text-gray-600 dark:text-gray-300 mt-1 whitespace-pre-wrap">添削: {qr.comment}</div>
                          )}
                        </div>
                      )}

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

              {/* 通過メッセージ（即時採点） */}
              {!reviewMode && justPassed && (
                <div className="mt-6 p-4 rounded-lg border border-green-300 bg-green-50 text-green-800">
                  全問正解しました！次のステップが解放されました。
                  <div className="mt-3">
                    <Link href={`/courses/${courseId}`}><Button size="sm">コースに戻って続ける</Button></Link>
                  </div>
                </div>
              )}

              {/* アクション */}
              {reviewMode ? (
                <>
                  {canSubmit && (
                    <div className="mt-6 flex flex-col items-end gap-2">
                      <Button onClick={submitForReview} loading={submitting} disabled={!allAnswered}>
                        {submissionStatus === 'needs_revision' ? '修正して再提出する' : '提出して添削を依頼する'}
                      </Button>
                      <p className="text-xs text-gray-500">提出後は添削が返るまで回答を変更できません。</p>
                    </div>
                  )}
                  {submissionStatus === 'under_review' && !justSubmitted && (
                    <p className="mt-6 text-sm text-gray-500">指導者が添削中です。結果が出るまでお待ちください。</p>
                  )}
                </>
              ) : (
                <>
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
            </>
          )}
        </div>
      </MainLayout>
    </AuthGuard>
  );
}
