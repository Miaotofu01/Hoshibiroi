import { html, nothing } from 'lit';
import type { TranslationResult } from '../../shared/types';
import { ShadowView } from '../shadow-view';

const CSS = `
  :host { position: fixed; z-index: 2147483647; }
  .bubble {
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 4px 16px var(--shadow);
    padding: 12px 14px;
    max-width: 360px;
    min-width: 200px;
    font-family: var(--font-family);
    font-size: var(--font-size-base);
    color: var(--text-primary);
  }
  .original { font-size: var(--font-size-lg); font-weight: 600; margin-bottom: 8px; word-break: break-word; }
  .divider { height: 1px; background: var(--border); margin: 8px 0; }
  .translated { font-size: var(--font-size-lg); color: var(--accent-green); margin-bottom: 6px; word-break: break-word; }
  .actions { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
  .btn {
    padding: 4px 10px; border-radius: var(--radius-sm); font-size: var(--font-size-sm);
    border: 1px solid var(--border); background: var(--bg-primary); color: var(--text-primary);
    cursor: pointer; transition: var(--transition); display: flex; align-items: center; gap: 4px;
  }
  .btn:hover { background: var(--bg-hover); }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #1a1b26; font-weight: 600; }
  .btn.primary:hover { background: var(--accent-hover); }
  .favorited { color: var(--accent-yellow); }
  .error { color: var(--accent-red); font-size: var(--font-size-sm); }
  .loading { color: var(--text-secondary); font-size: var(--font-size-sm); }
`;

export class PopupBubble extends ShadowView {
  translation: TranslationResult | null = null;
  private loading = false;
  private error = '';
  private isFavorited = false;
  private _originalWord = '';

  constructor() {
    super(CSS);
    this.update();
  }

  protected template() {
    if (this.loading) {
      return html`<div class="bubble"><span class="loading">翻译中...</span></div>`;
    }
    if (this.error) {
      return html`<div class="bubble">
        <span class="error">${this.error}</span>
        <div class="actions" style="margin-top:8px">
          <button class="btn" @click=${() => this.emit('retry-translate')}>🔄 重试</button>
        </div>
      </div>`;
    }
    if (!this.translation) return nothing;

    return html`<div class="bubble">
      <div class="original">${this.translation.text !== this._originalWord ? this._originalWord : ''}</div>
      <div class="divider"></div>
      <div class="translated">${this.translation.text}</div>
      <div class="actions">
        <button class="btn" @click=${() => this.emit('speak-word', { word: this._originalWord })} title="朗读">🎵</button>
        <button class="btn ${this.isFavorited ? 'favorited' : ''}" @click=${() => this._toggleFavorite()} title="收藏">⭐</button>
        <button class="btn" @click=${() => this._copy()} title="复制">📋</button>
        <button class="btn primary" @click=${() => this.emit('expand-detail')} style="margin-left:auto">📖 展开详情 →</button>
      </div>
    </div>`;
  }

  show(originalWord: string, trans: TranslationResult, anchorRect: DOMRect) {
    this._originalWord = originalWord;
    this.translation = trans;
    this.error = '';
    this.loading = false;
    this._position(anchorRect);
    this.setVisible(true);
    this.update();
  }

  setLoading(anchorRect: DOMRect) {
    this.loading = true;
    this.error = '';
    this.translation = null;
    this._position(anchorRect);
    this.setVisible(true);
    this.update();
  }

  setError(msg: string, anchorRect: DOMRect) {
    this.error = msg;
    this.loading = false;
    this._position(anchorRect);
    this.setVisible(true);
    this.update();
  }

  hide() {
    this.setVisible(false);
    this.translation = null;
    this.loading = false;
    this.error = '';
    this.update();
  }

  private _position(rect: DOMRect) {
    const gap = 8;
    let top = rect.bottom + gap;
    let left = rect.left;
    if (top + 200 > window.innerHeight) top = rect.top - gap - 200;
    if (left + 360 > window.innerWidth) left = window.innerWidth - 370;
    if (left < 8) left = 8;
    // 定位设在宿主上（:host 才是 position:fixed）
    this.el.style.left = `${left}px`;
    this.el.style.top = `${Math.max(8, top)}px`;
  }

  private _toggleFavorite() {
    this.isFavorited = !this.isFavorited;
    this.update();
    this.emit('toggle-favorite', { word: this._originalWord, translation: this.translation });
  }

  private _copy() {
    navigator.clipboard.writeText(this.translation?.text ?? '').catch(() => {});
  }
}
