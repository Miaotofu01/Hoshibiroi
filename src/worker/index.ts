import type { WorkerRequest, TranslateResponse, TranslateErrorResponse } from '../shared/messages';
import { translate } from './translator';
import { speak } from './tts';
import {
  getHistory, addHistory,
  getFavorites, addFavorite, removeFavorite, isFavorite,
  getSettings, saveSettings,
} from './storage';
import { cleanExpiredCache } from './cache';

// ── 定期清理过期缓存 ──
// SW 启动时清理一次，之后每 6 小时清理一次
cleanExpiredCache();
setInterval(cleanExpiredCache, 6 * 60 * 60 * 1000);

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
        const result = await translate(req.text, from, to, req.skipCache);

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

    case 'SAVE_SETTINGS': {
      await saveSettings(req.translators, req.preferences);
      return { type: 'SETTINGS_RESULT', translators: req.translators, preferences: req.preferences };
    }

    default:
      return { type: 'TRANSLATE_ERROR', text: '', error: '未知请求类型' };
  }
}
