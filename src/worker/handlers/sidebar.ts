import type { SpeakRequest, AnalyzeGrammarRequest } from '../../shared/messages';
import { speak } from '../tts';
import { analyzeGrammar } from '../grammar';
import { detectLang } from './translate';

export async function handleSpeak(req: SpeakRequest) {
  // lang='auto' 时按文本内容检测（收藏日语/中文词也能用对语音）
  const lang = req.lang === 'auto' ? detectLang(req.text) : req.lang;
  const success = await speak(req.text, lang);
  return { type: 'SPEAK_RESULT', success };
}

export async function handleAnalyzeGrammar(req: AnalyzeGrammarRequest) {
  try {
    const analysis = await analyzeGrammar(req.text, req.lang, req.detail);
    return { type: 'GRAMMAR_RESULT', text: req.text, analysis };
  } catch (err) {
    return {
      type: 'GRAMMAR_ERROR',
      text: req.text,
      error: err instanceof Error ? err.message : '语法分析失败',
    };
  }
}
