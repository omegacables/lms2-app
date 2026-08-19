// 通信制対応：小テスト／記述式最終テスト 関連の共有型定義

export type QuizType = 'choice' | 'essay';
export type QuizStatus = 'draft' | 'published';
export type EssayResult = 'passed' | 'needs_revision';

export interface Quiz {
  id: number;
  course_id: number;
  after_video_id: number | null; // NULL ならコース末
  title: string;
  quiz_type: QuizType;
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
  answered_at: string;
}

export interface EssayReview {
  id: number;
  quiz_id: number;
  user_id: string;
  reviewer_id: string | null;
  review_comment: string | null;
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
