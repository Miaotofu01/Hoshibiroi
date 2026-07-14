import type { WorkerRequest, TranslateResponse, TranslateErrorResponse } from '../shared/messages';
import { translate, getEnabledSources } from './translator';
import { analyzeGrammar } from './grammar';
import { speak } from './tts';
import {
  getHistory, addHistory,
  getFavorites, addFavorite, removeFavorite, isFavorite, updateFavorite,
  getDueWords,
  getSettings, saveSettings,
  saveVocabSettings,
} from './storage';
import { handleSubmitReview, handleGetDueWords, handleGetLearnStats, handleGetWordHistory } from './handlers/review';
import { handleGetFullStats, handleGetForecast } from './handlers/stats';
import { cleanExpiredCache } from './cache';

// ── 定期清理过期缓存 ──
cleanExpiredCache();
setInterval(cleanExpiredCache, 6 * 60 * 60 * 1000);

// ── SRS 复习提醒 ──
chrome.alarms.create('srs-check', { periodInMinutes: 60 }).catch(() => {});
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'srs-check') return;
  const due = await getDueWords();
  if (due.length === 0) return;
  const goalData = await chrome.storage.sync.get(['dailyGoal']);
  const dailyGoal: number = (goalData as any)?.dailyGoal || 10;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const all = await getFavorites();
  const reviewedToday = all.filter(f => f.lastReviewedAt >= todayStart.getTime()).length;
  let message = `你有 ${due.length} 个单词等待复习`;
  if (reviewedToday >= dailyGoal && due.length > 0) {
    message = `今日目标 ${dailyGoal} 词已达成！还有 ${due.length} 个待复习`;
  }
  chrome.notifications.create('srs-reminder', {
    type: 'basic', iconUrl: 'icons/icon-48.png', title: '生词本', message, priority: 1,
  }).catch(() => {});
});

function detectLang(text: string): string {
  if (/[一-鿿㐀-䶿]/.test(text)) return 'zh';
  if (/[぀-ゟ゠-ヿ]/.test(text)) return 'ja';
  if (/[가-힯]/.test(text)) return 'ko';
  return 'en';
}
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (command === 'translate') chrome.tabs.sendMessage(tab.id, { action: 'translate-selection' }).catch(() => {});
  else if (command === 'speak') chrome.tabs.sendMessage(tab.id, { action: 'speak-selection' }).catch(() => {});
});

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  const req = message as WorkerRequest;
  if (!req?.type) return false;
  handleRequest(req).then(sendResponse).catch(err => {
    console.error('[SW] handler error:', err);
    sendResponse({ type: 'TRANSLATE_ERROR', text: '', error: err.message });
  });
  return true;
});

async function handleRequest(req: WorkerRequest): Promise<unknown> {
  switch (req.type) {
    case 'TRANSLATE': {
      const from = req.sourceLang === 'auto' ? detectLang(req.text) : req.sourceLang;
      const to = req.targetLang || 'zh';
      try {
        const result = await translate(req.text, from, to, req.skipCache, req.sourceId);
        await addHistory({ id: generateId(), word: req.text, translation: result, sourceUrl: req.sourceUrl ?? '', timestamp: Date.now() });
        return { type: 'TRANSLATE_RESULT', text: req.text, translation: result, from, to } as TranslateResponse;
      } catch (err) {
        return { type: 'TRANSLATE_ERROR', text: req.text, error: err instanceof Error ? err.message : '未知错误' } as TranslateErrorResponse;
      }
    }
    case 'SPEAK': { const s = await speak(req.text, req.lang); return { type: 'SPEAK_RESULT', success: s }; }
    case 'TOGGLE_FAVORITE': {
      const existing = await isFavorite(req.word);
      if (existing) { await removeFavorite(existing.id); return { type: 'FAVORITE_RESULT', added: false, word: null }; }
      const word = { id: generateId(), word: req.word, translation: req.translation, context: req.context, sourceUrl: req.sourceUrl, createdAt: Date.now(), reviewCount: 0, lastReviewedAt: 0, nextReviewAt: 0, easeFactor: 2.5, difficulty: 5.0, reviewHistory: [], learned: false, starred: false };
      await addFavorite(word);
      return { type: 'FAVORITE_RESULT', added: true, word };
    }
    case 'REMOVE_FAVORITE': { await removeFavorite(req.id); return { type: 'FAVORITE_RESULT', added: false, word: null }; }
    case 'STAR_WORD': {
      await updateFavorite(req.wordId, { starred: req.starred });
      return { type: 'STAR_RESULT', wordId: req.wordId, starred: req.starred };
    }
    case 'GET_HISTORY': { const entries = await getHistory(); return { type: 'HISTORY_RESULT', entries }; }
    case 'GET_FAVORITES': { const words = await getFavorites(); return { type: 'FAVORITES_RESULT', words }; }
    case 'GET_SETTINGS': { const s2 = await getSettings(); return { type: 'SETTINGS_RESULT', ...s2 }; }
    case 'GET_SOURCES': { const srcs = await getEnabledSources(); return { type: 'SOURCES_RESULT', sources: srcs }; }
    case 'ANALYZE_GRAMMAR': {
      try { const a = await analyzeGrammar(req.text, req.lang, req.detail); return { type: 'GRAMMAR_RESULT', text: req.text, analysis: a }; }
      catch (err) { return { type: 'GRAMMAR_ERROR', text: req.text, error: err instanceof Error ? err.message : '语法分析失败' }; }
    }
    case 'SHOW_SIDEBAR': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) chrome.tabs.sendMessage(tab.id, { action: 'show-sidebar', word: req.word, translation: req.translation }).catch(() => {});
      return { type: 'SPEAK_RESULT', success: true };
    }
    case 'SAVE_SETTINGS': { await saveSettings(req.translators, req.preferences); return { type: 'SETTINGS_RESULT', translators: req.translators, preferences: req.preferences }; }
    case 'SUBMIT_REVIEW': return handleSubmitReview(req);
    case 'GET_DUE_WORDS': return handleGetDueWords(req);
    case 'GET_LEARN_STATS': return handleGetLearnStats(req);
    case 'GET_WORD_HISTORY': return handleGetWordHistory(req);
    case 'GET_FULL_STATS': return handleGetFullStats(req);
    case 'GET_FORECAST': return handleGetForecast(req);
    case 'SAVE_VOCAB_SETTINGS': { await saveVocabSettings(req.settings); return { type: 'VOCAB_SETTINGS_RESULT', settings: req.settings }; }
    default: return { type: 'TRANSLATE_ERROR', text: '', error: '未知请求类型' };
  }
}
