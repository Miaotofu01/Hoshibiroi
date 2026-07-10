import type { TranslationResult } from '../../shared/types';
import type { TranslatorAdapter } from './base';

export const googleTranslator: TranslatorAdapter = {
  id: 'google',
  name: 'Google Translate',
  requiresApiKey: false,

  async translate(text: string, from: string, to: string): Promise<TranslationResult> {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${from}&tl=${to}&dt=t&dt=rm&q=${encodeURIComponent(text)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    try {
      const resp = await fetch(url, { signal: controller.signal });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();

      // 解析 Google 返回格式: [[["译文","原文",...],null,"en"],...]
      const translated = data[0]
        ?.filter((item: unknown[]) => item[0])
        ?.map((item: unknown[]) => (item as string[])[0])
        ?.join('') ?? text;

      // Google 免费接口不返回音标、词性、例句
      return {
        text: translated,
        source: 'Google Translate',
      };
    } finally {
      clearTimeout(timeout);
    }
  },

  tts(text: string, lang: string): string | null {
    return `https://translate.google.com/translate_tts?ie=UTF-8&tl=${lang}&client=gtx&q=${encodeURIComponent(text)}`;
  },
};
