import { html, nothing } from 'lit';
import type { TranslationResult } from '../../shared/types';
import { ShadowView } from '../shadow-view';

const CSS = `
  :host {
    position: fixed; top: 0; right: 0; width: 380px; height: 100vh;
    z-index: 2147483647;
    background: var(--bg-primary);
    border-left: 1px solid var(--border);
    box-shadow: -4px 0 24px var(--shadow);
    font-family: var(--font-family);
    font-size: var(--font-size-base);
    color: var(--text-primary);
    overflow-y: auto;
    animation: slideIn 0.25s ease;
  }
  @keyframes slideIn {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }
  .panel { padding: 20px; }
  .header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .header h2 { font-size: var(--font-size-lg); margin: 0; }
  .close-btn {
    width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
    border-radius: var(--radius-sm); background: var(--bg-secondary);
    border: 1px solid var(--border); cursor: pointer; font-size: 18px;
  }
  .close-btn:hover { background: var(--accent-red); color: white; }
  .word { font-size: 24px; font-weight: 700; margin-bottom: 4px; }
  .phonetic { font-size: var(--font-size-base); color: var(--text-secondary); margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: var(--font-size-sm); font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px; }
  .pos-item { margin-bottom: 6px; }
  .pos-type { font-style: italic; color: var(--accent); margin-right: 8px; }
  .example-item { background: var(--bg-secondary); border-radius: var(--radius-sm); padding: 10px 12px; margin-bottom: 8px; }
  .example-orig { font-style: italic; margin-bottom: 4px; }
  .example-trans { color: var(--text-secondary); font-size: var(--font-size-sm); }
  .actions { display: flex; gap: 8px; margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
  .btn {
    padding: 8px 16px; border-radius: var(--radius-sm); font-size: var(--font-size-base);
    border: 1px solid var(--border); background: var(--bg-secondary); color: var(--text-primary);
    cursor: pointer; transition: var(--transition); display: flex; align-items: center; gap: 6px;
  }
  .btn:hover { background: var(--bg-hover); }
  .favorited { color: var(--accent-yellow); }
`;

export class SidePanel extends ShadowView {
  translation: TranslationResult | null = null;
  private _originalWord = '';
  private _isFavorited = false;

  constructor() {
    super(CSS);
    this.update();
  }

  protected template() {
    const t = this.translation;
    if (!t) return nothing;

    return html`<div class="panel">
      <div class="header">
        <h2>📖 翻译详情</h2>
        <button class="close-btn" @click=${() => this.hide()}>✕</button>
      </div>

      <div class="word">${this._originalWord}</div>
      ${t.phonetic ? html`<div class="phonetic">
        <span>/${t.phonetic}/</span>
        <button class="btn" @click=${() => this.emit('speak-word', { word: this._originalWord })} style="padding:2px 6px;font-size:12px">🎵 朗读</button>
      </div>` : nothing}

      ${t.partsOfSpeech && t.partsOfSpeech.length > 0 ? html`<div class="section">
        <div class="section-title">释义</div>
        ${t.partsOfSpeech.map(pos => html`
          <div class="pos-item">
            <span class="pos-type">${pos.type}</span>
            <span>${pos.meanings.join('；')}</span>
          </div>
        `)}
      </div>` : nothing}

      ${t.examples && t.examples.length > 0 ? html`<div class="section">
        <div class="section-title">📝 例句</div>
        ${t.examples.map(ex => html`
          <div class="example-item">
            <div class="example-orig">"${ex.original}"</div>
            <div class="example-trans">${ex.translated}</div>
          </div>
        `)}
      </div>` : nothing}

      <div class="section">
        <span style="color:var(--text-secondary);font-size:var(--font-size-sm)">翻译来源：${t.source}</span>
      </div>

      <div class="actions">
        <button class="btn ${this._isFavorited ? 'favorited' : ''}" @click=${() => this._toggleFavorite()}>
          ${this._isFavorited ? '⭐ 已收藏' : '☆ 收藏'}
        </button>
        <button class="btn" @click=${() => this.emit('switch-source')}>🔄 换源</button>
        <button class="btn" @click=${() => this._copy()}>📋 复制</button>
      </div>
    </div>`;
  }

  show(originalWord: string, trans: TranslationResult) {
    this._originalWord = originalWord;
    this.translation = trans;
    this.setVisible(true);
    this.update();
  }

  hide() {
    this.setVisible(false);
    this.translation = null;
    this.update();
  }

  setFavorited(val: boolean) {
    this._isFavorited = val;
    this.update();
  }

  private _toggleFavorite() {
    this._isFavorited = !this._isFavorited;
    this.update();
    this.emit('toggle-favorite', { word: this._originalWord, translation: this.translation });
  }

  private _copy() {
    navigator.clipboard.writeText(this.translation?.text ?? '').catch(() => {});
  }
}
