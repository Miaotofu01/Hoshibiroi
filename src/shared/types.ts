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
  sourceId?: string; // 产出该结果的翻译源 id, e.g. "deepseek"（用于侧栏高亮当前源）
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
  nextReviewAt: number;
  easeFactor: number;    // SM-2 ease factor, default 2.5
  reviewHistory: ReviewRecord[];  // 复习记录，最多 30 条
  learned: boolean;               // 是否已掌握（首次毕业）
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

// 语法分析结果（DeepSeek 句子拆解）
export interface GrammarAnalysis {
  structure: string;         // 句型概述，如 "主谓宾结构，包含一个定语从句"
  tokens: Array<{
    word: string;
    pos: string;             // 词性：noun/verb/adj/adv/prep/...
    lemma?: string;          // 原形
    role: string;            // 句子成分：主语/谓语/宾语/定语/状语...
  }>;
  grammarPoints: string[];   // 关键语法点
}

// 复习记录
export interface ReviewRecord {
  timestamp: number;   // 复习时间
  quality: number;     // 1/3/5 (不认识/模糊/认识)
  interval: number;    // 本次复习后安排的间隔(天)
}

// 生词本设置
export interface VocabSettings {
  cardFront: ('word' | 'phonetic' | 'context')[];
  cardBack: ('meaning' | 'pos' | 'examples' | 'context' | 'source')[];
  cardLayout: 'minimal' | 'context-first';
  dailyNewLimit: number;
  dailyReviewLimit: number;  // 0 = unlimited
  reviewReminder: boolean;
  goalCelebration: boolean;
}

// UI 偏好
export interface Preferences {
  theme: string;           // "tokyo-night" | future themes
  fontSize: 'small' | 'medium' | 'large';
  targetLang: Language;
  sourceLang: Language;
}
