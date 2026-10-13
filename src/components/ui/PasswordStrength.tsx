'use client';

// 新しいパスワードの入力欄（強さメーター・条件チェック・表示切替・提案）。
// 見た目と振る舞いは Arc UI の password-strength（https://uiarc.dev/components/password-strength）を参考に、
// このプロジェクトの Tailwind で作っている（Arc の基盤CSSはこのサイトの配色・ダークモードと衝突するため入れない）。

import { forwardRef, useId, type InputHTMLAttributes } from 'react';
import { CheckIcon, EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordRuleResult {
  id: 'length' | 'alnum' | 'case' | 'symbol';
  label: string;
  met: boolean;
  /** 満たさないと保存できない条件 */
  required: boolean;
  /** 長さの条件で、あと何文字か */
  remaining?: number;
}

export interface PasswordStrengthResult {
  /** 0=短すぎる（8文字未満）、1〜4=満たした条件の数 */
  level: 0 | 1 | 2 | 3 | 4;
  label: string;
  rules: PasswordRuleResult[];
  requiredMet: boolean;
  metCount: number;
}

const LEVEL_LABELS = ['短すぎます', '弱い', '普通', '強い', 'とても強い'] as const;
const LEVEL_TEXT = ['text-red-600 dark:text-red-400', 'text-red-600 dark:text-red-400', 'text-amber-600 dark:text-amber-400', 'text-emerald-600 dark:text-emerald-400', 'text-green-600 dark:text-green-400'];
const LEVEL_BAR = ['bg-red-500', 'bg-red-500', 'bg-amber-500', 'bg-emerald-500', 'bg-green-600'];

/** 端末の中だけで判定する（辞書チェックはしない） */
export function evaluatePassword(password: string): PasswordStrengthResult {
  const length = Array.from(password).length;
  const rules: PasswordRuleResult[] = [
    {
      id: 'length',
      label: `${PASSWORD_MIN_LENGTH}文字以上`,
      met: length >= PASSWORD_MIN_LENGTH,
      required: true,
      remaining: Math.max(0, PASSWORD_MIN_LENGTH - length),
    },
    { id: 'alnum', label: '英字と数字を両方使う', met: /[A-Za-z]/.test(password) && /[0-9]/.test(password), required: true },
    { id: 'case', label: '大文字と小文字を両方使う', met: /[a-z]/.test(password) && /[A-Z]/.test(password), required: false },
    { id: 'symbol', label: '記号（- _ ! ? など）を使う', met: /[^A-Za-z0-9\s]/.test(password), required: false },
  ];
  const metCount = rules.filter((r) => r.met).length;
  const level = (length < PASSWORD_MIN_LENGTH ? 0 : metCount) as PasswordStrengthResult['level'];
  return {
    level,
    label: LEVEL_LABELS[level],
    rules,
    requiredMet: rules.every((r) => !r.required || r.met),
    metCount,
  };
}

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // I・O を除く
const LOWER = 'abcdefghjkmnpqrstuvwxyz'; // i・l・o を除く
const DIGIT = '23456789'; // 0・1 を除く

function randomChar(chars: string): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return chars[buf[0] % chars.length];
}

/**
 * 提案用のパスワード（4文字×3を「-」でつなぐ。例 Kd7m-Px4t-Rw9h）。
 * 大文字・小文字・数字・記号をすべて含み、読み間違えやすい文字は使わない（約69ビット）。
 */
export function generatePassword(): string {
  const all = UPPER + LOWER + DIGIT;
  for (;;) {
    const groups = Array.from({ length: 3 }, () => Array.from({ length: 4 }, () => randomChar(all)).join(''));
    const pw = groups.join('-');
    if (/[A-Z]/.test(pw) && /[a-z]/.test(pw) && /[0-9]/.test(pw)) return pw;
  }
}

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  revealed: boolean;
  onRevealedChange: (revealed: boolean) => void;
  invalid?: boolean;
}

