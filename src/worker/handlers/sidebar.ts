import type { SpeakRequest, AnalyzeGrammarRequest, ShowSidebarRequest } from '../../shared/messages';
import { speak } from '../tts';
import { analyzeGrammar } from '../grammar';

export async function handleSpeak(req: SpeakRequest) {
  const success = await speak(req.text, req.lang);
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

export async function handleShowSidebar(req: ShowSidebarRequest) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, {
      action: 'show-sidebar', word: req.word, translation: req.translation,
    }).catch(() => {});
  }
  return { type: 'SPEAK_RESULT', success: true };
}
