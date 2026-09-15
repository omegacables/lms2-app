import type { RedPenSegment } from './redpen';

// 通信制対応：小テスト／記述式最終テスト 関連の共有型定義

export type QuizType = 'choice' | 'essay';
/** 採点方式: auto=回答時に即時採点（小テスト） / review=提出のみ・指導者が添削（最終テスト） */
export type GradingMode = 'auto' | 'review';
/** 回答形式: plain=選択肢をそのまま表示 / generated=選択肢を回答パターンとして扱い、受験ごとに回答文を生成して提示 */
export type AnswerStyle = 'plain' | 'generated';
export type QuizStatus = 'draft' | 'published';
export type EssayResult = 'passed' | 'needs_revision';

export interface Quiz {
  id: number;
  course_id: number;
  after_video_id: number | null; // NULL ならコース末
  title: string;
  quiz_type: QuizType;
  grading_mode: GradingMode;
  answer_style: AnswerStyle;
  pass_policy: 'all_correct';
  sort_order: number;
  status: QuizStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// 管理者向け（正答・解説を含む）
export interface QuizQuestion {
  id: number;
  quiz_id: number;
  question_text: string;
  choices: string[];
  correct_index: number | null;
  explanation: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

// 受講者向け（正答・解説を含まない安全な形）
export interface QuizQuestionStudent {
  id: number;
  quiz_id: number;
  question_text: string;
  choices: string[];
  sort_order: number;
}

export interface QuizAttempt {
  id: number;
  user_id: string;
  quiz_id: number;
  question_id: number;
  selected_index: number | null;
  answer_text: string | null;
  is_correct: boolean | null;
  attempt_no: number;
  choice_set_id: string | null;
  answered_at: string;
}

/** 設問ごとの添削（選択式の正誤付け・個別コメント） */
export interface QuestionReview {
  question_id: number;
  is_correct: boolean | null;
  comment: string | null;
  /** 赤ペン添削（回答文に対する取り消し線・書き足し・吹き出し）。無い場合は null */
  markup?: RedPenSegment[] | null;
}

export interface EssayReview {
  id: number;
  quiz_id: number;
  user_id: string;
  reviewer_id: string | null;
  review_comment: string | null;
  question_reviews: QuestionReview[];
  result: EssayResult;
  ai_assisted: boolean;
  reviewed_at: string;
}

// 受講者に返す採点結果（正答・解説は不正解時のみ）
export interface GradeResult {
  question_id: number;
  is_correct: boolean;
  correct_index: number | null; // 不正解時のみ返す
  explanation: string | null;   // 不正解時のみ返す
}

/** 提出制テスト（記述式／選択式 grading_mode='review'）の受講者から見た状態 */
export type SubmissionStatus =
  | 'not_submitted'
  | 'under_review'
  | 'needs_revision'
  | 'passed';
