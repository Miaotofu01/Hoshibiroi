import { describe, it, expect } from 'vitest';
import {
  estimateTokens, truncateAround, buildSystemPrompt, buildUserTurn, trimHistory,
  normalizeAssistantSettings, DEFAULT_ASSISTANT_SETTINGS, QUICK_PROMPTS,
  type ApiMessage,
} from '../src/shared/assistant';
import type { PageContext } from '../src/shared/types';

const page: PageContext = {
  title: 'Transformer 简介',
  url: 'https://example.com/a',
  heading: 'H2: 注意力机制',
  text: '第一段。\n第二段包含 attention 一词。\n第三段。',
  totalChars: 30000,
};

describe('estimateTokens', () => {
  it('中文按字计、英文按 4 字符计', () => {
    expect(estimateTokens('你好世界')).toBe(4);
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('你好abcd')).toBe(3);
    // 单个非 CJK 字符必须向上取整为 1（钉住 ceil，排除 floor）
    expect(estimateTokens('a')).toBe(1);
  });
  it('空串为 0', () => {
    expect(estimateTokens('')).toBe(0);
  });
});

describe('truncateAround', () => {
  const text = Array.from({ length: 100 }, (_, i) => `line-${i} 内容`).join('\n');

  it('围绕锚点开窗，并回报前后省略量', () => {
    const out = truncateAround(text, 'line-50', 100);
    expect(out.text).toContain('line-50');
    expect(out.omittedHead).toBeGreaterThan(0);
    expect(out.omittedTail).toBeGreaterThan(0);
    // 不变式：省略头 + 窗口 + 省略尾必须精确等于原文长度
    expect(out.omittedHead + out.text.length + out.omittedTail).toBe(text.length);
  });

  it('向后对齐越过文本末尾时省略尾不为负（回归：text[len - maxChars] 是换行）', () => {
    const short = 'a\nc';
    const out = truncateAround(short, 'c', 2);
    expect(out.text).toBe('c');
    expect(out.omittedTail).toBe(0);
    expect(out.omittedHead + out.text.length + out.omittedTail).toBe(short.length);
  });

  it('锚点找不到时从开头截取', () => {
    const out = truncateAround(text, '不存在的词', 50);
    expect(out.text.startsWith('line-0')).toBe(true);
    expect(out.omittedHead).toBe(0);
  });

  it('maxChars 为 0 时返回空（只带选中范围）', () => {
    expect(truncateAround(text, 'line-1', 0).text).toBe('');
  });

  it('文本短于上限时原样返回', () => {
    expect(truncateAround('短文本', '短', 100).text).toBe('短文本');
  });
});

describe('buildSystemPrompt', () => {
  it('包含标题/地址/章节/正文，并说明截取', () => {
    const s = buildSystemPrompt({ page, instructions: '' });
    expect(s).toContain('Transformer 简介');
    expect(s).toContain('https://example.com/a');
    expect(s).toContain('H2: 注意力机制');
    expect(s).toContain('attention');
    expect(s).toContain('页面里没有提到');
  });

  it('上下文长度为 0 时不注入正文', () => {
    const s = buildSystemPrompt({ page: { ...page, text: '' }, instructions: '' });
    expect(s).not.toContain('attention');
  });

  it('附加指令被拼进系统提示词', () => {
    expect(buildSystemPrompt({ page, instructions: '回答控制在两句话内' })).toContain('回答控制在两句话内');
  });
});

describe('buildUserTurn', () => {
  it('选中范围与所在句子都进用户消息', () => {
    const u = buildUserTurn({ question: '这是什么意思？', selection: 'attention', selectionContext: '第二段包含 attention 一词。' });
    expect(u).toContain('attention');
    expect(u).toContain('这是什么意思？');
    expect(u).toContain('第二段');
  });
  it('无选中范围时只发问题', () => {
    expect(buildUserTurn({ question: '这页讲了什么？' })).toContain('这页讲了什么？');
  });
});

describe('trimHistory', () => {
  const msgs: ApiMessage[] = [];
  for (let i = 0; i < 12; i++) {
    msgs.push({ role: 'user', content: `问题${i}` });
    msgs.push({ role: 'assistant', content: `回答${i}` });
  }

  it('按轮数上限保留最近的完整轮次', () => {
    const out = trimHistory(msgs, 3, 100000);
    expect(out).toHaveLength(6);
    expect(out[0].content).toBe('问题9');
    expect(out[out.length - 1].content).toBe('回答11');
    expect(out[0].role).toBe('user');
  });

  it('按 token 上限再裁一层', () => {
    // 每轮 6 token（问/答各 3），12 轮共 72；上限 12 恰好只剩最后两轮
    expect(trimHistory(msgs, 12, 12)).toEqual([
      { role: 'user', content: '问题10' },
      { role: 'assistant', content: '回答10' },
      { role: 'user', content: '问题11' },
      { role: 'assistant', content: '回答11' },
    ]);
  });
});

describe('normalizeAssistantSettings', () => {
  it('非法值回落到默认值', () => {
    expect(normalizeAssistantSettings(undefined)).toEqual(DEFAULT_ASSISTANT_SETTINGS);
    expect(normalizeAssistantSettings({ contextChars: 777, thinking: 'ultra', maxAnswerTokens: -5 }))
      .toEqual(DEFAULT_ASSISTANT_SETTINGS);
  });
  it('合法值被保留，指令被裁到 2000 字', () => {
    const s = normalizeAssistantSettings({ contextChars: 16000, thinking: 'high', includeSelection: false, maxAnswerTokens: 2000, instructions: 'x'.repeat(3000) });
    expect(s.contextChars).toBe(16000);
    expect(s.thinking).toBe('high');
    expect(s.includeSelection).toBe(false);
    expect(s.maxAnswerTokens).toBe(2000);
    expect(s.instructions).toHaveLength(2000);
  });
});

describe('QUICK_PROMPTS', () => {
  it('含四个选中类提问 + 一个整页速览', () => {
    expect(QUICK_PROMPTS.map(q => q.id)).toEqual(['explain', 'plain', 'examples', 'quiz', 'summary']);
    expect(QUICK_PROMPTS.filter(q => q.needsSelection)).toHaveLength(4);
    const summary = QUICK_PROMPTS.find(q => q.id === 'summary')!;
    expect(summary.focus).toBe('document-start');
    expect(summary.needsSelection).toBe(false);
  });
});
