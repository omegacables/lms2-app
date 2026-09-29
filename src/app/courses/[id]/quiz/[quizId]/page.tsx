'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { RedPenView } from '@/components/quiz/RedPenView';
import { supabase } from '@/lib/database/supabase';
import type { RedPenSegment } from '@/lib/quiz/redpen';
import { CheckCircleIcon, XCircleIcon, ClockIcon } from '@heroicons/react/24/solid';

interface StudentQuestion {
  id: number;
  question_text: string;
  choices: string[];
  /** 回答文生成のときの選択肢（key は表示位置） */
  options: { key: number; text: string }[] | null;
  sort_order: number;
  /** 回答済みか（小テストは回答すれば通過。正誤は表示しない） */
  answered?: boolean;
  solved: boolean;
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
  answer_style: 'plain' | 'generated';
  after_video_id: number | null;
}
interface QuestionReview {
  question_id: number;
  is_correct: boolean | null;
  comment: string | null;
  markup?: RedPenSegment[] | null;
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
  const [choiceSetId, setChoiceSetId] = useState<string | null>(null);
  const [passed, setPassed] = useState(false);
  const [lockedMsg, setLockedMsg] = useState<string | null>(null);

  // 提出制（添削）テスト用
  const [reviewMode, setReviewMode] = useState(false);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('not_submitted');
  const [canSubmit, setCanSubmit] = useState(false);
  const [review, setReview] = useState<ReviewInfo | null>(null);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const [selections, setSelections] = useState<Record<number, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [justAnswered, setJustAnswered] = useState(false);

