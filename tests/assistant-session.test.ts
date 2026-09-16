import { describe, it, expect } from 'vitest';
import { ChatSession, MAX_HISTORY_TURNS } from '../src/content/assistant/session';

const stats = { elapsedMs: 1200, promptTokens: 100, cachedTokens: 80, answerTokens: 30, reasoningTokens: 10 };

describe('ChatSession', () => {
  it('提问后立刻有一条空的助手消息在流式状态', () => {
    const s = new ChatSession();
    expect(s.empty).toBe(true);
    s.ask('这是什么意思？');
    expect(s.empty).toBe(false);
    expect(s.messages.map(m => m.role)).toEqual(['user', 'assistant']);
    expect(s.streaming).toBe(true);
    expect(s.messages[1].content).toBe('');
  });

  it('增量写入回答与思考过程，结束后记录用量', () => {
    const s = new ChatSession();
    s.ask('q');
    s.pushReasoning('先想一下');
    s.pushReasoning('，再回答');
    s.pushAnswer('答案');
    s.finish(stats);
    expect(s.messages[1].reasoning).toBe('先想一下，再回答');
    expect(s.messages[1].content).toBe('答案');
    expect(s.messages[1].stats).toEqual(stats);
    expect(s.streaming).toBe(false);
  });

  it('思考过程永不进入 API 消息', () => {
    const s = new ChatSession();
    s.ask('q');
    s.pushReasoning('内部推理');
    s.pushAnswer('答案');
    s.finish(stats);
    const api = s.toApiMessages();
    expect(api).toEqual([
      { role: 'user', content: 'q' },
      { role: 'assistant', content: '答案' },
    ]);
    expect(JSON.stringify(api)).not.toContain('内部推理');
  });

  it('失败的助手消息不进历史（避免把错误文本当上下文）', () => {
    const s = new ChatSession();
    s.ask('q');
    s.fail('助手需要 DeepSeek API Key');
    expect(s.messages[1].error).toBe(true);
    expect(s.toApiMessages()).toEqual([]);
    expect(s.streaming).toBe(false);
  });

  it('历史超过轮数上限时丢最老的轮次', () => {
    const s = new ChatSession();
    for (let i = 0; i < MAX_HISTORY_TURNS + 3; i++) {
      s.ask(`问题${i}`);
      s.pushAnswer(`回答${i}`);
      s.finish(stats);
    }
    const api = s.toApiMessages();
    expect(api.length).toBe(MAX_HISTORY_TURNS * 2);
    expect(api[0]).toEqual({ role: 'user', content: `问题${3}` });
    expect(api[api.length - 1]).toEqual({ role: 'assistant', content: `回答${MAX_HISTORY_TURNS + 2}` });
  });

  it('reset 清空全部状态', () => {
    const s = new ChatSession();
    s.ask('q');
    s.reset();
    expect(s.messages).toEqual([]);
    expect(s.empty).toBe(true);
    expect(s.streaming).toBe(false);
  });
});
