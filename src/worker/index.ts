import type { WorkerRequest, TranslateResponse, TranslateErrorResponse } from '../shared/messages';
import { translate, getEnabledSources } from './translator';
import { analyzeGrammar } from './grammar';
import { speak } from './tts';
import {
  getHistory, addHistory,
  getFavorites, addFavorite, removeFavorite, isFavorite,
  updateFavorite, getDueWords,
  getSettings, saveSettings,
  saveVocabSettings,
} from './storage';
import { sm2, normalizeQuality } from './srs';
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

  // 检查每日目标
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
    type: 'basic',
    iconUrl: 'icons/icon-48.png',
    title: '生词本',
    message,
    priority: 1,
  }).catch(() => {});
});

// ── 语言检测辅助 ──
function detectLang(text: string): string {
  // 简单字符集检测
  if (/[一-鿿㐀-䶿]/.test(text)) return 'zh';
  if (/[぀-ゟ゠-ヿ]/.test(text)) return 'ja';
  if (/[가-힯]/.test(text)) return 'ko';
  return 'en';
}

// ── ID 生成 ──
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// ── 键盘快捷键 ──
chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (command === 'translate') {
    chrome.tabs.sendMessage(tab.id, { action: 'translate-selection' }).catch(() => {});
  } else if (command === 'speak') {
    chrome.tabs.sendMessage(tab.id, { action: 'speak-selection' }).catch(() => {});
  }
});

// ── 消息路由 ──
chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    const req = message as WorkerRequest;
    if (!req?.type) return false; // 不处理未知消息

    handleRequest(req)
      .then(sendResponse)
      .catch(err => {
        console.error('[SW] handler error:', err);
        sendResponse({ type: 'TRANSLATE_ERROR', text: '', error: err.message });
      });

    return true; // 异步响应
  }
);