/** 表示・非表示を切り替えられるパスワード入力欄 */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { revealed, onRevealedChange, invalid, className = '', id, ...props },
  ref
) {
  const fallbackId = useId();
  const inputId = id || fallbackId;
  return (
    <div className="relative">
      <input
        ref={ref}
        id={inputId}
        type={revealed ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        aria-invalid={invalid || undefined}
        className={`block w-full rounded-lg border bg-white py-2.5 pl-3 pr-11 text-base text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-neutral-900 dark:text-gray-100 sm:text-sm ${
          invalid
            ? 'border-red-400 focus:border-red-500 focus:ring-red-500/30 dark:border-red-600'
            : 'border-gray-300 focus:border-indigo-500 focus:ring-indigo-500/30 dark:border-neutral-700'
        } ${revealed ? 'font-mono tracking-wide' : ''} ${className}`}
        {...props}
      />
      <button
        type="button"
        onClick={() => onRevealedChange(!revealed)}
        aria-pressed={revealed}
        aria-controls={inputId}
        aria-label={revealed ? 'パスワードを隠す' : 'パスワードを表示'}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 dark:hover:text-gray-300"
      >
        {revealed ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
      </button>
    </div>
  );
});

interface PasswordStrengthFieldProps extends Omit<PasswordInputProps, 'value' | 'onChange'> {
  label: string;
  value: string;
  onValueChange: (value: string, strength: PasswordStrengthResult) => void;
}

/** 新しいパスワード：入力欄＋4段階の強さメーター＋条件のチェックリスト */
export function PasswordStrengthField({ label, value, onValueChange, id, revealed, onRevealedChange, ...props }: PasswordStrengthFieldProps) {
  const fallbackId = useId();
  const inputId = id || fallbackId;
  const rulesId = `${inputId}-rules`;
  const strength = evaluatePassword(value);
  const filled = value.length === 0 ? 0 : Math.max(1, strength.level);
  const word = value.length === 0 ? '未入力' : strength.label;

  return (
    <div>
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      <PasswordInput
        id={inputId}
        value={value}
        onChange={(e) => onValueChange(e.target.value, evaluatePassword(e.target.value))}
        revealed={revealed}
        onRevealedChange={onRevealedChange}
        aria-describedby={rulesId}
        {...props}
      />

      {/* 強さメーター */}
      <div className="mt-2.5 flex items-center gap-3">
        <div
          role="meter"
          aria-label="パスワードの強さ"
          aria-valuemin={0}
          aria-valuemax={4}
          aria-valuenow={strength.level}
          aria-valuetext={word}
          className="grid flex-1 grid-cols-4 gap-1.5"
        >
          {[0, 1, 2, 3].map((i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-colors duration-300 motion-reduce:transition-none ${
                i < filled ? LEVEL_BAR[strength.level] : 'bg-gray-200 dark:bg-neutral-700'
              }`}
              style={{ transitionDelay: `${i * 40}ms` }}
            />
          ))}
        </div>
        <span
          className={`w-20 text-right text-xs font-semibold ${value.length === 0 ? 'text-gray-400' : LEVEL_TEXT[strength.level]}`}
        >
          {word}
        </span>
      </div>

      {/* 条件 */}
      <ul id={rulesId} aria-label="パスワードの条件" className="mt-3 space-y-1.5">
        {strength.rules.map((rule) => (
          <li key={rule.id} className="flex items-center gap-2 text-sm">
            <span
              className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border transition-colors duration-200 motion-reduce:transition-none ${
                rule.met
                  ? 'border-green-600 bg-green-600 text-white'
                  : 'border-gray-300 text-transparent dark:border-neutral-600'
              }`}
              aria-hidden="true"
            >
              <CheckIcon className="h-3 w-3" strokeWidth={3} />
            </span>
            <span className={rule.met ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500 dark:text-gray-400'}>
              {rule.label}
              <span className="sr-only">{rule.met ? '（満たしています）' : '（まだ満たしていません）'}</span>
            </span>
            {rule.required ? (
              <span className="rounded bg-gray-100 px-1.5 py-px text-[10px] font-medium text-gray-600 dark:bg-neutral-800 dark:text-gray-300">
                必須
              </span>
            ) : (
              <span className="text-[10px] text-gray-400 dark:text-gray-500">より安全</span>
            )}
            {rule.id === 'length' && value.length > 0 && !!rule.remaining && (
              <span className="ml-auto text-xs tabular-nums text-gray-500 dark:text-gray-400">あと{rule.remaining}文字</span>
            )}
          </li>
        ))}
      </ul>
      <p role="status" className="sr-only">
        {value.length === 0 ? '' : `強さ：${word}。${strength.rules.length}個の条件のうち${strength.metCount}個を満たしています。`}
      </p>
    </div>
  );
}
