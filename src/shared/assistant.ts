import type { AssistantSettings, AssistantThinking, PageContext } from './types';

/** 对话消息（system 前缀必须逐字节稳定才能命中 DeepSeek 前缀缓存） */
export interface ApiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** 送给 API 的消息总量硬上限（字符），异常输入直接拒绝 */
export const API_MESSAGE_MAX_CHARS = 200_000;

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  contextChars: 8000,
  thinking: 'off',
  includeSelection: true,
  maxAnswerTokens: 1200,
  instructions: '',
};

/** 上下文长度档位（字符）；0 = 只带选中范围 */
export const CONTEXT_STEPS: number[] = [0, 1000, 2000, 4000, 8000, 16000, 32000];

/** 思考深度档位（与 DeepSeek reasoning_effort 对齐） */
export const THINKING_LEVELS: Array<{ id: AssistantThinking; label: string }> = [
  { id: 'off', label: '关闭' },
  { id: 'low', label: '低' },
  { id: 'high', label: '高' },
  { id: 'max', label: '最大' },
];

const MAX_INSTRUCTIONS = 2000;
const MAX_ANSWER_TOKENS = 8000;

export function normalizeAssistantSettings(raw: unknown): AssistantSettings {
  const o = (raw ?? {}) as Partial<AssistantSettings>;
  const chars = Number(o.contextChars);
  const maxTokens = Number(o.maxAnswerTokens);
  const thinking = THINKING_LEVELS.some(l => l.id === o.thinking)
    ? o.thinking as AssistantThinking
    : DEFAULT_ASSISTANT_SETTINGS.thinking;
  return {
    contextChars: CONTEXT_STEPS.includes(chars) ? chars : DEFAULT_ASSISTANT_SETTINGS.contextChars,
    thinking,
    includeSelection: o.includeSelection !== false,
    maxAnswerTokens: Number.isFinite(maxTokens) && maxTokens >= 200 && maxTokens <= MAX_ANSWER_TOKENS
      ? Math.round(maxTokens)
      : DEFAULT_ASSISTANT_SETTINGS.maxAnswerTokens,
    instructions: typeof o.instructions === 'string' ? o.instructions.slice(0, MAX_INSTRUCTIONS) : '',
  };
}

/** 粗略 token 估算：CJK 约 1 字 1 token，其余约 4 字符 1 token */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjk = (text.match(/[\u3400-\u9FFF\u3040-\u30FF\uAC00-\uD7AF]/g) ?? []).length;
  return cjk + Math.ceil((text.length - cjk) / 4);
}

/**
 * 围绕 anchor 取窗口（行边界对齐）。anchor 找不到时从开头取。
 * 返回前后各省略了多少字符，用于在提示词里如实标注「已截取」。
 */
export function truncateAround(
  text: string, anchor: string, maxChars: number
): { text: string; omittedHead: number; omittedTail: number } {
  if (maxChars <= 0 || !text) return { text: '', omittedHead: 0, omittedTail: text.length };
  if (text.length <= maxChars) return { text, omittedHead: 0, omittedTail: 0 };

  const probe = (anchor ?? '').trim().slice(0, 60);
  const at = probe ? text.indexOf(probe) : -1;
  let from = at < 0 ? 0 : Math.max(0, at - Math.floor(maxChars / 3));
  from = Math.min(from, Math.max(0, text.length - maxChars));
  // 向前对齐到行首
  if (from > 0) {
    const nl = text.lastIndexOf('\n', from);
    from = nl === -1 ? from : nl + 1;
  }
  let to = from + maxChars;
  // 向后对齐到行尾（最多多出一行）
  if (to < text.length) {
    const nl = text.indexOf('\n', to);
    to = nl === -1 ? text.length : nl;
  }
  // from 已后移到行首，to 可能越过文本末尾，必须夹住，否则省略量为负
  to = Math.min(text.length, to);
  return { text: text.slice(from, to), omittedHead: from, omittedTail: text.length - to };
}

function excerptLabel(page: PageContext): string {
  if (!page.text) return '（未提供页面正文）';
  const head = page.totalChars - page.text.length;
  const parts = [`共 ${page.totalChars} 字`];
  if (head > 0) parts.push(`已省略其余约 ${head} 字，仅给出与选中内容相关的片段`);
  return parts.join('，');
}