async function handleRequest(req: WorkerRequest): Promise<unknown> {
  switch (req.type) {
    // ── 翻译 ──
    case 'TRANSLATE': {
      const from = req.sourceLang === 'auto' ? detectLang(req.text) : req.sourceLang;
      const to = req.targetLang || 'zh';

      try {
        const result = await translate(req.text, from, to, req.skipCache, req.sourceId);

        // 写入历史
        await addHistory({
          id: generateId(),
          word: req.text,
          translation: result,
          sourceUrl: req.sourceUrl ?? '',
          timestamp: Date.now(),
        });

        const resp: TranslateResponse = {
          type: 'TRANSLATE_RESULT',
          text: req.text,
          translation: result,
          from,
          to,
        };
        return resp;
      } catch (err) {
        const resp: TranslateErrorResponse = {
          type: 'TRANSLATE_ERROR',
          text: req.text,
          error: err instanceof Error ? err.message : '未知错误',
        };
        return resp;
      }
    }

    // ── 朗读 ──
    case 'SPEAK': {
      const success = await speak(req.text, req.lang);
      return { type: 'SPEAK_RESULT', success };
    }

    // ── 收藏 ──
    case 'TOGGLE_FAVORITE': {
      const existing = await isFavorite(req.word);
      if (existing) {
        await removeFavorite(existing.id);
        return { type: 'FAVORITE_RESULT', added: false, word: null };
      } else {
        const word = {
          id: generateId(),
          word: req.word,
          translation: req.translation,
          context: req.context,
          sourceUrl: req.sourceUrl,
          createdAt: Date.now(),
          reviewCount: 0,
          lastReviewedAt: 0,
          nextReviewAt: 0,
          easeFactor: 2.5,
          reviewHistory: [],
          learned: false,
          starred: false,
          note: '',
        };
        await addFavorite(word);
        return { type: 'FAVORITE_RESULT', added: true, word };
      }
    }

    case 'REMOVE_FAVORITE': {
      await removeFavorite(req.id);
      return { type: 'FAVORITE_RESULT', added: false, word: null };
    }

    // ── 查询 ──
    case 'GET_HISTORY': {
      const entries = await getHistory();
      return { type: 'HISTORY_RESULT', entries };
    }

    case 'GET_FAVORITES': {
      const words = await getFavorites();
      return { type: 'FAVORITES_RESULT', words };
    }

    case 'GET_SETTINGS': {
      const settings = await getSettings();
      return { type: 'SETTINGS_RESULT', ...settings };
    }

    case 'GET_SOURCES': {
      const sources = await getEnabledSources();
      return { type: 'SOURCES_RESULT', sources };
    }

    case 'ANALYZE_GRAMMAR': {
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

    case 'SHOW_SIDEBAR': {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'show-sidebar', word: req.word, translation: req.translation }).catch(() => {});
      }
      return { type: 'SPEAK_RESULT', success: true }; // 复用简单应答
    }

    case 'SAVE_SETTINGS': {
      await saveSettings(req.translators, req.preferences);
      return { type: 'SETTINGS_RESULT', translators: req.translators, preferences: req.preferences };
    }

    case 'SUBMIT_REVIEW': {
      const favorites = await getFavorites();
      const word = favorites.find(f => f.id === req.wordId);
      if (!word) return { type: 'REVIEW_RESULT', word: null as any };

      const patch = sm2(word, req.quality);

      // Compute interval in days for history record
      const intervalDays = Math.round((patch.nextReviewAt - patch.lastReviewedAt) / 86400000);

      // Append to review history (max 30 entries)
      const history = word.reviewHistory ?? [];
      history.push({
        timestamp: Date.now(),
        quality: req.quality,
        interval: intervalDays,
      });
      if (history.length > 30) history.splice(0, history.length - 30);

      // Mark learned on first successful graduation (Good or Easy)
      const grade = normalizeQuality(req.quality);
      const learned = word.learned || (grade >= 3 && patch.reviewCount >= 1);

      const updated = await updateFavorite(req.wordId, {
        ...patch,
        reviewHistory: history,
        learned,
      });
      return { type: 'REVIEW_RESULT', word: updated! };
    }

    case 'GET_DUE_WORDS': {
      const due = await getDueWords();
      return { type: 'DUE_WORDS_RESULT', words: due };
    }

    case 'GET_LEARN_STATS': {
      const all = await getFavorites();
      const now = Date.now();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayTs = todayStart.getTime();

      const total = all.length;
      const due = all.filter(f => f.nextReviewAt === 0 || f.nextReviewAt <= now).length;
      const reviewedToday = all.filter(f => f.lastReviewedAt >= todayTs).length;
      const mastered = all.filter(f => f.reviewCount >= 3 && f.easeFactor >= 2.0).length;

      // streak: 简单按连续有复习的天数算
      let streak = 0;
      const dayMs = 86400000;
      let checkDay = todayTs;
      while (true) {
        const hasReview = all.some(f =>
          f.lastReviewedAt >= checkDay && f.lastReviewedAt < checkDay + dayMs
        );
        if (!hasReview) break;
        streak++;
        checkDay -= dayMs;
      }

      return { type: 'LEARN_STATS_RESULT', total, due, reviewedToday, streak, mastered };
    }

    case 'GET_WORD_HISTORY': {
      const favorites = await getFavorites();
      const word = favorites.find(f => f.id === req.wordId);
      return {
        type: 'WORD_HISTORY_RESULT',
        wordId: req.wordId,
        history: word?.reviewHistory ?? [],
      };
    }

    case 'GET_FORECAST': {
      const favorites = await getFavorites();
      const now = Date.now();
      const forecast: Array<{ date: string; count: number }> = [];
      for (let i = 1; i <= req.days; i++) {
        const dayStart = now + i * 86400000;
        const dayEnd = dayStart + 86400000;
        const count = favorites.filter(f =>
          f.nextReviewAt > 0 && f.nextReviewAt >= dayStart && f.nextReviewAt < dayEnd
        ).length;
        forecast.push({ date: new Date(dayStart).toISOString().slice(0, 10), count });
      }
      return { type: 'FORECAST_RESULT', days: forecast };
    }

    case 'GET_FULL_STATS': {
      const all = await getFavorites();
      const now = Date.now();
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayTs = todayStart.getTime();

      const total = all.length;
      const learning = all.filter(f => f.reviewCount > 0 && !(f.reviewCount >= 3 && f.easeFactor >= 2.0)).length;
      const mastered = all.filter(f => f.reviewCount >= 3 && f.easeFactor >= 2.0).length;
      const reviewedToday = all.filter(f => f.lastReviewedAt >= todayTs).length;

      let streak = 0;
      const dayMs = 86400000;
      let checkDay = todayTs;
      while (true) {
        const hasReview = all.some(f =>
          f.lastReviewedAt >= checkDay && f.lastReviewedAt < checkDay + dayMs
        );
        if (!hasReview) break;
        streak++;
        checkDay -= dayMs;
      }

      // calendar: last 119 days (17 weeks)
      const calendar: Array<{ date: string; count: number }> = [];
      for (let i = 118; i >= 0; i--) {
        const dayStart = todayTs - i * dayMs;
        const dayEnd = dayStart + dayMs;
        const count = all.filter(f =>
          f.lastReviewedAt >= dayStart && f.lastReviewedAt < dayEnd
        ).length;
        calendar.push({ date: new Date(dayStart).toISOString().slice(0, 10), count });
      }

      // forecast: next 7 days
      const forecast: Array<{ date: string; count: number }> = [];
      for (let i = 1; i <= 7; i++) {
        const dayStart = now + i * dayMs;
        const dayEnd = dayStart + dayMs;
        const count = all.filter(f =>
          f.nextReviewAt > 0 && f.nextReviewAt >= dayStart && f.nextReviewAt < dayEnd
        ).length;
        forecast.push({ date: new Date(dayStart).toISOString().slice(0, 10), count });
      }

      const goalData = await chrome.storage.sync.get(['dailyGoal']);
      const dailyGoal: number = (goalData as any)?.dailyGoal || 10;

      return {
        type: 'FULL_STATS_RESULT',
        total, learning, mastered, streak, reviewedToday, dailyGoal,
        calendar, forecast,
      };
    }

    case 'SAVE_VOCAB_SETTINGS': {
      await saveVocabSettings(req.settings);
      return { type: 'VOCAB_SETTINGS_RESULT', settings: req.settings };
    }

    case 'STAR_WORD': {
      await updateFavorite(req.wordId, { starred: req.starred });
      return { type: 'STAR_RESULT', wordId: req.wordId, starred: req.starred };
    }

    case 'UPDATE_NOTE': {
      await updateFavorite(req.wordId, { note: req.note });
      return { type: 'NOTE_RESULT', wordId: req.wordId, note: req.note };
    }

    case 'UPDATE_EXAMPLES': {
      const favs = await getFavorites();
      const word = favs.find(f => f.id === req.wordId);
      if (!word) return { type: 'EXAMPLES_RESULT', wordId: req.wordId };
      const updatedTranslation = {
        ...word.translation,
        examples: req.examples,
      };
      await updateFavorite(req.wordId, {
        context: req.context,
        translation: updatedTranslation,
      });
      return { type: 'EXAMPLES_RESULT', wordId: req.wordId };
    }

    default:
      return { type: 'TRANSLATE_ERROR', text: '', error: '未知请求类型' };
  }
}
