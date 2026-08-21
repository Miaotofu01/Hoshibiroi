import { describe, it, expect } from 'vitest';
import { parseCSVRows, csvRowsToWords, parseJSON } from '../src/vocab/import';
import type { FavoriteWord } from '../src/shared/types';

function exportLine(row: string[]): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  return row.map(esc).join(',');
}

describe('parseCSVRows', () => {
  it('解析带引号转义、字段内逗号与换行的 CSV', () => {
    const csv = [
      exportLine(['word', 'phonetic', 'meaning']),
      exportLine(['serendipity', '/ˌserənˈdɪpəti/', 'n. 机缘巧合']),
      exportLine(['"quoted" word', '/x/', 'n. 含 "引号" 与,逗号\n和换行']),
    ].join('\n');
    const rows = parseCSVRows(csv);
    expect(rows).toHaveLength(3);
    expect(rows[1][0]).toBe('serendipity');
    expect(rows[2][0]).toBe('"quoted" word');
    expect(rows[2][2]).toContain('"引号"');
    expect(rows[2][2]).toContain('逗号');
    expect(rows[2][2]).toContain('\n');
  });

  it('跳过空行', () => {
    const rows = parseCSVRows('a,b\n\nc,d\n');
    expect(rows).toHaveLength(2);
  });
});

describe('csvRowsToWords（导出格式往返）', () => {
  it('还原 word/phonetic/词性/释义/上下文/来源', () => {
    const header = ['word', 'phonetic', 'meaning', 'pos', 'context', 'sourceUrl', 'sourceName', 'createdAt'];
    const row = [
      'resilience',
      '/rɪˈzɪliəns/',
      'n. 韧性; 恢复力 | adj. 有韧性的',
      'n adj',
      'She showed great resilience.',
      'https://example.com',
      'DeepSeek',
      '2026-07-13T02:39:00.000Z',
    ];
    const rows = parseCSVRows([exportLine(header), exportLine(row)].join('\n'));
    const words = csvRowsToWords(rows);

    expect(words).toHaveLength(1);
    const w = words[0];
    expect(w.word).toBe('resilience');
    expect(w.translation.phonetic).toBe('rɪˈzɪliəns');
    expect(w.translation.partsOfSpeech).toEqual([
      { type: 'n.', meanings: ['韧性', '恢复力'] },
      { type: 'adj.', meanings: ['有韧性的'] },
    ]);
    expect(w.context).toBe('She showed great resilience.');
    expect(w.sourceUrl).toBe('https://example.com');
    expect(w.translation.source).toBe('DeepSeek');
    expect(w.createdAt).toBe(new Date('2026-07-13T02:39:00.000Z').getTime());
    // 导入的词不带学习进度，均为初始值
    expect(w.reviewCount).toBe(0);
    expect(w.nextReviewAt).toBe(0);
  });

  it('无词性时整串作为兜底释义', () => {
    const header = ['word', 'phonetic', 'meaning', 'pos', 'context', 'sourceUrl', 'sourceName', 'createdAt'];
    const rows = parseCSVRows([exportLine(header), exportLine(['foo', '', '一些释义', '', '', '', '', ''])].join('\n'));
    const words = csvRowsToWords(rows);
    expect(words[0].translation.text).toBe('一些释义');
    expect(words[0].translation.partsOfSpeech).toBeUndefined();
  });
});

describe('parseJSON', () => {
  it('接受完整 FavoriteWord 数组', () => {
    const fav: FavoriteWord = {
      id: 'x1', word: 'resilience',
      translation: { text: '韧性', source: 'DeepSeek', sourceId: 'deepseek' },
      sourceUrl: '', createdAt: 1000, reviewCount: 3, lastReviewedAt: 900,
      nextReviewAt: 10000, easeFactor: 2.5, reviewHistory: [], learned: true,
      starred: false, note: '',
    };
    const words = parseJSON(JSON.stringify([fav]));
    expect(words).toHaveLength(1);
    expect(words[0].word).toBe('resilience');
    expect(words[0].reviewCount).toBe(3);
  });

  it('过滤非法项并报错于损坏 JSON', () => {
    expect(() => parseJSON('{bad')).toThrow();
    const words = parseJSON(JSON.stringify([{ word: 'ok' }, null, 42, {}]));
    expect(words).toHaveLength(1);
    expect(words[0].word).toBe('ok');
  });
});
