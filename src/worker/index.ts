import type { WorkerRequest } from '../shared/messages';
import { testTranslator } from './translator';
import { cleanExpiredCache } from './cache';
import { handleTranslate } from './handlers/translate';
import { handleSpeak, handleAnalyzeGrammar } from './handlers/sidebar';
import { handleToggleFavorite, handleRemoveFavorite, handleGetFavorites } from './handlers/favorites';
import { handleSubmitReview, handleGetDueWords, handleGetLearnStats, handleGetWordHistory } from './handlers/review';
import { handleGetSettings, handleSaveSettings, handleGetSources, handleSaveVocabSettings } from './handlers/settings';
import { handleGetForecast } from './handlers/stats';
import {
  getHistory,
  getFavorites, addFavorite, findFavoriteByKey, favoriteKey,
  updateFavorite, getDueWords, dedupeFavorites,
} from './storage';

// ── 定期清理过期缓存 ──
// MV3 SW 空闲约 30s 即被终止，setInterval 在睡眠期间不触发；清理并入 alarm 唤醒时执行
cleanExpiredCache();

// ── 存量词形归并迁移（大小写/时态重复词条合并，幂等）──
void dedupeFavorites().then(n => {
  if (n > 0) console.warn(`[SW] 词形归并迁移：合并删除了 ${n} 条重复词条`);
}).catch(() => {});

// ── SRS 复习提醒 ──
chrome.alarms.create('srs-check', { periodInMinutes: 60 }).catch(() => {});
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'srs-check') return;
  cleanExpiredCache(); // 每小时随提醒一起清一次缓存
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

// 点击复习提醒通知 → 直达复习页
chrome.notifications.onClicked.addListener((id) => {
  if (id !== 'srs-reminder') return;
  chrome.tabs.create({ url: chrome.runtime.getURL('src/vocab/index.html#/learn') }).catch(() => {});
});

// ── ID 生成 ──
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

// ── 键盘快捷键 ──
// 快捷键在未注入 content script 的页面（chrome://、商店页等）会静默失败 → 给一条通知反馈
function notifyShortcutUnavailable(action: string): void {
  chrome.notifications.create('shortcut-unavailable', {
    type: 'basic',
    iconUrl: 'icons/icon-48.png',
    title: '划词翻译',
    message: `快捷键「${action}」不可用：当前页面不支持划词`,
    priority: 0,
  }).catch(() => {});
}

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  if (command === 'translate') {
    chrome.tabs.sendMessage(tab.id, { action: 'translate-selection' }).catch(() => notifyShortcutUnavailable('翻译'));
  } else if (command === 'speak') {
    chrome.tabs.sendMessage(tab.id, { action: 'speak-selection' }).catch(() => notifyShortcutUnavailable('朗读'));
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
        // 非翻译请求失败也按原类型回包会让调用方误判（如 GET_SETTINGS 失败 → popup 误显"未配置翻译源"横幅），
        // 统一回 WORKER_ERROR，调用方按查询失败处理
        sendResponse({
          type: 'WORKER_ERROR',
          requestType: req.type,
          error: err instanceof Error ? err.message : String(err),
        });
      });

    return true; // 异步响应
  }
);

