import type { FavoriteWord, TranslationResult } from '../shared/types';

// ═══════════════════════════════════════════════
//  导入解析：CSV / JSON → FavoriteWord[]
//  与 export.ts 的导出格式一一对应（可往返）
// ═══════════════════════════════════════════════

/** 按文件扩展名解析导入内容，返回规范化前的词条列表 */
export function parseImportFile(fileName: string, text: string): FavoriteWord[] {
  const name = fileName.toLowerCase();
  if (name.endsWith('.json')) return parseJSON(text);
  if (name.endsWith('.csv')) return csvRowsToWords(parseCSVRows(text));
  throw new Error('仅支持 CSV / JSON 文件');
}

// ── CSV ──

/** 解析 CSV 文本 → 行 × 列 二维数组（支持双引号包裹、"" 转义、字段内逗号与换行） */
export function parseCSVRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += ch; i++; continue;
    }
    if (ch === '"') { inQuotes = true; i++; continue; }
    if (ch === ',') { row.push(field); field = ''; i++; continue; }
    if (ch === '\n') {
      row.push(field); field = '';
      if (row.some(c => c.trim() !== '')) rows.push(row);
      row = [];
      i++; continue;
    }
    if (ch === '\r') { i++; continue; }
    field += ch; i++;
  }
  row.push(field);
  if (row.some(c => c.trim() !== '')) rows.push(row);
  return rows;
}

/** CSV 列 → 词条（与 exportCSV 的列一一对应） */
export function csvRowsToWords(rows: string[][]): FavoriteWord[] {
  if (rows.length === 0) return [];
  const header = rows[0].map(h => h.trim());
  const col = (name: string): number => header.indexOf(name);
  const get = (r: string[], name: string): string => {
    const i = col(name);
    return i >= 0 && i < r.length ? (r[i] ?? '').trim() : '';
  };

  const words: FavoriteWord[] = [];
  for (const r of rows.slice(1)) {
    const word = get(r, 'word');
    if (!word) continue;

    const phonetic = get(r, 'phonetic').replace(/^\/|\/$/g, '');
    const meaning = get(r, 'meaning');
    const posStr = get(r, 'pos');
    const context = get(r, 'context');
    const sourceUrl = get(r, 'sourceUrl');
    const sourceName = get(r, 'sourceName');
    const createdAtRaw = get(r, 'createdAt');
    const createdAt = createdAtRaw ? new Date(createdAtRaw).getTime() : Date.now();

    const pos = parseMeaning(meaning, posStr);
    const translation: TranslationResult = {
      text: pos.length > 0 ? pos.map(p => p.meanings.join('；')).join('；') : meaning,
      phonetic: phonetic || undefined,
      partsOfSpeech: pos.length > 0 ? pos : undefined,
      source: sourceName || '',
      sourceId: '',
    };

    words.push({
      id: '', // worker 导入时重新生成
      word,
      translation,
      context: context || undefined,
      sourceUrl,
      createdAt,
      reviewCount: 0,
      lastReviewedAt: 0,
      nextReviewAt: 0,
      easeFactor: 2.5,
      reviewHistory: [],
      learned: false,
      starred: false,
      note: '',
    });
  }
  return words;
}

/** 把导出的 meaning 列（"n. 意思1; 意思2 | v. 行动"）解析回 partsOfSpeech */
function parseMeaning(meaning: string, posStr: string): NonNullable<TranslationResult['partsOfSpeech']> {
  const parts: NonNullable<TranslationResult['partsOfSpeech']> = [];
  const fallbackPos = posStr.split(/\s+/).filter(Boolean);
  let posIdx = 0;

  for (const seg of meaning.split(' | ')) {
    const m = seg.trim().match(/^(\S+)\s+(.*)$/s);
    let type: string;
    let meaningsText: string;
    if (m) {
      type = m[1];
      meaningsText = m[2];
    } else if (fallbackPos[posIdx]) {
      type = fallbackPos[posIdx];
      meaningsText = seg.trim();
    } else {
      // 不是「词性 + 释义」格式（如纯文本释义），整段交给 text 兜底
      continue;
    }
    const meanings = meaningsText.split('; ').map(s => s.trim()).filter(Boolean);
    if (meanings.length > 0) {
      parts.push({ type, meanings });
    }
    posIdx++;
  }
  return parts;
}

// ── JSON ──

/** JSON 导入：完整 FavoriteWord 数组（保留学习进度）；宽松校验并规范化 */
export function parseJSON(text: string): FavoriteWord[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('JSON 解析失败，文件可能已损坏');
  }
  if (!Array.isArray(data)) throw new Error('JSON 内容应为单词数组');
  return data.filter((w): w is FavoriteWord =>
    !!w && typeof w === 'object' && typeof (w as FavoriteWord).word === 'string' && (w as FavoriteWord).word.trim() !== ''
  );
}
