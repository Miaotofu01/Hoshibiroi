import { html, nothing } from 'lit';
import type { TranslationResult } from '../../shared/types';
import { ShadowView } from '../shadow-view';
import { iconSpeak, iconStar, iconChevronRight, iconRetry, iconPin, iconSettings, iconClose } from '../icons';

const MIN_W = 240, MAX_W = 640;
const MIN_H = 120;

const CSS = `
  :host {
    position: fixed; z-index: 2147483647;
    --text-primary: var(--syo-fg-default, #e6edf3);
    --text-secondary: var(--syo-fg-body, #c9d1d9);
    --text-muted: var(--syo-fg-muted, #8b949e);
    --bg-primary: var(--syo-bg-base, #0d1117);
    --bg-secondary: var(--syo-bg-surface, #161b22);
    --bg-hover: var(--syo-bg-elevated, #1c2129);
    --border: var(--syo-border, #30363d);
    --border-soft: var(--syo-border-muted, #21262d);
    --accent: var(--syo-blue, #58a6ff);
    --accent-green: var(--syo-success, #3fb950);
    --accent-yellow: var(--syo-warning, #d29922);
    --accent-red: var(--syo-danger, #f85149);
    --accent-purple: var(--syo-accent, #bc8cff);
    --transition: color .15s var(--syo-ease-out, cubic-bezier(0.4,0,0.2,1)), background .15s var(--syo-ease-out, cubic-bezier(0.4,0,0.2,1)), border-color .15s var(--syo-ease-out, cubic-bezier(0.4,0,0.2,1));
  }
  .bubble {
    display: flex; flex-direction: column;
    max-width: calc(100vw - 16px);
    opacity: var(--card-opacity, 1);
    background: var(--bg-primary);
    border: 1px solid var(--border);
    border-top: 2px solid var(--accent);
    border-radius: 2px 2px var(--syo-radius-lg) var(--syo-radius-lg);
    box-shadow: 0 12px 40px rgba(0,0,0,0.55), 0 3px 10px rgba(0,0,0,0.4);
    overflow: hidden;
    font-family: var(--font-display);
    color: var(--text-primary);
    animation: rise 200ms var(--syo-ease-out);
    position: relative; /* 为 resize 手柄提供定位上下文 */
  }
  .bubble.pinned { border-top-color: var(--syo-cyan); }
  @keyframes rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }

  .meta {
    flex: 0 0 auto;
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 9px 12px 0 14px;
    font-family: var(--font-mono); font-size: var(--font-size-sm);
    letter-spacing: .04em;
    color: var(--text-muted);
    cursor: grab; user-select: none;
    -webkit-user-select: none;
  }
  .meta:active { cursor: grabbing; }
  .sig { display: flex; align-items: center; gap: 6px; min-width: 0; }
  .grip {
    display: flex; gap: 2px; opacity: .35; flex-shrink: 0;
    padding: 0 2px; transition: opacity 180ms;
  }
  .meta:hover .grip { opacity: .6; }
  .grip::before, .grip::after {
    content: '⋮'; display: block; line-height: 1; font-size: 12px;
  }
  .chip {
    font-family: var(--font-mono); font-size: calc(var(--font-size-sm) - 1px);
    padding: 2px 7px; border-radius: 5px;
    background: rgba(63,185,80,.13); color: var(--accent-green);
    border: 1px solid rgba(63,185,80,.22); white-space: nowrap;
  }

  .body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 10px 14px 12px; }
  .body::-webkit-scrollbar { width: 8px; }
  .body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  .body::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
  .body::-webkit-scrollbar-track { background: transparent; }
  .orig { font-family: var(--font-mono); font-size: var(--font-size-base); color: var(--text-secondary); margin-bottom: 3px; word-break: break-word; }
  .phon { font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--text-muted); margin-bottom: 9px; }
  .trans { font-size: var(--font-size-xl, 20px); font-weight: 600; line-height: 1.35; color: var(--text-primary); letter-spacing: .01em; word-break: break-word; }

  .divider { flex: 0 0 auto; height: 1px; background: var(--border-soft); }
  .actions { flex: 0 0 auto; display: flex; align-items: center; gap: 6px; padding: 10px 12px; }

  .iconbtn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 30px; height: 30px; border-radius: var(--syo-radius-sm);
    background: transparent; border: 1px solid var(--border);
    color: var(--text-secondary); cursor: pointer; transition: var(--transition);
  }
  .iconbtn:hover { background: var(--bg-hover); color: var(--accent); border-color: var(--accent); }
  .iconbtn svg { width: 15px; height: 15px; }
  .iconbtn.on { color: var(--accent-yellow); border-color: rgba(210,153,34,.4); }
  .iconbtn.on svg { fill: var(--accent-yellow); }
  .iconbtn.pinned-on { color: var(--syo-cyan); border-color: rgba(125,207,255,.35); }
  .iconbtn.copied { color: var(--accent-green); border-color: rgba(63,185,80,.4); }

  .expand {
    margin-left: auto;
    display: inline-flex; align-items: center; gap: 4px;
    height: 30px; padding: 0 12px;
    font-family: var(--font-display); font-size: 13px; font-weight: 500;
    color: var(--accent); background: rgba(122,162,247,.1);
    border: 1px solid rgba(122,162,247,.22); border-radius: var(--syo-radius-sm);
    cursor: pointer; transition: var(--transition);
  }
  .expand:hover { background: rgba(122,162,247,.18); }
  .expand svg { width: 14px; height: 14px; }

  /* ── 调尺寸手柄（右下角，低调）── */
  .resize-handle {
    position: absolute; bottom: 0; right: 0;
    width: 16px; height: 16px;
    cursor: nwse-resize;
    z-index: 2;
    background: repeating-linear-gradient(
      -45deg,
      transparent, transparent 3px,
      var(--text-muted) 3px, var(--text-muted) 5px
    );
    opacity: .25;
    border-radius: 0 0 var(--syo-radius-lg) 0;
    transition: opacity .2s;
  }
  .resize-handle:hover, .bubble:hover .resize-handle { opacity: .7; }

  /* ── 设置小浮窗（独立浮层，从齿轮按钮旁弹出）── */
  .settings-pop {
    position: fixed;
    z-index: 2147483648; /* 高于主卡片 */
    width: 250px; max-width: calc(100vw - 24px);
    background: var(--syo-bg-elevated);
    border: 1px solid var(--border);
    border-radius: var(--syo-radius-lg);
    box-shadow: 0 8px 32px rgba(0,0,0,.55);
    animation: popIn 200ms var(--syo-ease-out);
  }
  @keyframes popIn { from { opacity: 0; transform: scale(.93) translateY(-4px); } to { opacity: 1; transform: scale(1) translateY(0); } }
  .settings-pop .set-head {
    display: flex; align-items: center; gap: 8px;
    padding: 10px 12px 2px;
    cursor: grab; user-select: none; -webkit-user-select: none;
  }
  .settings-pop .set-head:active { cursor: grabbing; }
  .settings-pop .set-head .title {
    font-family: var(--font-mono); font-size: var(--font-size-sm);
    letter-spacing: .08em; color: var(--text-secondary);
  }
  .settings-pop .set-head .set-grip {
    display: flex; gap: 2px; opacity: .3; flex-shrink: 0;
  }
  .settings-pop .set-head .set-grip::before, .settings-pop .set-head .set-grip::after {
    content: '⋮'; display: block; line-height: 1; font-size: 11px; color: var(--text-muted);
  }
  .settings-pop .set-head .set-close {
    display: inline-flex; align-items: center; justify-content: center;
    width: 24px; height: 24px; border-radius: var(--syo-radius-sm);
    border: 1px solid var(--border); background: transparent;
    color: var(--text-secondary); cursor: pointer; transition: var(--transition);
    margin-left: auto;
  }
  .settings-pop .set-head .set-close:hover { background: var(--accent-red); border-color: var(--accent-red); color: #1a1b26; }
  .settings-pop .set-head .set-close svg { width: 12px; height: 12px; }
  .settings-pop .set-body { padding: 4px 12px 10px; }
  .settings-pop .set-row { margin-bottom: 10px; }
  .settings-pop .set-label {
    display: flex; align-items: center; gap: 6px; margin-bottom: 3px;
    font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--text-muted);
    letter-spacing: .04em;
  }
  .settings-pop .set-label .val { margin-left: auto; color: var(--accent); }
  .settings-pop .set-slider {
    -webkit-appearance: none; appearance: none;
    width: 100%; height: 4px;
    background: var(--border); border-radius: 2px; outline: none; cursor: pointer;
  }
  .settings-pop .set-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 13px; height: 13px; border-radius: 50%;
    background: var(--accent); cursor: pointer; border: none;
  }
  .settings-pop .set-slider::-moz-range-thumb {
    width: 13px; height: 13px; border-radius: 50%;
    background: var(--accent); cursor: pointer; border: none;
  }
  .settings-pop .set-sources { display: flex; gap: 5px; flex-wrap: wrap; }
  .settings-pop .set-src {
    font-family: var(--font-mono); font-size: var(--font-size-sm);
    padding: 4px 9px; border-radius: 5px;
    background: transparent; border: 1px solid transparent;
    color: var(--text-muted); cursor: pointer; transition: var(--transition);
  }
  .settings-pop .set-src:hover { background: var(--bg-hover); color: var(--text-secondary); }
  .settings-pop .set-src.active { background: rgba(63,185,80,.14); color: var(--accent-green); border-color: rgba(63,185,80,.3); }
  .settings-pop .set-dir { display: flex; align-items: center; gap: 5px; }
  .settings-pop .set-arrow { font-family: var(--font-mono); color: var(--accent); font-size: var(--font-size-sm); }
  .settings-pop .set-sel {
    flex: 1; padding: 4px 6px; border-radius: 5px;
    border: 1px solid var(--border); background: var(--bg-secondary);
    color: var(--text-primary); font-family: var(--font-mono); font-size: var(--font-size-sm);
    outline: none; cursor: pointer;
  }
  .settings-pop .set-sel:focus { border-color: var(--accent); }

  .state { padding: 14px; display: flex; align-items: center; gap: 10px; }
  .error { color: var(--accent-red); font-size: var(--font-size-sm); }
  .loading { color: var(--text-secondary); font-size: var(--font-size-sm); font-family: var(--font-mono); }
  .dots { display: inline-block; width: 14px; height: 14px; border: 2px solid var(--border); border-top-color: var(--accent); border-radius: 50%; animation: spin .7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

export class PopupBubble extends ShadowView {
  translation: TranslationResult | null = null;
  /** 固定态：置 true 后全局点击不会关闭此卡片 */
  pinned = false;

  private loading = false;
  private error = '';
  private isFavorited = false;
  private _originalWord = '';
  private _sig = '';
  /** 滑条控制的字号基准值（= --font-size-xl 的 px 值） */
  private _fontScale = 20;
  /** 设置面板是否展开 */
  private _showSettings = false;
  /** 设置浮窗锚点（齿轮按钮的左下角坐标） */
  private _settingsX = 0;
  private _settingsY = 0;
  /** 透明度 (0.4–1.0) */
  private _opacity = 0.95;
  /** 可选翻译源列表 */
  private _sources: Array<{ id: string; name: string }> = [];
  /** 当前激活的翻译源 id */
  private _activeSourceId = '';
  /** 翻译方向 */
  private _targetLang = 'zh';
  private _sourceLang = 'auto';

  get targetLang(): string { return this._targetLang; }
  get sourceLang(): string { return this._sourceLang; }

  setLangs(from: string, to: string): void {
    this._sourceLang = from || 'auto';
    this._targetLang = to || 'zh';
  }

  // ── 卡片尺寸 ──
  private _width = 320;
  private _maxHeight = 0; // px 值，0 表示使用 CSS 默认（60vh）

  // ── 拖拽状态 ──
  private _drag: { sx: number; sy: number; ox: number; oy: number } | null = null;
  private _dragMoved = false;
  private _onDragMove_bound = (e: MouseEvent) => this._onDragMove(e);
  private _onDragEnd_bound = () => this._onDragEnd();

  // ── 调尺寸状态 ──
  private _resize: { sx: number; sy: number; ow: number; oh: number } | null = null;
  private _onResizeMove_bound = (e: MouseEvent) => this._onResizeMove(e);
  private _onResizeEnd_bound = () => this._onResizeEnd();

  constructor() {
    super(CSS);
    this._maxHeight = Math.min(window.innerHeight * 0.6, window.innerHeight - 16);
    this.update();
  }

  protected template() {
    if (this.loading) {
      return html`<div class="bubble"><div class="state"><span class="dots"></span><span class="loading">翻译中…</span></div></div>`;
    }
    if (this.error) {
      return html`<div class="bubble">
        <div class="state"><span class="error">${this.error}</span></div>
        <div class="divider"></div>
        <div class="actions">
          <button class="expand" @click=${() => this.emit('retry-translate')} style="margin-left:0">
            ${iconRetry} 重试
          </button>
        </div>
      </div>`;
    }
    if (!this.translation) return nothing;

    const t = this.translation;
    const showOrig = t.text !== this._originalWord;
    const bubbleStyle = `width:${this._width}px;max-height:${this._maxHeight}px`;

    return html`<div class="bubble ${this.pinned ? 'pinned' : ''}" style="${bubbleStyle}">
      <div class="meta" @mousedown=${(e: MouseEvent) => this._onDragStart(e)}>
        <span class="sig">${this._sig || ''}</span>
        <span class="grip" title="拖拽移动卡片"></span>
        <span class="chip">${t.source}</span>
      </div>
      <div class="body">
        ${showOrig ? html`<div class="orig">${this._originalWord}</div>` : nothing}
        ${t.phonetic ? html`<div class="phon">/${t.phonetic}/</div>` : nothing}
        <div class="trans">${t.text}</div>
      </div>
      <div class="divider"></div>
      <div class="actions">
        <button class="iconbtn" title="朗读" @click=${() => this.emit('speak-word', { word: this._originalWord })}>${iconSpeak}</button>
        <button class="iconbtn ${this.isFavorited ? 'on' : ''}" title="收藏" @click=${() => this._toggleFavorite()}>${iconStar}</button>
        <button class="iconbtn" title="设置" @click=${(e: Event) => this._openSettings(e)}>${iconSettings}</button>
        <button class="iconbtn ${this.pinned ? 'pinned-on' : ''}" title="${this.pinned ? '已固定 · 点击解固' : '固定卡片 · 点页面其他地方不会关'}" @click=${() => this._togglePin()}>${iconPin}</button>
        <button class="expand" title="展开详情" @click=${() => this.emit('expand-detail')}>详情 ${iconChevronRight}</button>
      </div>
      <div class="resize-handle" title="拖拽调整卡片尺寸" @mousedown=${(e: MouseEvent) => this._onResizeStart(e)}></div>
    </div>
    ${this._showSettings ? this._settingsPopTemplate() : nothing}`;
  }

  show(originalWord: string, trans: TranslationResult, anchorRect: DOMRect, sig = '', isFavorited = false) {
    this._originalWord = originalWord;
    this.translation = trans;
    this._sig = sig;
    this.error = '';
    this.loading = false;
    this.pinned = false;
    this.isFavorited = isFavorited;
    this.setVisible(true);
    this.update();
    this._position(anchorRect);
  }

  setLoading(anchorRect: DOMRect) {
    this.loading = true;
    this.error = '';
    this.translation = null;
    this.pinned = false;
    this.setVisible(true);
    this.update();
    this._position(anchorRect);
  }

  setError(msg: string, anchorRect: DOMRect) {
    this.error = msg;
    this.loading = false;
    this.pinned = false;
    this.setVisible(true);
    this.update();
    this._position(anchorRect);
  }

  hide() {
    this.pinned = false;
    this.setVisible(false);
    this.translation = null;
    this.loading = false;
    this.error = '';
    this.update();
  }

  /** 外接恢复尺寸（content script 从 storage 读出后调用） */
  restoreDimensions(w: number, maxH: number): void {
    if (w >= MIN_W && w <= MAX_W) this._width = w;
    if (maxH >= MIN_H) this._maxHeight = maxH;
  }

  /** 当前字号缩放值（--font-size-xl px） */
  get fontScale(): number { return this._fontScale; }

  /** 从外部同频字号（content script 统一所有组件时调用） */
  applyFontSize(size: 'small' | 'medium' | 'large'): void {
    this.setFontSize(size);
    this._fontScale = this._readScaleFromDom();
    this.update();
  }

  /** 从外部直接设定滑条值 */
  applyFontScale(value: number): void {
    this._fontScale = Math.round(Math.max(12, Math.min(32, value)));
    super.applyFontScale(this._fontScale);
    this.update();
  }

  // ── 拖拽 ──
  /* eslint-disable @typescript-eslint/member-ordering */
  private _onDragStart(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('a') || target.closest('.resize-handle')) return;
    const rect = this.el.getBoundingClientRect();
    this._drag = { sx: e.clientX, sy: e.clientY, ox: rect.left, oy: rect.top };
    this._dragMoved = false;
    document.addEventListener('mousemove', this._onDragMove_bound);
    document.addEventListener('mouseup', this._onDragEnd_bound);
  }

  private _onDragMove(e: MouseEvent) {
    if (!this._drag) return;
    const dx = e.clientX - this._drag.sx, dy = e.clientY - this._drag.sy;
    // Only start dragging after 5px threshold to avoid accidental micro-drags
    if (!this._dragMoved && Math.abs(dx) < 5 && Math.abs(dy) < 5) return;
    this._dragMoved = true;
    const m = 8;
    const w = this.el.offsetWidth || 320, h = this.el.offsetHeight || 160;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = this._drag.ox + dx, top = this._drag.oy + dy;
    if (left < m) left = m;
    if (top < m) top = m;
    if (left + w > vw - m) left = vw - w - m;
    if (top + h > vh - m) top = vh - h - m;
    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  private _onDragEnd() {
    document.removeEventListener('mousemove', this._onDragMove_bound);
    document.removeEventListener('mouseup', this._onDragEnd_bound);
    // Only auto-pin if the card was actually dragged (not just a click with micro-movement)
    if (this._drag && this._dragMoved) this.pinned = true;
    this._drag = null;
    this._dragMoved = false;
    this.update();
  }
  /* eslint-enable @typescript-eslint/member-ordering */

  // ── 调尺寸 ──
  /* eslint-disable @typescript-eslint/member-ordering */
  private _onResizeStart(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    // 量真实 DOM 里的 .bubble 尺寸
    const shadow = this.el.shadowRoot;
    const bubble = shadow?.querySelector('.bubble') as HTMLElement | null;
    const w = bubble?.offsetWidth ?? this._width;
    const h = bubble?.offsetHeight ?? this._maxHeight;
    this._resize = { sx: e.clientX, sy: e.clientY, ow: w, oh: h };
    document.addEventListener('mousemove', this._onResizeMove_bound);
    document.addEventListener('mouseup', this._onResizeEnd_bound);
  }

  private _onResizeMove(e: MouseEvent) {
    if (!this._resize) return;
    const dx = e.clientX - this._resize.sx;
    const dy = e.clientY - this._resize.sy;
    const vw = window.innerWidth, vh = window.innerHeight;
    this._width = Math.max(MIN_W, Math.min(MAX_W, Math.min(this._resize.ow + dx, vw - 16)));
    this._maxHeight = Math.max(MIN_H, Math.min(this._resize.oh + dy, vh - 16));
    this.update();
  }

  private _onResizeEnd() {
    document.removeEventListener('mousemove', this._onResizeMove_bound);
    document.removeEventListener('mouseup', this._onResizeEnd_bound);
    // 拖过尺寸 = 想自己控制，自动固定
    if (this._resize) this.pinned = true;
    this._resize = null;
    this.update();
    this.emit('resize-end', { width: this._width, maxHeight: this._maxHeight });
  }
  /* eslint-enable @typescript-eslint/member-ordering */

  // ── 字号滑条 ──
  private _onSliderInput(e: Event) {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (isNaN(val)) return;
    this._fontScale = val;
    this.applyFontScale(val);
    this.emit('font-size-change', { scale: val });
  }

  private _readScaleFromDom(): number {
    const v = this.el.style.getPropertyValue('--font-size-xl');
    return parseInt(v, 10) || 20;
  }

  // ── 设置浮窗拖拽 ──
  private _setDrag: { sx: number; sy: number; ox: number; oy: number } | null = null;
  private _onSetDragMove_bound = (e: MouseEvent) => this._onSetDragMove(e);
  private _onSetDragEnd_bound = () => this._onSetDragEnd();

  /* eslint-disable @typescript-eslint/member-ordering */
  private _onSetDragStart(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('button')) return;
    const pop = this.el.shadowRoot?.querySelector('.settings-pop') as HTMLElement | null;
    if (!pop) return;
    const r = pop.getBoundingClientRect();
    this._setDrag = { sx: e.clientX, sy: e.clientY, ox: r.left, oy: r.top };
    document.addEventListener('mousemove', this._onSetDragMove_bound);
    document.addEventListener('mouseup', this._onSetDragEnd_bound);
  }

  private _onSetDragMove(e: MouseEvent) {
    if (!this._setDrag) return;
    const pop = this.el.shadowRoot?.querySelector('.settings-pop') as HTMLElement | null;
    if (!pop) return;
    const m = 8;
    const dx = e.clientX - this._setDrag.sx, dy = e.clientY - this._setDrag.sy;
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = this._setDrag.ox + dx, top = this._setDrag.oy + dy;
    const w = pop.offsetWidth, h = pop.offsetHeight;
    if (left < m) left = m;
    if (top < m) top = m;
    if (left + w > vw - m) left = vw - w - m;
    if (top + h > vh - m) top = vh - h - m;
    pop.style.left = `${left}px`;
    pop.style.top = `${top}px`;
  }

  private _onSetDragEnd() {
    document.removeEventListener('mousemove', this._onSetDragMove_bound);
    document.removeEventListener('mouseup', this._onSetDragEnd_bound);
    // 回写最终位置
    const pop = this.el.shadowRoot?.querySelector('.settings-pop') as HTMLElement | null;
    if (pop) {
      this._settingsX = parseInt(pop.style.left, 10) || this._settingsX;
      this._settingsY = parseInt(pop.style.top, 10) || this._settingsY;
    }
    this._setDrag = null;
  }
  /* eslint-enable @typescript-eslint/member-ordering */

  // ── 设置面板 ──

  /** 外部注入可选翻译源 */
  setSources(sources: Array<{ id: string; name: string }>, activeId: string): void {
    this._sources = sources;
    this._activeSourceId = activeId;
  }

  /** 关闭设置浮窗；返回 true 表示有关闭动作 */
  closeSettings(): boolean {
    if (!this._showSettings) return false;
    this._showSettings = false;
    this.update();
    return true;
  }

  /** 外部恢复透明度 */
  setOpacity(v: number): void {
    this._opacity = Math.max(0.4, Math.min(1, v));
    this.el.style.setProperty('--card-opacity', String(this._opacity));
  }

  private _openSettings(e: Event): void {
    const btn = e.currentTarget as HTMLElement;
    const r = btn.getBoundingClientRect();
    this._settingsX = r.left;
    this._settingsY = r.bottom + 4;
    this._showSettings = true;
    this.update();
  }

  private _settingsPopTemplate() {
    // 把小浮窗夹在视口内
    const m = 8, vw = window.innerWidth, vh = window.innerHeight;
    const w = 250, hEst = 180;
    let left = this._settingsX;
    let top = this._settingsY;
    if (left + w > vw - m) left = vw - w - m;
    if (left < m) left = m;
    if (top + hEst > vh - m) top = Math.max(m, this._settingsY - hEst - 8 - (this._settingsY - (this.el.getBoundingClientRect().top)));
    // ↑ 下方放不下就往齿轮上方弹

    return html`<div class="settings-pop" style="left:${left}px;top:${top}px">
      <div class="set-head" @mousedown=${(e: MouseEvent) => this._onSetDragStart(e)}>
        <span class="set-grip" title="拖拽移动"></span>
        <span class="title">${iconSettings} 设置</span>
        <button class="set-close" title="关闭" @click=${() => { this._showSettings = false; this.update(); }}>${iconClose}</button>
      </div>
      <div class="set-body">
        <div class="set-row">
          <div class="set-label"><span>Aa 字体大小</span><span class="val">${this._fontScale}px</span></div>
          <input type="range" class="set-slider" min="12" max="32" .value=${String(this._fontScale)} @input=${(e: Event) => this._onSliderInput(e)} />
        </div>
        <div class="set-row">
          <div class="set-label"><span>◐ 透明度</span><span class="val">${Math.round(this._opacity * 100)}%</span></div>
          <input type="range" class="set-slider" min="40" max="100" .value=${String(Math.round(this._opacity * 100))} @input=${(e: Event) => this._onOpacityInput(e)} />
        </div>
        <div class="set-row">
          <div class="set-label">翻译方向</div>
          <div class="set-dir">
            <select class="set-sel" .value=${this._sourceLang} @change=${(e: Event) => this._onDirChange(e, 'from')}>
              <option value="auto">自动检测</option>
              <option value="en">English</option>
              <option value="zh">中文</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
            </select>
            <span class="set-arrow">→</span>
            <select class="set-sel" .value=${this._targetLang} @change=${(e: Event) => this._onDirChange(e, 'to')}>
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
            </select>
          </div>
        </div>
        ${this._sources.length > 0 ? html`<div class="set-row">
          <div class="set-label">翻译源</div>
          <div class="set-sources">
            ${this._sources.map(s => html`
              <button class="set-src ${s.id === this._activeSourceId ? 'active' : ''}" @click=${() => this._onSourceTab(s.id)}>${s.name}</button>`)}
          </div>
        </div>` : nothing}
      </div>
    </div>`;
  }

  private _onDirChange(e: Event, which: 'from' | 'to'): void {
    const val = (e.target as HTMLSelectElement).value;
    if (which === 'from') this._sourceLang = val;
    else this._targetLang = val;
    this.update();
    this.emit('direction-change', { sourceLang: this._sourceLang, targetLang: this._targetLang });
  }

  private _onOpacityInput(e: Event): void {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    if (isNaN(val)) return;
    this._opacity = val / 100;
    this.el.style.setProperty('--card-opacity', String(this._opacity));
    this.update(); // 刷新百分比显示
    this.emit('opacity-change', { opacity: this._opacity });
  }

  private _onSourceTab(id: string): void {
    if (id === this._activeSourceId) return;
    this._activeSourceId = id;
    this._showSettings = false;
    // 不调 update() — 让 content 那边的 setLoading() 接管，避免旧译文闪一下
    this.emit('switch-source', { sourceId: id });
  }

  private _togglePin() {
    this.pinned = !this.pinned;
    this.update();
  }

  private _position(rect: DOMRect) {
    const gap = 8, margin = 8;
    const vw = window.innerWidth, vh = window.innerHeight;
    const box = this.el.getBoundingClientRect();
    const w = box.width || this._width;
    const h = box.height || 160;

    let left = rect.left;
    if (left + w > vw - margin) left = vw - w - margin;
    if (left < margin) left = margin;

    let top = rect.bottom + gap;
    if (top + h > vh - margin) {
      const above = rect.top - gap - h;
      top = above >= margin ? above : Math.max(margin, vh - h - margin);
    }

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  setFavorited(added: boolean) {
    this.isFavorited = added;
    this.update();
  }

  /** Brief toast message shown inside the bubble */
  showToast(msg: string): void {
    const bubble = this.el.shadowRoot?.querySelector('.bubble');
    if (!bubble) return;
    const existing = bubble.querySelector('.bubble-toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'bubble-toast';
    toast.textContent = msg;
    Object.assign(toast.style, {
      position: 'absolute', bottom: '48px', left: '50%', transform: 'translateX(-50%)',
      background: 'var(--accent-green)', color: '#1a1b26',
      padding: '4px 14px', borderRadius: '12px',
      fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-sm)', fontWeight: '600',
      opacity: '0', transition: 'opacity 200ms var(--syo-ease-out)',
      pointerEvents: 'none', zIndex: '10',
    });
    bubble.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 200);
    }, 1500);
  }

  private _toggleFavorite() {
    this.isFavorited = !this.isFavorited;
    this.update();
    this.emit('toggle-favorite', { word: this._originalWord, translation: this.translation });
  }

}