  const generated = quiz?.answer_style === 'generated';

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
      setChoiceSetId(json.choice_set_id || null);
      setPassed(!!json.passed);
      setReviewMode(!!json.review_mode);
      setSubmissionStatus(json.submission_status || 'not_submitted');
      setCanSubmit(!!json.can_submit);
      setReview(json.review || null);
      // 固定選択肢のときだけ、既存回答を初期選択に反映（回答文生成は毎回文章が変わるので引き継がない）
      const init: Record<number, number> = {};
      if (json.quiz?.answer_style !== 'generated') {
        (json.questions || []).forEach((q: StudentQuestion) => {
          if (q.my_answer?.selected_index !== null && q.my_answer?.selected_index !== undefined) {
            init[q.id] = q.my_answer.selected_index;
          }
        });
      }
      setSelections(init);
    } catch {
      setLockedMsg('読み込みに失敗しました');
    }
    setLoading(false);
  }, [quizId]);

  useEffect(() => { load(); }, [load]);

  // 回答済みか（旧APIの solved も同じ意味）
  const isAnswered = (q: StudentQuestion) => q.answered ?? q.solved;
  // これから回答が必要な設問（小テストでは回答済みの設問は除く）
  const pendingQuestions = questions.filter((q) => reviewMode || !isAnswered(q));
  const allAnswered = pendingQuestions.length > 0 && pendingQuestions.every((q) => selections[q.id] !== undefined);

  const buildAnswers = () =>
    pendingQuestions
      .filter((q) => selections[q.id] !== undefined)
      .map((q) => ({ question_id: q.id, selected_index: selections[q.id] }));

  // 回答の送信（小テスト。正誤は表示せず、全問に回答すると通過）
  const submit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/quizzes/${quizId}/answer`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ answers: buildAnswers(), choice_set_id: choiceSetId }),
      });
      const json = await res.json();
      if (!res.ok) {
        alert(json.error || '回答の送信に失敗しました');
        setSubmitting(false);
        return;
      }
      setJustAnswered(true);
      await load();
    } catch {
      alert('回答の送信に失敗しました');
    }
    setSubmitting(false);
  };

  // 提出（添削依頼）
  const submitForReview = async () => {
    if (!confirm('回答を提出して添削を依頼します。提出後は添削が返るまで変更できません。よろしいですか？')) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/quizzes/${quizId}/submit`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ answers: buildAnswers(), choice_set_id: choiceSetId }),
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

  const questionReview = (questionId: number): QuestionReview | null =>
    review?.question_reviews?.find((r) => r.question_id === questionId) || null;

  const statusBadge = () => {
    if (!reviewMode) {
      return passed ? (
        <span className="inline-flex items-center text-green-600 text-sm font-medium">
          <CheckCircleIcon className="w-5 h-5 mr-1" /> 回答済み
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

  // 選択肢（固定 or 生成された回答文）を描画
  const renderChoices = (q: StudentQuestion, editable: boolean) => {
    const items: { key: number; text: string }[] = q.options ?? q.choices.map((c, i) => ({ key: i, text: c }));
    const essayLike = !!q.options;
    return (
      <div className={essayLike ? 'space-y-3' : 'space-y-2'}>
        {items.map((opt) => {
          const selected = selections[q.id] === opt.key;
          return (
            <label
              key={opt.key}
              className={`flex items-start gap-3 rounded border ${essayLike ? 'p-3' : 'p-2 items-center'} ${
                editable ? 'cursor-pointer' : 'cursor-default'
              } ${selected ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-200 dark:border-gray-700'}`}
            >
              <input
                type="radio"
                className={essayLike ? 'mt-1.5' : ''}
                name={`q-${q.id}`}
                checked={selected}
                disabled={!editable}
                onChange={() => setSelections({ ...selections, [q.id]: opt.key })}
              />
              <span
                className={`text-gray-800 dark:text-gray-200 ${essayLike ? 'text-[15px] leading-7' : 'text-sm'}`}
                style={essayLike ? { fontFamily: '"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif' } : undefined}
              >
                {opt.text}
              </span>
            </label>
          );
        })}
      </div>
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
            <div className="py-16 flex flex-col items-center gap-3">
              <LoadingSpinner size="lg" />
              <p className="text-sm text-gray-500">問題を準備しています…</p>
            </div>
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
                  ? `全${questions.length}問。回答を選んで提出すると、講師が添削します。添削結果は課題ページで確認できます。`
                  : `全${questions.length}問。すべての問題に回答すると次のステップに進めます。`}
                {generated && ' 回答の文章は受験のたびに変わるので、内容をよく読んで選んでください。'}
              </p>

              {/* 提出直後 */}
              {reviewMode && justSubmitted && (
                <div className="mb-6 p-4 rounded-lg border border-blue-300 bg-blue-50 text-blue-800">
                  回答を提出しました。講師の添削をお待ちください。結果は課題ページに表示されます。
                  <div className="mt-3">
                    <Link href="/homework"><Button size="sm">課題ページへ</Button></Link>
                  </div>
                </div>
              )}

              {/* 添削結果（全体） */}
              {reviewMode && review && (
                <div className={`mb-6 p-4 rounded-lg border text-sm ${
                  review.result === 'passed' ? 'border-green-300 bg-green-50 text-green-800' : 'border-red-300 bg-red-50 text-red-800'
                }`}>
                  <div className="font-medium mb-1">
                    添削結果: {review.result === 'passed' ? '合格' : '要再提出'}
                    <span className="ml-2 text-xs text-gray-500">{new Date(review.reviewed_at).toLocaleString('ja-JP')}</span>
                  </div>
                  {review.comment && (
                    <div className="mt-1 whitespace-pre-wrap text-gray-700">{review.comment}</div>
                  )}
                  {review.reviewer_name && (
                    <div className="mt-2 text-right text-red-600 font-bold">講師　{review.reviewer_name}</div>
                  )}
                  <div className="mt-2">
                    <Link href="/homework" className="text-blue-600 hover:underline text-xs">課題ページで詳しく見る →</Link>
                  </div>
                </div>
              )}

              <div className="space-y-6">
                {questions.map((q, qi) => {
                  const qr = questionReview(q.id);
                  // 小テストで回答済みの設問は、選んだ回答だけを表示する（正誤は表示しない）
                  const answeredLocked = !reviewMode && isAnswered(q);
                  const editable = reviewMode ? canSubmit : !answeredLocked;
                  // 回答文生成で、提出済み（添削待ち・添削済み）なら選んだ文章だけを見せる
                  const showSubmittedText = generated && reviewMode && !canSubmit;
                  return (
                    <div key={q.id} className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                      <div className="font-medium text-gray-900 dark:text-gray-100 mb-3">
                        問{qi + 1}. {q.question_text}
                      </div>

                      {answeredLocked && generated ? (
                        <div className="text-[15px] leading-7 text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 rounded p-3 border border-gray-100 dark:border-gray-700"
                          style={{ fontFamily: '"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif' }}>
                          {q.my_answer?.answer_text || '（回答済み）'}
                        </div>
                      ) : showSubmittedText ? (
                        qr?.markup && qr.markup.length > 0 ? (
                          <RedPenView segments={qr.markup} reviewerName={review?.reviewer_name} reviewedAt={review?.reviewed_at} showSignature={false} />
                        ) : (
                          <div className="text-[15px] leading-7 text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 rounded p-3 border border-gray-100 dark:border-gray-700">
                            {q.my_answer?.answer_text || '（未回答）'}
                          </div>
                        )
                      ) : (
                        renderChoices(q, editable)
                      )}

                      {answeredLocked && q.my_answer && (
                        <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                          <CheckCircleIcon className="w-4 h-4 text-green-600" /> 回答済み（{new Date(q.my_answer.answered_at).toLocaleString('ja-JP')}）
                        </div>
                      )}

                      {/* 講師による設問ごとのコメント */}
                      {reviewMode && qr?.comment && (
                        <div className="mt-3 text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">添削: {qr.comment}</div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 回答直後（小テスト） */}
              {!reviewMode && justAnswered && passed && (
                <div className="mt-6 p-4 rounded-lg border border-green-300 bg-green-50 text-green-800">
                  回答を送信しました。次のステップに進めます。
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
                    <p className="mt-6 text-sm text-gray-500">講師が添削中です。結果が出るまでお待ちください。</p>
                  )}
                </>
              ) : (
                <>
                  {pendingQuestions.length > 0 && (
                    <div className="mt-6 flex flex-col items-end gap-2">
                      <Button onClick={submit} loading={submitting} disabled={!allAnswered}>
                        回答を送信する
                      </Button>
                      {!allAnswered && <p className="text-xs text-gray-500">すべての問題に回答すると送信できます。</p>}
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
