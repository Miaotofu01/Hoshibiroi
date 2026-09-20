/**
 * 触发图标点击意图回归测试。
 * Run: npx vitest run tests/trigger-intent.test.ts
 */
import { describe, it, expect } from 'vitest';
import { triggerIntent } from '../src/content/trigger-intent';

describe('triggerIntent', () => {
  it('没有卡片时一律翻译', () => {
    expect(triggerIntent({ hasCard: false, displayedWord: '', selectionText: 'hello' })).toBe('translate');
    expect(triggerIntent({ hasCard: false, displayedWord: 'old', selectionText: 'hello' })).toBe('translate');
  });

  it('卡片上就是当前选区这个词时，再点是关闭（保留 toggle 手感）', () => {
    expect(triggerIntent({ hasCard: true, displayedWord: 'hello', selectionText: 'hello' })).toBe('close');
  });

  it('选区换成别的词时翻译新词，而不是关掉卡片', () => {
    // 这是本次修复的核心：卡片显示 hello，选中 world 再点「译」必须翻译 world
    expect(triggerIntent({ hasCard: true, displayedWord: 'hello', selectionText: 'world' })).toBe('translate');
  });

  it('选区与显示词只有空白差异时视为同一个词', () => {
    expect(triggerIntent({ hasCard: true, displayedWord: 'hello', selectionText: '  hello  ' })).toBe('close');
  });

  it('有卡片但没有选区时关闭（图标本不该可见，关闭最不意外）', () => {
    expect(triggerIntent({ hasCard: true, displayedWord: 'hello', selectionText: null })).toBe('close');
    expect(triggerIntent({ hasCard: true, displayedWord: 'hello', selectionText: '' })).toBe('close');
    expect(triggerIntent({ hasCard: true, displayedWord: 'hello', selectionText: '   ' })).toBe('close');
  });
});
