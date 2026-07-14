import type { FavoriteWord } from '../shared/types';

// ── HTML escaping ──

export function escapeHtml(s: string): string {
  const el = document.createElement('span');
  el.textContent = s;
  return el.innerHTML;
}

// ── Time formatting ──

export function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`;
  if (diff < 604800_000) return `${Math.floor(diff / 86400_000)} 天前`;
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// ── URL parsing ──

export function extractHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.slice(0, 60);
  }
}

// ── Mastery calculation (0-100) ──

export function calcMastery(word: FavoriteWord): number {
  if (word.reviewCount === 0) return 0;

  const lastReview = word.reviewHistory?.[word.reviewHistory.length - 1];
  const q = lastReview?.quality ?? 5;
  const base = q === 5 ? 95 : q === 3 ? 70 : 30;

  const now = Date.now();
  const interval = word.nextReviewAt - word.lastReviewedAt;
  const elapsed = interval > 0 ? (now - word.lastReviewedAt) / interval : 0;
  const decay = elapsed * (100 - base) * 0.5;
  let mastery = Math.max(0, Math.min(100, base - decay));

  // easeFactor < 1.5 → cap at 60%
  if (word.easeFactor < 1.5) {
    mastery = Math.min(mastery, 60);
  }
  // reviewCount >= 3 && easeFactor >= 2.0 → floor at 80%
  if (word.reviewCount >= 3 && word.easeFactor >= 2.0) {
    mastery = Math.max(mastery, 80);
  }

  return Math.round(mastery);
}

// ── Source dot CSS class ──

export function sourceDotClass(sourceId?: string): string {
  if (!sourceId) return '';
  const id = sourceId.toLowerCase();
  if (id.includes('deepseek')) return 's-deepseek';
  if (id.includes('google')) return 's-google';
  if (id.includes('tencent')) return 's-tencent';
  if (id.includes('baidu')) return 's-baidu';
  if (id.includes('deepl')) return 's-deepl';
  return '';
}

// ── Word status classification ──

export function wordStatus(word: FavoriteWord): 'new' | 'learning' | 'mastered' {
  if (word.reviewCount === 0) return 'new';
  if (word.reviewCount >= 3 && word.easeFactor >= 2.0) return 'mastered';
  return 'learning';
}

// ── SVG Icons ──

function svg(paths: string): string {
  return `<svg viewBox="0 0 24 24" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

export const Icons: Record<string, string> = {
  search: svg('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
  trash: svg('<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>'),
  copy: svg('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  link: svg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  check: svg('<polyline points="20 6 9 17 4 12"/>'),
  arrowLeft: svg('<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>'),
  book: svg('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>'),
  play: svg('<polygon points="5 3 19 12 5 21 5 3"/>'),
  list: svg('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>'),
  x: svg('<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>'),
  star: svg('<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.86L12 18.56 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z"/>'),
  starFilled: svg('<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.86L12 18.56 5.82 21 7 14.14 2 9.27l6.91-1.01L12 2z" fill="currentColor" stroke="none"/>'),
  note: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>'),
  speaker: svg('<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>'),
  grip: svg('<circle cx="9" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="9" cy="19" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="19" r="1" fill="currentColor" stroke="none"/>'),
};

export function ico(svgStr: string, cls?: string): string {
  return `<span class="ico${cls ? ' ' + cls : ''}">${svgStr}</span>`;
}

