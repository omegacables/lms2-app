'use client';

// 赤ペン添削の表示（受講者の課題ページ・テストページ・指導者の添削画面で共通）。
// 本文に赤の取り消し線／書き足し／マーカーと丸数字を付け、下に吹き出しコメントを並べ、
// 最後に講師名で署名する。editable を渡すと、吹き出しの編集と修正の取り消しができる。

import { circledNumber, hasNote, noteNumbers, type RedPenSegment } from '@/lib/quiz/redpen';

interface RedPenViewProps {
  segments: RedPenSegment[];
  /** 吹き出しと署名に表示する講師名 */
  reviewerName?: string | null;
  /** 吹き出しに表示する日付 */
  reviewedAt?: string | null;
  /** 署名を表示するか（既定: 講師名があれば表示） */
  showSignature?: boolean;
  editable?: {
    onNoteChange: (segmentIndex: number, note: string) => void;
    onRevert: (segmentIndex: number) => void;
  };
}

const PAPER_FONT = '"Yu Mincho", "YuMincho", "Hiragino Mincho ProN", "Noto Serif JP", serif';

export function RedPenView({ segments, reviewerName, reviewedAt, showSignature, editable }: RedPenViewProps) {
  const numbers = noteNumbers(segments);
  const dateLabel = reviewedAt ? new Date(reviewedAt).toLocaleDateString('ja-JP') : '';
  const signed = (showSignature ?? true) && !!reviewerName;

  return (
    <div className="rounded-md border border-red-200 dark:border-red-900/60 bg-[#fffdf7] dark:bg-gray-900">
      {/* 本文 */}
      <div
        className="px-4 py-3 text-[15px] leading-[2.1] text-gray-900 dark:text-gray-100 whitespace-pre-wrap"
        style={{ fontFamily: PAPER_FONT }}
      >
        {segments.map((sg, i) => {
          const num = numbers[i];
          const marker = num ? (
            <sup className="text-red-600 font-bold text-[11px] ml-0.5 select-none">{circledNumber(num)}</sup>
          ) : null;
          if (sg.type === 'del') {
            return (
              <span key={i}>
                <span className="text-red-600 line-through decoration-red-600 decoration-2">{sg.text}</span>
                {marker}
              </span>
            );
          }
          if (sg.type === 'ins') {
            return (
              <span key={i}>
                <span className="text-red-600 underline decoration-red-500 underline-offset-4">{sg.text}</span>
                {marker}
              </span>
            );
          }
          if (hasNote(sg)) {
            return (
              <span key={i}>
                <span className="bg-red-50 dark:bg-red-900/30 border border-dashed border-red-400 rounded-sm px-0.5">{sg.text}</span>
                {marker}
              </span>
            );
          }
          return <span key={i}>{sg.text}</span>;
        })}
      </div>

      {/* 吹き出しコメント */}
      {numbers.some((n) => n !== null) && (
        <div className="border-t border-red-100 dark:border-red-900/40 px-3 py-3 space-y-2">
          {segments.map((sg, i) => {
            const num = numbers[i];
            if (!num) return null;
            return (
              <div
                key={i}
                className="flex gap-2 rounded-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm px-3 py-2"
              >
                <span className="text-red-600 font-bold leading-6 select-none">{circledNumber(num)}</span>
                <div className="min-w-0 flex-1">
                  {(reviewerName || dateLabel) && (
                    <div className="text-[11px] text-gray-500 mb-0.5">
                      {reviewerName && <span className="font-semibold text-gray-700 dark:text-gray-300 mr-2">{reviewerName}</span>}
                      {dateLabel}
                    </div>
                  )}
                  {editable ? (
                    <textarea
                      className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                      rows={2}
                      value={sg.note || ''}
                      onChange={(e) => editable.onNoteChange(i, e.target.value)}
                    />
                  ) : (
                    <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{sg.note}</div>
                  )}
                  {editable && (
                    <button
                      type="button"
                      className="mt-1 text-xs text-gray-500 hover:text-red-600 underline"
                      onClick={() => editable.onRevert(i)}
                    >
                      {sg.type === 'keep' ? 'このコメントを削除' : 'この修正を取り消す'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 署名 */}
      {signed && (
        <div className="px-4 pb-3 text-right text-red-600 font-bold" style={{ fontFamily: PAPER_FONT }}>
          講師　{reviewerName}
        </div>
      )}
    </div>
  );
}
