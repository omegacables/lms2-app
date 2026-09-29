'use client';

// 小テストの自動添削（AI の赤ペン・コメント）の表示（受講者のテストページ・課題ページで共通）。
// 講師が確認するまでは「自動添削（AI）」と表示し、講師名は付けない。確認後は確認した講師の名前で署名する。

import { RedPenView } from '@/components/quiz/RedPenView';
import type { RedPenSegment } from '@/lib/quiz/redpen';

export interface AutoReviewData {
  status: 'pending' | 'ready' | 'failed';
  comment: string | null;
  question_reviews: { question_id: number; comment: string | null; markup: RedPenSegment[] | null }[];
  generated_at: string | null;
  confirmed: boolean;
  reviewer_name: string | null;
  confirmed_at: string | null;
}

export const AUTO_REVIEW_LABEL = '自動添削（AI）';

/** テスト全体の自動添削（状態・全体コメント・署名） */
export function AutoReviewSummary({ data }: { data: AutoReviewData }) {
  if (data.status === 'pending') {
    return (
      <div className="p-4 rounded-lg border border-rose-200 bg-rose-50 dark:bg-rose-900/10 text-sm text-rose-800 dark:text-rose-200 flex items-center gap-3">
        <span className="inline-block w-4 h-4 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
        {AUTO_REVIEW_LABEL}を作成しています…（1分ほどかかることがあります）
      </div>
    );
  }
  if (data.status === 'failed') {
    return (
      <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-300">
        {AUTO_REVIEW_LABEL}を作成できませんでした。講師が確認して添削をお届けします。
      </div>
    );
  }
  return (
    <div className="p-4 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-[#fffdf7] dark:bg-gray-900 text-sm">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="font-medium text-rose-700 dark:text-rose-300">{AUTO_REVIEW_LABEL}</span>
        {data.generated_at && <span className="text-xs text-gray-500">{new Date(data.generated_at).toLocaleString('ja-JP')}</span>}
      </div>
      {data.comment && <div className="whitespace-pre-wrap text-gray-800 dark:text-gray-200 mt-1">{data.comment}</div>}
      <AutoReviewSignature data={data} />
    </div>
  );
}

/** 署名（講師が確認済みなら講師名、未確認なら確認前である旨） */
export function AutoReviewSignature({ data }: { data: AutoReviewData }) {
  if (data.confirmed && data.reviewer_name) {
    return (
      <div className="mt-2 text-right">
        <span className="text-red-600 font-bold" style={{ fontFamily: '"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", serif' }}>
          講師　{data.reviewer_name}
        </span>
        {data.confirmed_at && (
          <span className="ml-2 text-xs text-gray-500">（確認 {new Date(data.confirmed_at).toLocaleDateString('ja-JP')}）</span>
        )}
      </div>
    );
  }
  return <div className="mt-2 text-xs text-gray-500">AIによる自動添削です。講師が確認すると署名が付きます。</div>;
}

/** 設問ごとの自動添削（赤ペン＋コメント）。赤ペンが無い設問はコメントだけを表示する */
export function AutoQuestionReview({
  data,
  questionId,
  fallbackText,
}: {
  data: AutoReviewData;
  questionId: number;
  /** 赤ペンが無いときに表示する回答文（不要なら省略） */
  fallbackText?: string | null;
}) {
  if (data.status !== 'ready') return null;
  const r = data.question_reviews.find((x) => x.question_id === questionId);
  if (!r) return null;
  const headerName = data.confirmed && data.reviewer_name ? data.reviewer_name : AUTO_REVIEW_LABEL;
  return (
    <div className="mt-3 space-y-2">
      <div className="text-xs font-medium text-rose-700 dark:text-rose-300">{AUTO_REVIEW_LABEL}</div>
      {r.markup && r.markup.length > 0 ? (
        <RedPenView segments={r.markup} reviewerName={headerName} reviewedAt={data.confirmed_at || data.generated_at} showSignature={false} />
      ) : fallbackText ? (
        <div className="text-[15px] leading-7 text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 rounded p-3 border border-gray-100 dark:border-gray-700">
          {fallbackText}
        </div>
      ) : null}
      {r.comment && <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">講評：{r.comment}</div>}
    </div>
  );
}
