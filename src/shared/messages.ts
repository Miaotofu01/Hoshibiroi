import type { TranslationResult, FavoriteWord, HistoryEntry, TranslatorConfig, Preferences } from './types';

// ── 请求类型 ──

export interface TranslateRequest {
  type: 'TRANSLATE';
  text: string;
  sourceLang: string;
  targetLang: string;
  sourceUrl?: string;
  skipCache?: boolean;
}

export interface SpeakRequest {
  type: 'SPEAK';
  text: string;
  lang: string;
}

export interface ToggleFavoriteRequest {
  type: 'TOGGLE_FAVORITE';
  word: string;
  translation: TranslationResult;
  context?: string;
  sourceUrl: string;
}

export interface RemoveFavoriteRequest {
  type: 'REMOVE_FAVORITE';
  id: string;
}

export interface GetHistoryRequest {
  type: 'GET_HISTORY';
}

export interface GetFavoritesRequest {
  type: 'GET_FAVORITES';
}

export interface GetSettingsRequest {
  type: 'GET_SETTINGS';
}

export interface SaveSettingsRequest {
  type: 'SAVE_SETTINGS';
  translators: TranslatorConfig[];
  preferences: Preferences;
}

export type WorkerRequest =
  | TranslateRequest
  | SpeakRequest
  | ToggleFavoriteRequest
  | RemoveFavoriteRequest
  | GetHistoryRequest
  | GetFavoritesRequest
  | GetSettingsRequest
  | SaveSettingsRequest;

// ── 响应类型 ──

export interface TranslateResponse {
  type: 'TRANSLATE_RESULT';
  text: string;
  translation: TranslationResult;
}

export interface TranslateErrorResponse {
  type: 'TRANSLATE_ERROR';
  text: string;
  error: string;
}

export interface SpeakResponse {
  type: 'SPEAK_RESULT';
  success: boolean;
}

export interface ToggleFavoriteResponse {
  type: 'FAVORITE_RESULT';
  added: boolean;
  word: FavoriteWord | null;
}

export interface HistoryResponse {
  type: 'HISTORY_RESULT';
  entries: HistoryEntry[];
}

export interface FavoritesResponse {
  type: 'FAVORITES_RESULT';
  words: FavoriteWord[];
}

export interface SettingsResponse {
  type: 'SETTINGS_RESULT';
  translators: TranslatorConfig[];
  preferences: Preferences;
}

export type WorkerResponse =
  | TranslateResponse
  | TranslateErrorResponse
  | SpeakResponse
  | ToggleFavoriteResponse
  | HistoryResponse
  | FavoritesResponse
  | SettingsResponse;

// ── 类型守卫 ──

const RESPONSE_TYPES: WorkerResponse['type'][] = [
  'TRANSLATE_RESULT', 'TRANSLATE_ERROR', 'SPEAK_RESULT',
  'FAVORITE_RESULT', 'HISTORY_RESULT', 'FAVORITES_RESULT', 'SETTINGS_RESULT',
];

export function isWorkerResponse(msg: unknown): msg is WorkerResponse {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    'type' in msg &&
    RESPONSE_TYPES.includes((msg as WorkerResponse).type)
  );
}

// ── 工厂函数 ──

export function translateRequest(text: string, from: string, to: string, sourceUrl?: string, skipCache?: boolean): TranslateRequest {
  return { type: 'TRANSLATE', text, sourceLang: from, targetLang: to, sourceUrl, skipCache };
}

export function speakRequest(text: string, lang: string): SpeakRequest {
  return { type: 'SPEAK', text, lang };
}

export function toggleFavoriteRequest(
  word: string, translation: TranslationResult, sourceUrl: string, context?: string
): ToggleFavoriteRequest {
  return { type: 'TOGGLE_FAVORITE', word, translation, sourceUrl, context };
}
