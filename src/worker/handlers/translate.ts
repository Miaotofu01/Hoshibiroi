import type { TranslateRequest, TranslateResponse, TranslateErrorResponse } from '../../shared/messages';
import { translate } from '../translator';
import { addHistory } from '../storage';

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function detectLang(text: string): string {
  if (/[一-鿿㐀-䶿]/.test(text)) return 'zh';
  if (/[぀-ゟ゠-ヿ]/.test(text)) return 'ja';
  if (/[가-힯]/.test(text)) return 'ko';
  return 'en';
}

export async function handleTranslate(req: TranslateRequest): Promise<TranslateResponse | TranslateErrorResponse> {
  const from = req.sourceLang === 'auto' ? detectLang(req.text) : req.sourceLang;
  const to = req.targetLang || 'zh';

  try {
    const result = await translate(req.text, from, to, req.skipCache, req.sourceId);

    await addHistory({
      id: generateId(),
      word: req.text,
      translation: result,
      sourceUrl: req.sourceUrl ?? '',
      timestamp: Date.now(),
    });

    return {
      type: 'TRANSLATE_RESULT',
      text: req.text,
      translation: result,
      from,
      to,
    };
  } catch (err) {
    return {
      type: 'TRANSLATE_ERROR',
      text: req.text,
      error: err instanceof Error ? err.message : '未知错误',
    };
  }
}
