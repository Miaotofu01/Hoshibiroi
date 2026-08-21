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
  lemma?: string;    // 词条原形（小写），如 dogs→dog, running→run；仅 LLM 源返回

  // ── 知识增强字段（仅 LLM 类翻译源返回，其他源缺省；UI 无值则不显示）──
  inflections?: string[];        // 词形变化，如 ["复数 dogs", "过去式 walked"]
  synonyms?: string[];           // 同义词
  antonyms?: string[];           // 反义词
  collocations?: Array<{ pattern: string; meaning: string }>; // 常用搭配
  wordRoot?: string;             // 词根词缀
  register?: string;             // 语域：正式/口语/俚语/书面等
  usageNote?: string;            // 易混词辨析/用法说明
  memoryTip?: string;            // 记忆技巧
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
  easeFactor: number;    // 历史遗留命名，实际存 FSRS 的 Stability(S)
  difficulty?: number;   // FSRS-5 难度 D（1-10），旧数据缺省按 5.0 处理
  lemma?: string;        // 词条原形（小写）；收藏去重/合并的匹配基准
  forms?: string[];      // 收录过的其他词形（大小写/时态变体），仅用于展示
  reviewHistory: ReviewRecord[];  // 复习记录，最多 30 条
  learned: boolean;               // 是否已掌握（首次毕业）
  starred: boolean;               // 是否星标
  note: string;                   // 用户备注
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
