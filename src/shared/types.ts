// 语言代码
export type Language = 'auto' | 'zh' | 'en' | 'ja' | 'ko' | 'fr' | 'de' | 'es';

// 翻译结果
export interface TranslationResult {
  text: string;
  phonetic?: string;
  partsOfSpeech?: Array<{
    type: string;    // "n.", "v.", "adj." etc
    meanings: string[];
  }>;
  examples?: Array<{
    original: string;
    translated: string;
  }>;
  source: string;   // 翻译源名称, e.g. "DeepSeek", "Google Translate"
}

// 翻译源配置 (用户可自定义)
export interface TranslatorConfig {
  id: string;            // "google" | "tencent" | "baidu" | "deepseek" | "deepl"
  name: string;          // 显示名称
  enabled: boolean;
  priority: number;      // 数字越小优先级越高
  apiKey?: string;
}

// 收藏词汇
export interface FavoriteWord {
  id: string;
  word: string;
  translation: TranslationResult;
  context?: string;      // 选中时的上下文句子
  sourceUrl: string;     // 来源页面 URL
  createdAt: number;
  reviewCount: number;
  lastReviewedAt: number;
  nextReviewAt: number;  // SRS 预留
}

// 翻译历史
export interface HistoryEntry {
  id: string;
  word: string;
  translation: TranslationResult;
  sourceUrl: string;
  timestamp: number;
}

// 缓存条目
export interface CacheEntry {
  result: TranslationResult;
  timestamp: number;
}

// UI 偏好
export interface Preferences {
  theme: string;           // "tokyo-night" | future themes
  fontSize: 'small' | 'medium' | 'large';
  targetLang: Language;
  sourceLang: Language;
}
