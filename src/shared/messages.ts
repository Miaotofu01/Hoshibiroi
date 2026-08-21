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
  lemma?: string;    // 词条原形（来自翻译源），用于词形归并
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

export interface CheckFavoriteRequest {
  type: 'CHECK_FAVORITE';
  word: string;
  lemma?: string;    // 词条原形，用于词形归并后的收藏态判断
}

/** content script 无法直接调 openOptionsPage，需经 worker 中转 */
export interface OpenOptionsRequest {
  type: 'OPEN_OPTIONS';
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

export interface SaveSettingsRequest {
  type: 'SAVE_SETTINGS';
  translators: TranslatorConfig[];
  preferences: Preferences;
}

export interface TestTranslatorRequest {
  type: 'TEST_TRANSLATOR';
  translatorId: string;
  apiKey?: string;
}

export interface ImportWordsRequest {
  type: 'IMPORT_WORDS';
  words: FavoriteWord[];
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

export interface StarWordRequest {
  type: 'STAR_WORD';
  wordId: string;
  starred: boolean;
}

export interface UpdateNoteRequest {
  type: 'UPDATE_NOTE';
  wordId: string;
  note: string;
}

export interface UpdateNoteCardsRequest {
  type: 'UPDATE_NOTE_CARDS';
  wordId: string;
  context?: string;
  cards: Array<{ title: string; content: string }>;
}

export type WorkerRequest =
  | TranslateRequest
  | SpeakRequest
  | ToggleFavoriteRequest
  | RemoveFavoriteRequest
  | GetHistoryRequest
  | GetFavoritesRequest
  | CheckFavoriteRequest
  | OpenOptionsRequest
  | GetSettingsRequest
  | GetSourcesRequest
  | AnalyzeGrammarRequest
  | SaveSettingsRequest
  | TestTranslatorRequest
  | ImportWordsRequest
  | SubmitReviewRequest
  | GetDueWordsRequest
  | GetLearnStatsRequest
  | GetWordHistoryRequest
  | GetForecastRequest
  | GetFullStatsRequest
  | SaveVocabSettingsRequest
  | StarWordRequest
  | UpdateNoteRequest
  | UpdateNoteCardsRequest;

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

/** 处理器兜底异常（非翻译类请求失败时返回，避免把一切错误伪装成 TRANSLATE_ERROR） */
export interface WorkerErrorResponse {
  type: 'WORKER_ERROR';
  requestType: string;
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
  merged?: boolean;  // true = 已并入已有词条（词形归并），非新建
}

export interface HistoryResponse {
  type: 'HISTORY_RESULT';
  entries: HistoryEntry[];
}

export interface FavoritesResponse {
  type: 'FAVORITES_RESULT';
  words: FavoriteWord[];
}

export interface CheckFavoriteResponse {
  type: 'FAVORITE_CHECK_RESULT';
  word: string;
  favorited: boolean;
}

export interface OpenOptionsResponse {
  type: 'OPEN_OPTIONS_RESULT';
  ok: boolean;
}

export interface SettingsResponse {
  type: 'SETTINGS_RESULT';
  translators: TranslatorConfig[];
  preferences: Preferences;
}

export interface TestTranslatorResponse {
  type: 'TEST_TRANSLATOR_RESULT';
  ok: boolean;
  message: string;
}

export interface ImportWordsResponse {
  type: 'IMPORT_WORDS_RESULT';
  imported: number;
  skipped: number;
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

export interface StarWordResponse {
  type: 'STAR_RESULT';
  wordId: string;
  starred: boolean;
}

export interface UpdateNoteResponse {
  type: 'NOTE_RESULT';
  wordId: string;
  note: string;
}

export interface UpdateNoteCardsResponse {
  type: 'NOTE_CARDS_RESULT';
  wordId: string;
}

export type WorkerResponse =
  | TranslateResponse
  | TranslateErrorResponse
  | WorkerErrorResponse
  | SpeakResponse
  | ToggleFavoriteResponse
  | HistoryResponse
  | FavoritesResponse
  | CheckFavoriteResponse
  | OpenOptionsResponse
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
  | VocabSettingsResponse
  | StarWordResponse
  | UpdateNoteResponse
  | UpdateNoteCardsResponse
  | TestTranslatorResponse
  | ImportWordsResponse;

// ── 类型守卫 ──

const RESPONSE_TYPES: WorkerResponse['type'][] = [
  'TRANSLATE_RESULT', 'TRANSLATE_ERROR', 'WORKER_ERROR', 'SPEAK_RESULT',
  'FAVORITE_RESULT', 'HISTORY_RESULT', 'FAVORITES_RESULT', 'FAVORITE_CHECK_RESULT', 'OPEN_OPTIONS_RESULT', 'SETTINGS_RESULT',
  'SOURCES_RESULT',
  'GRAMMAR_RESULT', 'GRAMMAR_ERROR',
  'REVIEW_RESULT', 'DUE_WORDS_RESULT', 'LEARN_STATS_RESULT',
  'WORD_HISTORY_RESULT', 'FORECAST_RESULT', 'FULL_STATS_RESULT', 'VOCAB_SETTINGS_RESULT',
  'STAR_RESULT', 'NOTE_RESULT', 'NOTE_CARDS_RESULT', 'TEST_TRANSLATOR_RESULT',
  'IMPORT_WORDS_RESULT',
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

export function analyzeGrammarRequest(text: string, lang: string, detail: 'brief' | 'full' = 'brief'): AnalyzeGrammarRequest {
  return { type: 'ANALYZE_GRAMMAR', text, lang, detail };
}

export function speakRequest(text: string, lang: string): SpeakRequest {
  return { type: 'SPEAK', text, lang };
}

export function toggleFavoriteRequest(
  word: string, translation: TranslationResult, sourceUrl: string, context?: string
): ToggleFavoriteRequest {
  return { type: 'TOGGLE_FAVORITE', word, translation, sourceUrl, context, lemma: translation.lemma };
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
