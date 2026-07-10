import type { TranslationResult } from '../../shared/types';
import type { TranslatorAdapter } from './base';

const SYSTEM_PROMPT = `You are a professional translator and language teacher. Translate the given text and provide a detailed breakdown.

Respond in JSON format only:
{
  "text": "translated text",
  "phonetic": "pronunciation in IPA (for English words only, omit for other languages)",
  "partsOfSpeech": [{"type": "n.", "meanings": ["meaning1", "meaning2"]}],
  "examples": [{"original": "example sentence", "translated": "翻译"}]
}`;

export const deepseekTranslator: TranslatorAdapter = {
  id: 'deepseek',
  name: 'DeepSeek',
  requiresApiKey: true,

  async translate(text: string, from: string, to: string, apiKey?: string): Promise<TranslationResult> {
    if (!apiKey) throw new Error('DeepSeek API key 未配置');

    const langNames: Record<string, string> = {
      auto: '', zh: 'Chinese', en: 'English', ja: 'Japanese', ko: 'Korean', fr: 'French', de: 'German', es: 'Spanish',
    };
    const fromName = langNames[from] || '';
    const toName = langNames[to] || 'Chinese';
    const direction = fromName ? `from ${fromName} to ${toName}` : `to ${toName}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Translate "${text}" ${direction}` },
          ],
          temperature: 0.3,
          max_tokens: 1024,
        }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as { error?: { message?: string } }).error?.message ?? `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const content = data.choices?.[0]?.message?.content ?? '';
      // 尝试提取 JSON（可能被 markdown code block 包裹）
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { text: content.trim(), source: 'DeepSeek' };
      }

      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          text: parsed.text ?? content.trim(),
          phonetic: parsed.phonetic,
          partsOfSpeech: parsed.partsOfSpeech,
          examples: parsed.examples,
          source: 'DeepSeek',
        };
      } catch {
        return { text: content.trim(), source: 'DeepSeek' };
      }
    } finally {
      clearTimeout(timeout);
    }
  },
};