/** 系统提示词：页面上下文 + 行为约束。会话内必须保持逐字节稳定（前缀缓存） */
export function buildSystemPrompt(opts: { page: PageContext; instructions?: string }): string {
  const { page, instructions } = opts;
  const lines = [
    '你是一个网页阅读助手。用户正在阅读一个网页，会就页面内容向你提问。',
    '请遵守：',
    '1. 优先依据下面给出的页面内容回答；页面里没有的信息，先用一句话说明「页面里没有提到」，再用你自己的知识补充，并把补充部分标注为「（页面外知识）」。',
    '2. 用简体中文回答，直接、简洁；需要分点时用短列表，不要长篇大论，不要复述整段页面。',
    '3. 解释外语词汇或句子时，给出中文意思，并说明在这里的具体用法与语气。',
    '',
    '【页面信息】',
    `标题：${page.title || '(无标题)'}`,
    `地址：${page.url}`,
  ];
  if (page.heading) lines.push(`章节：${page.heading}`);
  if (page.text) {
    lines.push(`正文（${excerptLabel(page)}）：`, '"""', page.text, '"""');
  } else {
    lines.push('正文：（未提供页面正文，只依据用户选中的内容回答）');
  }
  if (instructions && instructions.trim()) {
    lines.push('', '【用户附加要求】', instructions.trim());
  }
  return lines.join('\n');
}

/** 每轮用户消息：选中范围 + 所在句子 + 问题（选中范围不进系统消息，避免前缀漂移） */
export function buildUserTurn(opts: { question: string; selection?: string; selectionContext?: string }): string {
  const parts: string[] = [];
  const sel = (opts.selection ?? '').trim();
  if (sel) parts.push(`【选中范围】\n"""\n${sel}\n"""`);
  const ctx = (opts.selectionContext ?? '').trim();
  if (ctx && ctx !== sel) parts.push(`【选中内容所在的句子】\n${ctx}`);
  parts.push(`【问题】\n${opts.question.trim()}`);
  return parts.join('\n\n');
}

/**
 * 裁剪对话历史：先按轮数（一轮 = user+assistant）保留最近若干轮，
 * 再按 token 上限从最老的整轮开始丢，保证开头永远是完整的 user 消息。
 */
export function trimHistory(messages: ApiMessage[], maxTurns: number, maxTokens: number): ApiMessage[] {
  const pairs: ApiMessage[][] = [];
  for (const m of messages) {
    if (m.role === 'user' || pairs.length === 0) pairs.push([m]);
    else pairs[pairs.length - 1].push(m);
  }
  let kept = pairs.slice(Math.max(0, pairs.length - maxTurns));
  let tokens = kept.reduce((n, p) => n + p.reduce((k, m) => k + estimateTokens(m.content), 0), 0);
  while (kept.length > 1 && tokens > maxTokens) {
    tokens -= kept[0].reduce((k, m) => k + estimateTokens(m.content), 0);
    kept = kept.slice(1);
  }
  return kept.flat().filter(m => m.content.trim() !== '');
}

/** 快捷提问：needsSelection=true 的只在有选中范围时出现 */
export interface QuickPrompt {
  id: string;
  label: string;
  prompt: string;
  needsSelection: boolean;
  focus: 'selection' | 'document-start';
}

export const QUICK_PROMPTS: QuickPrompt[] = [
  { id: 'explain', label: '解释选中', needsSelection: true, focus: 'selection',
    prompt: '解释上面【选中范围】在这里是什么意思、怎么用，必要时说清语气和搭配。' },
  { id: 'plain', label: '说人话', needsSelection: true, focus: 'selection',
    prompt: '用一句大白话把【选中范围】讲明白，不要用术语，不要展开。' },
  { id: 'examples', label: '给例子', needsSelection: true, focus: 'selection',
    prompt: '围绕【选中范围】给 3 个例句，每句附中文翻译，句子要贴近这里的语境。' },
  { id: 'quiz', label: '考考我', needsSelection: true, focus: 'selection',
    prompt: '围绕【选中范围】出 1 道小测验（选择题或填空），先只给题目，等我回答后再给答案和一句解析。' },
  { id: 'summary', label: '这页讲了什么', needsSelection: false, focus: 'document-start',
    prompt: '这页讲了什么？用 3-5 条要点总结，每条一行、不超过 30 字；最后用一句话说明它适合谁读。' },
];
