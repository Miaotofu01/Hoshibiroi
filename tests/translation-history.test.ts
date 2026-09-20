/**
 * 译文历史回归测试。
 * Run: npx vitest run tests/translation-history.test.ts
 */
import { describe, it, expect } from 'vitest';
import { TranslationHistory, HISTORY_LIMIT } from '../src/content/assistant/history';

type Payload = { text: string };

describe('TranslationHistory', () => {
  it('初始为空，游标不在历史里', () => {
    const h = new TranslationHistory<Payload>();
    expect(h.size).toBe(0);
    expect(h.position).toBe(0);
    expect(h.current()).toBeNull();
    expect(h.canBack).toBe(false);
    expect(h.canForward).toBe(false);
  });

  it('push 后游标停在最新一条', () => {
    const h = new TranslationHistory<Payload>();
    h.push('alpha', 'deepseek', 'EN → ZH', { text: 'A' });
    expect(h.size).toBe(1);
    expect(h.position).toBe(1);
    expect(h.current()?.word).toBe('alpha');
    expect(h.canBack).toBe(false);
  });

  it('同词同源重复翻译不新增条目，只更新载荷并移到最近', () => {
    const h = new TranslationHistory<Payload>();
    h.push('alpha', 'deepseek', 'EN → ZH', { text: 'A1' });
    h.push('beta', 'deepseek', 'EN → ZH', { text: 'B' });
    h.push('alpha', 'deepseek', 'EN → ZH', { text: 'A2' });

    expect(h.size).toBe(2);                       // 没有第三条
    expect(h.current()?.word).toBe('alpha');      // 移到了末尾
    expect(h.current()?.payload.text).toBe('A2'); // 载荷是最新的
    expect(h.back()?.word).toBe('beta');          // 它前面现在是 beta
  });

  it('同词换源算不同条目', () => {
    const h = new TranslationHistory<Payload>();
    h.push('alpha', 'deepseek', 'EN → ZH', { text: 'A-ds' });
    h.push('alpha', 'google', 'EN → ZH', { text: 'A-gg' });
    expect(h.size).toBe(2);
    expect(h.current()?.payload.text).toBe('A-gg');
    expect(h.back()?.payload.text).toBe('A-ds');
  });

  it('去重时签名一并更新（方向来自响应，可能与上次不同）', () => {
    const h = new TranslationHistory<Payload>();
    h.push('alpha', 's', 'EN → ZH', { text: '1' });
    h.push('alpha', 's', 'JA → ZH', { text: '2' });
    expect(h.size).toBe(1);
    expect(h.current()?.sig).toBe('JA → ZH');
  });

  it('back/forward 在两端停住并返回 null', () => {
    const h = new TranslationHistory<Payload>();
    h.push('a', 's', 'EN → ZH', { text: '1' });
    h.push('b', 's', 'EN → ZH', { text: '2' });
    h.push('c', 's', 'EN → ZH', { text: '3' });

    expect(h.position).toBe(3);
    expect(h.back()?.word).toBe('b');
    expect(h.back()?.word).toBe('a');
    expect(h.canBack).toBe(false);
    expect(h.back()).toBeNull();                  // 到顶了
    expect(h.position).toBe(1);

    expect(h.forward()?.word).toBe('b');
    expect(h.forward()?.word).toBe('c');
    expect(h.canForward).toBe(false);
    expect(h.forward()).toBeNull();               // 到底了
    expect(h.position).toBe(3);
  });

  it('回退后 push 新词，游标回到最新', () => {
    const h = new TranslationHistory<Payload>();
    h.push('a', 's', 'EN → ZH', { text: '1' });
    h.push('b', 's', 'EN → ZH', { text: '2' });
    h.back();
    expect(h.position).toBe(1);

    h.push('c', 's', 'EN → ZH', { text: '3' });
    expect(h.size).toBe(3);
    expect(h.position).toBe(3);
    expect(h.current()?.word).toBe('c');
    expect(h.canForward).toBe(false);
  });

  it('超出容量时丢最老的，且游标仍指向最新', () => {
    const h = new TranslationHistory<Payload>();
    for (let i = 0; i < HISTORY_LIMIT + 5; i++) h.push(`w${i}`, 's', 'EN → ZH', { text: String(i) });

    expect(h.size).toBe(HISTORY_LIMIT);
    expect(h.current()?.word).toBe(`w${HISTORY_LIMIT + 4}`);
    // 最老的几条已被丢弃：一路回退到底应该停在 w5
    let last: string | undefined;
    while (h.canBack) last = h.back()?.word;
    expect(last).toBe('w5');
  });

  it('空词不记入历史', () => {
    const h = new TranslationHistory<Payload>();
    h.push('   ', 's', 'EN → ZH', { text: 'x' });
    expect(h.size).toBe(0);
    expect(h.current()).toBeNull();
  });

  it('detach 只移出游标，不清空条目', () => {
    const h = new TranslationHistory<Payload>();
    h.push('a', 's', 'EN → ZH', { text: '1' });
    h.detach();
    expect(h.size).toBe(1);
    expect(h.position).toBe(0);
    expect(h.current()).toBeNull();
    expect(h.canBack).toBe(false);
    expect(h.canForward).toBe(false);
  });

  it('clear 清空条目与游标', () => {
    const h = new TranslationHistory<Payload>();
    h.push('a', 's', 'EN → ZH', { text: '1' });
    h.push('b', 's', 'EN → ZH', { text: '2' });
    h.clear();
    expect(h.size).toBe(0);
    expect(h.current()).toBeNull();
    expect(h.canForward).toBe(false);
  });
});
