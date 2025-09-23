import { z } from 'zod';

// パスワード強度バリデーション
const passwordSchema = z
  .string()
  .min(8, 'パスワードは8文字以上である必要があります')
  .regex(/[A-Z]/, 'パスワードには大文字を含める必要があります')
  .regex(/[a-z]/, 'パスワードには小文字を含める必要があります')
  .regex(/[0-9]/, 'パスワードには数字を含める必要があります')
  .regex(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/, 'パスワードには特殊文字を含める必要があります');

// メールアドレスバリデーション
const emailSchema = z
  .string()
  .min(1, 'メールアドレスは必須です')
  .email('有効なメールアドレスを入力してください');

// ログインフォームスキーマ
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'パスワードは必須です'),
});

// ユーザー登録フォームスキーマ
export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'パスワード確認は必須です'),
    displayName: z
      .string()
      .min(1, '表示名は必須です')
      .max(100, '表示名は100文字以内で入力してください'),
    company: z
      .string()
      .max(100, '会社名は100文字以内で入力してください')
      .optional(),
    department: z
      .string()
      .max(100, '部署名は100文字以内で入力してください')
      .optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'パスワードが一致しません',
    path: ['confirmPassword'],
  });

// パスワードリセットフォームスキーマ
export const resetPasswordSchema = z.object({
  email: emailSchema,
});

// パスワード変更フォームスキーマ
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, '現在のパスワードは必須です'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'パスワード確認は必須です'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'パスワードが一致しません',
    path: ['confirmPassword'],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: '新しいパスワードは現在のパスワードと異なる必要があります',
    path: ['newPassword'],
  });

// プロフィール更新フォームスキーマ
export const profileUpdateSchema = z.object({
  display_name: z
    .string()
    .min(1, '表示名は必須です')
    .max(100, '表示名は100文字以内で入力してください'),
  company: z
    .string()
    .max(100, '会社名は100文字以内で入力してください')
    .optional(),
  department: z
    .string()
    .max(100, '部署名は100文字以内で入力してください')
    .optional(),
});

// 管理者用ユーザー作成フォームスキーマ
export const adminUserCreateSchema = z.object({
  email: emailSchema,
  displayName: z
    .string()
    .min(1, '表示名は必須です')
    .max(100, '表示名は100文字以内で入力してください'),
  company: z
    .string()
    .max(100, '会社名は100文字以内で入力してください')
    .optional(),
  department: z
    .string()
    .max(100, '部署名は100文字以内で入力してください')
    .optional(),
  role: z.enum(['student', 'instructor', 'admin']),
  temporaryPassword: passwordSchema,
});

// 権限変更フォームスキーマ
export const roleUpdateSchema = z.object({
  role: z.enum(['student', 'instructor', 'admin']),
});

// フォーム型定義
export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
export type ProfileUpdateFormData = z.infer<typeof profileUpdateSchema>;
export type AdminUserCreateFormData = z.infer<typeof adminUserCreateSchema>;
export type RoleUpdateFormData = z.infer<typeof roleUpdateSchema>;

// バリデーションエラーメッセージの日本語化
export const getFieldError = (error: any, field: string): string | undefined => {
  if (!error?.errors) return undefined;
  
  const fieldError = error.errors.find((err: any) => 
    err.path && err.path.includes(field)
  );
  
  return fieldError?.message;
};

// フォームデータの正規化
export const normalizeFormData = <T extends Record<string, any>>(data: T): T => {
  const normalized = { ...data } as any;
  
  // 空文字列をundefinedに変換
  Object.keys(normalized).forEach((key) => {
    if (typeof normalized[key] === 'string' && normalized[key].trim() === '') {
      normalized[key] = undefined;
    }
  });
  
  return normalized;
};

// パスワード強度スコア計算
export const calculatePasswordStrength = (password: string): {
  score: number;
  feedback: string[];
} => {
  let score = 0;
  const feedback: string[] = [];
  
  if (password.length >= 8) {
    score += 1;
  } else {
    feedback.push('8文字以上にしてください');
  }
  
  if (/[A-Z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('大文字を含めてください');
  }
  
  if (/[a-z]/.test(password)) {
    score += 1;
  } else {
    feedback.push('小文字を含めてください');
  }
  
  if (/[0-9]/.test(password)) {
    score += 1;
  } else {
    feedback.push('数字を含めてください');
  }
  
  if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    score += 1;
  } else {
    feedback.push('特殊文字を含めてください');
  }
  
  if (password.length >= 12) {
    score += 1;
  }
  
  return { score, feedback };
};

// パスワード強度レベル
export const getPasswordStrengthLevel = (score: number): {
  level: 'weak' | 'fair' | 'good' | 'strong';
  color: string;
  text: string;
} => {
  if (score <= 2) {
    return { level: 'weak', color: 'text-red-500', text: '弱い' };
  } else if (score <= 3) {
    return { level: 'fair', color: 'text-yellow-500', text: '普通' };
  } else if (score <= 4) {
    return { level: 'good', color: 'text-blue-500', text: '良い' };
  } else {
    return { level: 'strong', color: 'text-green-500', text: '強い' };
  }
};