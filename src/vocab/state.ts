import type { FavoriteWord, VocabSettings } from '../shared/types';
import type { FullStatsResponse } from '../shared/messages';

export interface AppState {
  panel: 'learn' | 'browse' | 'stats';
  words: FavoriteWord[];
  dueWords: FavoriteWord[];
  settings: VocabSettings;
  fullStats: FullStatsResponse | null;
  listeners: Set<() => void>;
  /** 当天已进入 step2（点过「认识」）的新词 id —— 重开页面不重复出现 */
  learnStep2Today: Set<string>;
}

const state: AppState = {
  panel: 'learn',
  words: [],
  dueWords: [],
  settings: {
    cardFront: ['word', 'phonetic'],
    cardBack: ['meaning', 'pos', 'examples', 'context'],
    cardLayout: 'minimal',
    dailyNewLimit: 10,
    dailyReviewLimit: 50,
    reviewReminder: true,
    goalCelebration: false,
  },
  fullStats: null,
  listeners: new Set(),
  learnStep2Today: new Set(),
};

export function getState(): AppState { return state; }

export function subscribe(fn: () => void): () => void {
  state.listeners.add(fn);
  return () => state.listeners.delete(fn);
}

function notify(): void { state.listeners.forEach(fn => fn()); }

export function setPanel(panel: AppState['panel']): void {
  state.panel = panel;
  notify();
}

export async function loadWords(): Promise<void> {
  try {
    const [favResp, dueResp] = await Promise.all([
      chrome.runtime.sendMessage({ type: 'GET_FAVORITES' }),
      chrome.runtime.sendMessage({ type: 'GET_DUE_WORDS' }),
    ]);
    state.words = (favResp?.words ?? []) as FavoriteWord[];
    state.dueWords = (dueResp?.words ?? []) as FavoriteWord[];
  } catch { state.words = []; state.dueWords = []; }
  notify();
}

export async function loadSettings(): Promise<void> {
  try {
    const syncData = await chrome.storage.sync.get(['vocabSettings', 'dailyGoal']);
    state.settings = {
      cardFront: ['word', 'phonetic'],
      cardBack: ['meaning', 'pos', 'examples', 'context'],
      cardLayout: 'minimal',
      dailyNewLimit: 10,
      dailyReviewLimit: 50,
      reviewReminder: true,
      goalCelebration: false,
      ...((syncData as any)?.vocabSettings ?? {}),
    };
  } catch { /* use defaults */ }
  notify();
}

export async function loadFullStats(): Promise<void> {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_FULL_STATS' });
    if (resp?.type === 'FULL_STATS_RESULT') {
      state.fullStats = resp as FullStatsResponse;
    }
  } catch { /* */ }
  notify();
}

export async function saveSettings(settings: VocabSettings): Promise<void> {
  state.settings = settings;
  await chrome.runtime.sendMessage({ type: 'SAVE_VOCAB_SETTINGS', settings });
  notify();
}

// ═══════════════════════════════════════════════
//  当日学习会话（跨页面重开时防重复）
// ═══════════════════════════════════════════════

const SESSION_KEY = 'learnSession';

export interface LearnSession {
  date: string;        // 本地日期 YYYY-MM-DD
  step2Ids: string[];  // 当天已进入 step2（点过「认识」）的新词 id
}

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 读取当日学习会话（跨天自动重置），并填充到 state */
export async function loadLearnSession(): Promise<LearnSession> {
  let s: LearnSession = { date: todayKey(), step2Ids: [] };
  try {
    const data = await chrome.storage.local.get(SESSION_KEY);
    const stored = (data as any)?.[SESSION_KEY] as LearnSession | undefined;
    if (stored && stored.date === todayKey() && Array.isArray(stored.step2Ids)) {
      s = stored;
    }
  } catch { /* 使用空会话 */ }
  state.learnStep2Today = new Set(s.step2Ids);
  return s;
}

/** 记录某新词当天已进入 step2（点过「认识」） */
export async function markLearnStep2(wordId: string): Promise<void> {
  if (state.learnStep2Today.has(wordId)) return;
  state.learnStep2Today.add(wordId);
  try {
    const s = await loadLearnSession();
    s.step2Ids.push(wordId);
    await chrome.storage.local.set({ [SESSION_KEY]: s });
  } catch { /* 尽力而为 */ }
}

/** 该新词今天是否已进入 step2 */
export function isLearnStep2Today(wordId: string): boolean {
  return state.learnStep2Today.has(wordId);
}
