import type { TranslationResult } from '../../shared/types';
import type { TranslatorAdapter } from './base';

export const deeplTranslator: TranslatorAdapter = {
  id: 'deepl',
  name: 'DeepL',
  requiresApiKey: true,

  async translate(text: string, from: string, to: string, apiKey?: string): Promise<TranslationResult> {
    if (!apiKey) throw new Error('DeepL API key 未配置');

    const langMap: Record<string, string> = {
      auto: '', zh: 'ZH', en: 'EN', ja: 'JA', ko: 'KO', fr: 'FR', de: 'DE', es: 'ES'
    };

    const params = new URLSearchParams({
      text,
      target_lang: langMap[to] || 'ZH',
    });
    if (from !== 'auto' && langMap[from]) {
      params.append('source_lang', langMap[from]);
    }

    const isFree = apiKey.endsWith(':fx');
    const baseUrl = isFree ? 'https://api-free.deepl.com' : 'https://api.deepl.com';

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const resp = await fetch(`${baseUrl}/v2/translate`, {
        method: 'POST',
        headers: {
          'Authorization': `DeepL-Auth-Key ${apiKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const translated = data.translations?.[0]?.text ?? text;

      return {
        text: translated,
        source: 'DeepL',
      };
    } finally {
      clearTimeout(timeout);
    }
  },
};