async function handleRequest(req: WorkerRequest): Promise<unknown> {
  switch (req.type) {
    // ── 翻译（含写历史，见 handlers/translate.ts）──
    case 'TRANSLATE': {
      return handleTranslate(req);
    }

    // ── 朗读（lang='auto' 时按文本内容检测，见 handlers/sidebar.ts）──
    case 'SPEAK': {
      return handleSpeak(req);
    }

    // ── 收藏 ──
    case 'TOGGLE_FAVORITE': {
      return handleToggleFavorite(req);
    }

    case 'REMOVE_FAVORITE': {
      return handleRemoveFavorite(req);
    }

    // ── 查询 ──
    case 'GET_HISTORY': {
      const entries = await getHistory();
      return { type: 'HISTORY_RESULT', entries };
    }

    case 'GET_FAVORITES': {
      return handleGetFavorites();
    }

    case 'CHECK_FAVORITE': {
      const existing = await findFavoriteByKey(favoriteKey(req.word, req.lemma));
      return { type: 'FAVORITE_CHECK_RESULT', word: req.word, favorited: !!existing };
    }

    case 'OPEN_OPTIONS': {
      try {
        await chrome.runtime.openOptionsPage();
        return { type: 'OPEN_OPTIONS_RESULT', ok: true };
      } catch {
        return { type: 'OPEN_OPTIONS_RESULT', ok: false };
      }
    }

    case 'GET_SETTINGS': {
      return handleGetSettings(req);
    }

    case 'GET_SOURCES': {
      return handleGetSources(req);
    }

    case 'ANALYZE_GRAMMAR': {
      return handleAnalyzeGrammar(req);
    }

    case 'SAVE_SETTINGS': {
      return handleSaveSettings(req);
    }

    case 'TEST_TRANSLATOR': {
      return testTranslator(req.translatorId, req.apiKey);
    }

    // ── 批量导入（按匹配 key 去重：大小写/词形不敏感，已存在的跳过、保留本机进度）──
    case 'IMPORT_WORDS': {
      const favorites = await getFavorites();
      const existing = new Set(favorites.map(f => favoriteKey(f.word, f.lemma)));
      const now = Date.now();
      const fresh: import('../shared/types').FavoriteWord[] = [];
      for (const w of req.words) {
        const word = w?.word?.trim();
        const lemma = w?.lemma ? String(w.lemma).toLowerCase() : undefined;
        const key = favoriteKey(word, lemma);
        if (!word || existing.has(key)) continue;
        existing.add(key);
        // 词头用原形；导入词形与原形不同时记入 forms
        let forms = w.forms ?? [];
        if (lemma && word.toLowerCase() !== lemma && !forms.some(f => f.toLowerCase() === word.toLowerCase())) {
          forms = [...forms, word];
        }
        fresh.push({
          id: generateId(),
          word: lemma ?? word,
          lemma,
          forms,
          translation: {
            text: w.translation?.text ?? word,
            phonetic: w.translation?.phonetic ?? '',
            partsOfSpeech: w.translation?.partsOfSpeech ?? undefined,
            examples: w.translation?.examples ?? undefined,
            source: w.translation?.source ?? '',
            sourceId: w.translation?.sourceId ?? undefined,
          },
          context: w.context ?? '',
          sourceUrl: w.sourceUrl ?? '',
          createdAt: typeof w.createdAt === 'number' ? w.createdAt : now,
          reviewCount: w.reviewCount ?? 0,
          lastReviewedAt: w.lastReviewedAt ?? 0,
          nextReviewAt: w.nextReviewAt ?? 0,
          easeFactor: w.easeFactor ?? 2.5,
          reviewHistory: w.reviewHistory ?? [],
          learned: w.learned ?? false,
          starred: w.starred ?? false,
          note: w.note ?? '',
        });
      }
      for (const f of fresh) await addFavorite(f);
      return { type: 'IMPORT_WORDS_RESULT', imported: fresh.length, skipped: req.words.length - fresh.length };
    }

    case 'SUBMIT_REVIEW': {
      // FSRS-5 全量调度（含难度 D 演化），见 handlers/review.ts
      return handleSubmitReview(req);
    }

    case 'GET_DUE_WORDS': {
      return handleGetDueWords(req);
    }

    case 'GET_LEARN_STATS': {
      return handleGetLearnStats(req);
    }

    case 'GET_WORD_HISTORY': {
      return handleGetWordHistory(req);
    }

    case 'GET_FORECAST': {
      return handleGetForecast(req);
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
      return handleSaveVocabSettings(req);
    }

    case 'STAR_WORD': {
      await updateFavorite(req.wordId, { starred: req.starred });
      return { type: 'STAR_RESULT', wordId: req.wordId, starred: req.starred };
    }

    case 'UPDATE_NOTE': {
      await updateFavorite(req.wordId, { note: req.note });
      return { type: 'NOTE_RESULT', wordId: req.wordId, note: req.note };
    }

    case 'UPDATE_NOTE_CARDS': {
      const favs = await getFavorites();
      const word = favs.find(f => f.id === req.wordId);
      if (!word) return { type: 'NOTE_CARDS_RESULT', wordId: req.wordId };
      const examples = req.cards.map(c => ({ original: c.title, translated: c.content }));
      const updatedTranslation = {
        ...word.translation,
        examples,
      };
      await updateFavorite(req.wordId, {
        context: req.context,
        translation: updatedTranslation,
      });
      return { type: 'NOTE_CARDS_RESULT', wordId: req.wordId };
    }

    default:
      return { type: 'TRANSLATE_ERROR', text: '', error: '未知请求类型' };
  }
}
