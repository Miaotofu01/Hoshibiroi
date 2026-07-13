import type { FavoriteWord, VocabSettings } from '../shared/types';
import type { FullStatsResponse } from '../shared/messages';

export interface AppState {
  panel: 'learn' | 'browse' | 'stats';
  words: FavoriteWord[];
  dueWords: FavoriteWord[];
  settings: VocabSettings;
  fullStats: FullStatsResponse | null;
  listeners: Set<() => void>;
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
