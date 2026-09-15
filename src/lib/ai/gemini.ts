// Google Gemini 呼び出しの共通ヘルパー（サーバー専用）。
// 環境変数 GEMINI_API_KEY が必要。
//
// モデルは用途ごとに切り替えられる（上から優先）:
//   回答文生成（受講者がテストを開くたびに呼ぶ。速さ・安定性重視）… GEMINI_MODEL_GENERATION → GEMINI_MODEL → gemini-2.5-flash
//   添削（講師が提出を開いたときに呼ぶ。精度重視）               … GEMINI_MODEL_REVIEW     → GEMINI_MODEL → gemini-3.1-pro-preview
// 添削のモデルが失敗（提供終了・混雑・タイムアウト等）したときは gemini-3.8-flash で1回だけやり直す。
//
// 2026-09 の実測（コース14の設問）:
//   回答文生成 … 2.5 Flash は25回中タイムアウト0回・平均約3秒。3.x 系は10回中2回15秒以上止まったため 2.5 Flash を既定にした。
//   赤ペン添削 … 3.1 Pro が最も的確（必要な箇所だけを直す）。3.8 Flash もほぼ同等で、2.5 Flash は添削後の文に矛盾が残ることがあった。
//
// Gemini 3 系は思考量を thinkingLevel で指定し、temperature は既定値（1.0）のまま使うことが推奨されているため、
// モデルの世代に応じてリクエストの形を変える。

export type GeminiPurpose = 'generation' | 'review';

/** 思考量。'default' はモデルの既定に任せる */
export type ThinkingEffort = 'minimal' | 'low' | 'medium' | 'high' | 'default';

/** 応答待ちの上限（ms）。回答文生成は受講者を待たせるので短め */
const DEFAULT_TIMEOUT_MS: Record<GeminiPurpose, number> = {
  generation: 15_000,
  review: 120_000,
};

export class GeminiTimeoutError extends Error {
  constructor(model: string, ms: number) {
    super(`Gemini API がタイムアウトしました (${model}, ${ms}ms)`);
    this.name = 'GeminiTimeoutError';
  }
}

const DEFAULT_MODELS: Record<GeminiPurpose, string> = {
  generation: 'gemini-2.5-flash',
  review: 'gemini-3.1-pro-preview',
};

/** 主モデルが失敗したときに1回だけ使うモデル（回答文生成は受講者を待たせないよう、やり直さずに固定の選択肢へ切り替える） */
const FALLBACK_MODELS: Partial<Record<GeminiPurpose, string>> = {
  review: 'gemini-3.8-flash',
};

export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export function geminiModelName(purpose: GeminiPurpose): string {
  const specific = purpose === 'generation' ? process.env.GEMINI_MODEL_GENERATION : process.env.GEMINI_MODEL_REVIEW;
  return specific || process.env.GEMINI_MODEL || DEFAULT_MODELS[purpose];
}

function isGemini3(model: string): boolean {
  return /^gemini-3/.test(model);
}

function thinkingConfigFor(model: string, effort: ThinkingEffort): Record<string, unknown> | undefined {
  if (effort === 'default') return undefined;
  if (isGemini3(model)) {
    // minimal を受け付けるのは 3 Flash（プレビュー）と Flash-Lite 系だけ。それ以外（Pro、3.6〜3.8 Flash 等）は low に寄せる
    const supportsMinimal = /flash-lite/.test(model) || /^gemini-3-flash/.test(model);
    const level = effort === 'minimal' && !supportsMinimal ? 'low' : effort;
    return { thinkingLevel: level };
  }
  // 2.5 系は思考トークンの上限で指定（2.5 Pro は思考をオフにできないので最小値）
  const budgets: Record<Exclude<ThinkingEffort, 'default'>, number> = { minimal: 0, low: 1024, medium: 8192, high: 24576 };
  if (/2\.5-pro/.test(model) && effort === 'minimal') return { thinkingBudget: 128 };
  return { thinkingBudget: budgets[effort] };
}

interface GenerateOptions {
  purpose: GeminiPurpose;
  /** Gemini 2.5 系でのみ使う（3 系は既定の 1.0 のまま） */
  temperature?: number;
  thinking?: ThinkingEffort;
  timeoutMs?: number;
}

async function callModel(model: string, prompt: string, opts: GenerateOptions): Promise<any> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY が設定されていません');

  const generationConfig: Record<string, unknown> = { responseMimeType: 'application/json' };
  if (!isGemini3(model)) generationConfig.temperature = opts.temperature ?? 0.85;
  const thinkingConfig = thinkingConfigFor(model, opts.thinking ?? 'default');
  if (thinkingConfig) generationConfig.thinkingConfig = thinkingConfig;

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS[opts.purpose];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let json: any;
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig,
        }),
        signal: controller.signal,
      }
    );

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Gemini API エラー (${model}, ${res.status}): ${t.slice(0, 300)}`);
    }
    json = await res.json();
  } catch (e) {
    if (controller.signal.aborted) throw new GeminiTimeoutError(model, timeoutMs);
    throw e;
  } finally {
    clearTimeout(timer);
  }

  // 思考の要約（thought: true）が混ざる場合に備えて、本文パートだけをつなぐ
  const parts: any[] = json?.candidates?.[0]?.content?.parts || [];
  const text: string = parts.filter((p) => !p?.thought).map((p) => p?.text || '').join('');
  if (!text) throw new Error(`Gemini から応答が得られませんでした (${model})`);

  try {
    return JSON.parse(text);
  } catch {
    // まれにコードフェンス付きで返る場合の保険
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned);
  }
}

/**
 * JSON 応答を返すプロンプトを実行し、パース済みオブジェクトを返す。
 * 用途に予備モデルがあり、主モデルが失敗した場合は予備モデルで1回だけやり直す。
 */
export async function geminiGenerateJSON(prompt: string, opts: GenerateOptions): Promise<any> {
  if (!isGeminiConfigured()) throw new Error('GEMINI_API_KEY が設定されていません');
  const primary = geminiModelName(opts.purpose);
  try {
    return await callModel(primary, prompt, opts);
  } catch (e) {
    const fallback = FALLBACK_MODELS[opts.purpose];
    if (!fallback || fallback === primary) throw e;
    console.warn(`[gemini] ${primary} が失敗したため ${fallback} でやり直します:`, String(e).slice(0, 300));
    return callModel(fallback, prompt, opts);
  }
}
