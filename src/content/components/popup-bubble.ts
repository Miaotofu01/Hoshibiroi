import { LitElement, html, css, unsafeCSS } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { TranslationResult } from '../../shared/types';
import themeCss from '../styles/theme.css?inline';

@customElement('popup-bubble')
export class PopupBubble extends LitElement {
  @property({ type: Boolean }) visible = false;
  @state() translation: TranslationResult | null = null;
  @state() loading = false;
  @state() error = '';
  @state() isFavorited = false;
  @state() _x = 0;
  @state() _y = 0;

  static styles = [
    unsafeCSS(themeCss),
    css`
      :host {
        display: none;
        position: fixed;
        z-index: 2147483647;
      }
      :host([visible]) { display: block; }

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
      .original {
        font-size: var(--font-size-lg);
        font-weight: 600;
        margin-bottom: 8px;
        word-break: break-word;
      }
      .divider {
        height: 1px;
        background: var(--border);
        margin: 8px 0;
      }
      .translated {
        font-size: var(--font-size-lg);
        color: var(--accent-green);
        margin-bottom: 6px;
        word-break: break-word;
      }
      .actions {
        display: flex;
        gap: 6px;
        align-items: center;
        flex-wrap: wrap;
      }
      .btn {
        padding: 4px 10px;
        border-radius: var(--radius-sm);
        font-size: var(--font-size-sm);
        border: 1px solid var(--border);
        background: var(--bg-primary);
        color: var(--text-primary);
        cursor: pointer;
        transition: var(--transition);
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .btn:hover { background: var(--bg-hover); }
      .btn.primary {
        background: var(--accent);
        border-color: var(--accent);
        color: #1a1b26;
        font-weight: 600;
      }
      .btn.primary:hover { background: var(--accent-hover); }
      .favorited { color: var(--accent-yellow); }
      .error { color: var(--accent-red); font-size: var(--font-size-sm); }
      .loading { color: var(--text-secondary); font-size: var(--font-size-sm); }
    `,
  ];

  render() {
    if (!this.visible) return html``;
    const style = `left: ${this._x}px; top: ${this._y}px;`;

    if (this.loading) {
      return html`<div class="bubble" style="${style}"><span class="loading">翻译中...</span></div>`;
    }

    if (this.error) {
      return html`<div class="bubble" style="${style}">
        <span class="error">${this.error}</span>
        <div class="actions" style="margin-top:8px">
          <button class="btn" @click="${this._retry}">🔄 重试</button>
        </div>
      </div>`;
    }

    if (!this.translation) return html``;

    return html`<div class="bubble" style="${style}">
      <div class="original">${this.translation.text !== this._originalWord ? this._originalWord : ''}</div>
      <div class="divider"></div>
      <div class="translated">${this.translation.text}</div>
      <div class="actions">
        <button class="btn" @click="${this._speak}" title="朗读">🎵</button>
        <button class="btn ${this.isFavorited ? 'favorited' : ''}" @click="${this._toggleFavorite}" title="收藏">⭐</button>
        <button class="btn" @click="${this._copy}" title="复制">📋</button>
        <button class="btn primary" @click="${this._expand}" style="margin-left:auto">📖 展开详情 →</button>
      </div>
    </div>`;
  }

  private _originalWord = '';

  show(originalWord: string, trans: TranslationResult, anchorRect: DOMRect) {
    this._originalWord = originalWord;
    this.translation = trans;
    this.error = '';
    this.loading = false;
    this.visible = true;
    this._position(anchorRect);
  }

  setLoading(anchorRect: DOMRect) {
    this.loading = true;
    this.error = '';
    this.translation = null;
    this.visible = true;
    this._position(anchorRect);
  }

  setError(msg: string, anchorRect: DOMRect) {
    this.error = msg;
    this.loading = false;
    this.visible = true;
    this._position(anchorRect);
  }

  hide() {
    this.visible = false;
    this.translation = null;
    this.loading = false;
    this.error = '';
  }

  private _position(rect: DOMRect) {
    // 优先显示在选区下方 (viewport-relative for position: fixed)
    const gap = 8;
    let top = rect.bottom + gap;
    let left = rect.left;

    // 如果下方空间不够，显示在上方
    if (top + 200 > window.innerHeight) {
      top = rect.top - gap - 200; // 估计高度
    }

    // 避免超出右侧边界
    if (left + 360 > window.innerWidth) {
      left = window.innerWidth - 370;
    }

    // 避免超出左侧边界
    if (left < 8) {
      left = 8;
    }

    this._x = left;
    this._y = Math.max(8, top);
    // 定位必须设在宿主 :host 上（它才是 position:fixed 的元素）；
    // 内层 .bubble 是 static，left/top 会被忽略。
    this.style.left = `${left}px`;
    this.style.top = `${Math.max(8, top)}px`;
  }

  private _speak() {
    this.dispatchEvent(new CustomEvent('speak-word', {
      bubbles: true, composed: true,
      detail: { word: this._originalWord },
    }));
  }

  private _toggleFavorite() {
    this.isFavorited = !this.isFavorited;
    this.dispatchEvent(new CustomEvent('toggle-favorite', {
      bubbles: true, composed: true,
      detail: { word: this._originalWord, translation: this.translation },
    }));
  }

  private _copy() {
    navigator.clipboard.writeText(this.translation?.text ?? '').catch(() => {});
  }

  private _expand() {
    this.dispatchEvent(new CustomEvent('expand-detail', {
      bubbles: true, composed: true,
    }));
  }

  private _retry() {
    this.dispatchEvent(new CustomEvent('retry-translate', {
      bubbles: true, composed: true,
    }));
  }
}
