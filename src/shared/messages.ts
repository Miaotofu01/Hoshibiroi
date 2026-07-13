import type { TranslationResult, FavoriteWord, HistoryEntry, TranslatorConfig, Preferences, GrammarAnalysis, ReviewRecord, VocabSettings } from './types';

// ── 请求类型 ──

export interface TranslateRequest {
  type: 'TRANSLATE';
  text: string;
  sourceLang: string;
  targetLang: string;
  sourceUrl?: string;
  skipCache?: boolean;
  sourceId?: string;   // 指定翻译源 id；不传则按优先级自动挑
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

export interface GetSourcesRequest {
  type: 'GET_SOURCES';
}

export interface AnalyzeGrammarRequest {
  type: 'ANALYZE_GRAMMAR';
  text: string;
  lang: string;
  detail: 'brief' | 'full';
}

export interface ShowSidebarRequest {
  type: 'SHOW_SIDEBAR';
  word: string;
  translation: TranslationResult;
}

export interface SaveSettingsRequest {
  type: 'SAVE_SETTINGS';
  translators: TranslatorConfig[];
  preferences: Preferences;
}

export interface SubmitReviewRequest {
  type: 'SUBMIT_REVIEW';
  wordId: string;
  quality: number;
}

export interface GetDueWordsRequest {
  type: 'GET_DUE_WORDS';
}

export interface GetLearnStatsRequest {
  type: 'GET_LEARN_STATS';
}

export interface GetWordHistoryRequest {
  type: 'GET_WORD_HISTORY';
  wordId: string;
}

export interface GetForecastRequest {
  type: 'GET_FORECAST';
  days: number;
}

export interface GetFullStatsRequest {
  type: 'GET_FULL_STATS';
}

export interface SaveVocabSettingsRequest {
  type: 'SAVE_VOCAB_SETTINGS';
  settings: VocabSettings;
}

export type WorkerRequest =
  | TranslateRequest
  | SpeakRequest
  | ToggleFavoriteRequest
  | RemoveFavoriteRequest
  | GetHistoryRequest
  | GetFavoritesRequest
  | GetSettingsRequest
  | GetSourcesRequest
  | ShowSidebarRequest
  | AnalyzeGrammarRequest
  | SaveSettingsRequest
  | SubmitReviewRequest
  | GetDueWordsRequest
  | GetLearnStatsRequest
  | GetWordHistoryRequest
  | GetForecastRequest
  | GetFullStatsRequest
  | SaveVocabSettingsRequest;

// ── 响应类型 ──

export interface TranslateResponse {
  type: 'TRANSLATE_RESULT';
  text: string;
  translation: TranslationResult;
  from: string;   // 实际使用的源语言（auto 已解析）
  to: string;     // 目标语言
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

export interface SourcesResponse {
  type: 'SOURCES_RESULT';
  sources: Array<{ id: string; name: string }>;   // 仅已启用的源，按优先级排序
}

export interface GrammarResponse {
  type: 'GRAMMAR_RESULT';
  text: string;
  analysis: GrammarAnalysis;
}

export interface GrammarErrorResponse {
  type: 'GRAMMAR_ERROR';
  text: string;
  error: string;
}

export interface ReviewResponse {
  type: 'REVIEW_RESULT';
  word: FavoriteWord;
}

export interface DueWordsResponse {
  type: 'DUE_WORDS_RESULT';
  words: FavoriteWord[];
}

export interface LearnStatsResponse {
  type: 'LEARN_STATS_RESULT';
  total: number;
  due: number;
  reviewedToday: number;
  streak: number;
  mastered: number;
}

export interface WordHistoryResponse {
  type: 'WORD_HISTORY_RESULT';
  wordId: string;
  history: ReviewRecord[];
}

export interface ForecastResponse {
  type: 'FORECAST_RESULT';
  days: Array<{ date: string; count: number }>;
}

export interface FullStatsResponse {
  type: 'FULL_STATS_RESULT';
  total: number;
  learning: number;
  mastered: number;
  streak: number;
  reviewedToday: number;
  dailyGoal: number;
  calendar: Array<{ date: string; count: number }>;
  forecast: Array<{ date: string; count: number }>;
}

export interface VocabSettingsResponse {
  type: 'VOCAB_SETTINGS_RESULT';
  settings: VocabSettings;
}

export type WorkerResponse =
  | TranslateResponse
  | TranslateErrorResponse
  | SpeakResponse
  | ToggleFavoriteResponse
  | HistoryResponse
  | FavoritesResponse
  | SettingsResponse
  | SourcesResponse
  | GrammarResponse
  | GrammarErrorResponse
  | ReviewResponse
  | DueWordsResponse
  | LearnStatsResponse
  | WordHistoryResponse
  | ForecastResponse
  | FullStatsResponse
  | VocabSettingsResponse;

// ── 类型守卫 ──

const RESPONSE_TYPES: WorkerResponse['type'][] = [
  'TRANSLATE_RESULT', 'TRANSLATE_ERROR', 'SPEAK_RESULT',
  'FAVORITE_RESULT', 'HISTORY_RESULT', 'FAVORITES_RESULT', 'SETTINGS_RESULT',
  'SOURCES_RESULT',
  'GRAMMAR_RESULT', 'GRAMMAR_ERROR',
  'REVIEW_RESULT', 'DUE_WORDS_RESULT', 'LEARN_STATS_RESULT',
  'WORD_HISTORY_RESULT', 'FORECAST_RESULT', 'FULL_STATS_RESULT', 'VOCAB_SETTINGS_RESULT',
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

export function translateRequest(
  text: string, from: string, to: string, sourceUrl?: string, skipCache?: boolean, sourceId?: string
): TranslateRequest {
  return { type: 'TRANSLATE', text, sourceLang: from, targetLang: to, sourceUrl, skipCache, sourceId };
}

export function getSourcesRequest(): GetSourcesRequest {
  return { type: 'GET_SOURCES' };
}

export function showSidebarRequest(word: string, translation: TranslationResult): ShowSidebarRequest {
  return { type: 'SHOW_SIDEBAR', word, translation };
}

export function analyzeGrammarRequest(text: string, lang: string, detail: 'brief' | 'full' = 'brief'): AnalyzeGrammarRequest {
  return { type: 'ANALYZE_GRAMMAR', text, lang, detail };
}

export function speakRequest(text: string, lang: string): SpeakRequest {
  return { type: 'SPEAK', text, lang };
}

export function toggleFavoriteRequest(
  word: string, translation: TranslationResult, sourceUrl: string, context?: string
): ToggleFavoriteRequest {
  return { type: 'TOGGLE_FAVORITE', word, translation, sourceUrl, context };
}

export function submitReviewRequest(wordId: string, quality: number): SubmitReviewRequest {
  return { type: 'SUBMIT_REVIEW', wordId, quality };
}

export function getDueWordsRequest(): GetDueWordsRequest {
  return { type: 'GET_DUE_WORDS' };
}

export function getLearnStatsRequest(): GetLearnStatsRequest {
  return { type: 'GET_LEARN_STATS' };
}

export function getWordHistoryRequest(wordId: string): GetWordHistoryRequest {
  return { type: 'GET_WORD_HISTORY', wordId };
}

export function getForecastRequest(days: number): GetForecastRequest {
  return { type: 'GET_FORECAST', days };
}

export function getFullStatsRequest(): GetFullStatsRequest {
  return { type: 'GET_FULL_STATS' };
}

export function saveVocabSettingsRequest(settings: VocabSettings): SaveVocabSettingsRequest {
  return { type: 'SAVE_VOCAB_SETTINGS', settings };
}
