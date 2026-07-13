import { getState } from './state';
import type { FavoriteWord } from '../shared/types';

// ── Helpers ──

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function csvEscape(val: string): string {
  return `"${val.replace(/"/g, '""')}"`;
}

// ── Exports ──

export function exportCSV(): void {
  const { words } = getState();
  const header = [
    'word',
    'phonetic',
    'meaning',
    'pos',
    'context',
    'sourceUrl',
    'sourceName',
    'createdAt',
  ];

  const rows = words.map((w: FavoriteWord) => {
    const phon = w.translation.phonetic ? `/${w.translation.phonetic}/` : '';
    const meaning = w.translation.partsOfSpeech?.length
      ? w.translation.partsOfSpeech
          .map((p) => `${p.type} ${p.meanings.join('; ')}`)
          .join(' | ')
      : w.translation.text;
    const pos = w.translation.partsOfSpeech?.length
      ? w.translation.partsOfSpeech.map((p) => p.type).join(' ')
      : '';
    const context = w.context ?? '';
    const sourceUrl = w.sourceUrl ?? '';
    const sourceName = w.translation.source ?? '';
    const createdAt = new Date(w.createdAt).toISOString();

    return [w.word, phon, meaning, pos, context, sourceUrl, sourceName, createdAt]
      .map(csvEscape)
      .join(',');
  });

  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;header=present' });
  downloadBlob(blob, 'vocab-export.csv');
}

export function exportJSON(): void {
  const { words } = getState();
  const json = JSON.stringify(words, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  downloadBlob(blob, 'vocab-export.json');
}
