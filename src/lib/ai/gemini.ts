// Google Gemini 呼び出しの共通ヘルパー（サーバー専用）。
// 環境変数 GEMINI_API_KEY が必要。モデルは GEMINI_MODEL で上書き可。
// 既定は gemini-2.5-flash（新しめでコスパ良好）。さらに低コストにするなら gemini-2.5-flash-lite。

export function isGeminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

/**
 * JSON 応答を返すプロンプトを実行し、パース済みオブジェクトを返す。
 * temperature を少し高めにして、受講者ごとに異なる添削文になるようにする。
 */
export async function geminiGenerateJSON(
  prompt: string,
  opts: { temperature?: number } = {}
): Promise<any> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY が設定されていません');
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: opts.temperature ?? 0.85,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gemini API エラー (${res.status}): ${t.slice(0, 300)}`);
  }

  const json = await res.json();
  const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
  if (!text) throw new Error('Gemini から応答が得られませんでした');

  try {
    return JSON.parse(text);
  } catch {
    // まれにコードフェンス付きで返る場合の保険
    const cleaned = text.replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    return JSON.parse(cleaned);
  }
}
