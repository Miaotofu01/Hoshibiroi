import { html, nothing } from 'lit';
import type { TranslationResult } from '../../shared/types';
import { ShadowView } from '../shadow-view';
import { iconSpeak, iconStar, iconChevronRight, iconRetry, iconPin, iconSettings, iconClose, iconCopy, iconMore } from '../icons';

const MIN_W = 240, MAX_W = 640;
const MIN_H = 120;

/** 弹泡知识区可配置项（id → 设置浮窗里的勾选标签） */
const SECTION_ITEMS: Array<{ id: string; label: string }> = [
  { id: 'pos', label: '释义' },
  { id: 'inflections', label: '词形变化' },
  { id: 'synonyms', label: '同反义词' },
  { id: 'collocations', label: '常用搭配' },
  { id: 'wordRoot', label: '词根词缀' },
  { id: 'usageNote', label: '易混辨析' },
  { id: 'memoryTip', label: '记忆技巧' },
  { id: 'register', label: '语域' },
  { id: 'examples', label: '例句' },
];

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
    background: rgba(13, 17, 23, calc(var(--card-opacity, 1) * 0.82));
    -webkit-backdrop-filter: blur(14px) saturate(140%);
    backdrop-filter: blur(14px) saturate(140%);
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
  :host(.theme-light) .bubble {
    background: rgba(255, 255, 255, calc(var(--card-opacity, 1) * 0.85));
    box-shadow: 0 12px 40px rgba(31, 35, 40, 0.18), 0 3px 10px rgba(31, 35, 40, 0.12);
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

  .body { flex: 1 1 auto; min-height: 0; overflow-y: auto; padding: 10px 14px 12px; font-family: var(--font-display); }
  .body::-webkit-scrollbar { width: 8px; }
  .body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
  .body::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
  .body::-webkit-scrollbar-track { background: transparent; }
  .orig { font-family: var(--font-mono); font-size: var(--font-size-base); color: var(--text-secondary); margin-bottom: 3px; word-break: break-word; }
  .phon { font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--text-muted); margin-bottom: 9px; }
  .trans { font-family: var(--font-display); font-size: var(--font-size-xl, 20px); font-weight: 600; line-height: 1.5; color: var(--text-primary); letter-spacing: .01em; word-break: break-word; white-space: pre-wrap; }

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

  /* ── 溢出菜单（低频操作：设置 / 固定）── */
  .more-wrap { position: relative; }
  .more-menu {
    position: absolute; bottom: calc(100% + 6px); right: 0;
    min-width: 150px;
    background: rgba(22, 27, 34, calc(var(--card-opacity, 1) * 0.95));
    -webkit-backdrop-filter: blur(14px) saturate(140%);
    backdrop-filter: blur(14px) saturate(140%);
    border: 1px solid var(--border);
    border-radius: var(--syo-radius-lg);
    box-shadow: 0 8px 32px rgba(0,0,0,.5);
    padding: 4px;
    z-index: 3;
    animation: popIn 160ms var(--syo-ease-out);
  }
  :host(.theme-light) .more-menu {
    background: rgba(255, 255, 255, calc(var(--card-opacity, 1) * 0.97));
    box-shadow: 0 8px 32px rgba(31, 35, 40, 0.18);
  }
  .more-item {
    display: flex; align-items: center; gap: 8px;
    width: 100%; padding: 7px 10px;
    background: none; border: none; border-radius: var(--syo-radius-sm);
    font-family: var(--font-display); font-size: 13px;
    color: var(--text-secondary); cursor: pointer;
    transition: var(--transition);
  }
  .more-item:hover { background: var(--bg-hover); color: var(--text-primary); }
  .more-item.on { color: var(--syo-cyan); }
  .more-item svg { width: 14px; height: 14px; }

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

  /* ── 知识区块（弹泡内，可在设置浮窗中配置显隐）── */
  .sections { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
  .sec-label {
    display: flex; align-items: center; gap: 8px;
    font-family: var(--font-mono); font-size: calc(var(--font-size-sm) - 1px);
    letter-spacing: .08em; color: var(--text-muted); text-transform: uppercase;
  }
  .sec-label::after { content: ''; flex: 1; height: 1px; background: var(--border-soft); }
  .sec-chips { display: flex; flex-wrap: wrap; gap: 5px; }
  .sec-chip {
    font-family: var(--font-mono); font-size: calc(var(--font-size-sm) - 1px);
    padding: 2px 8px; border-radius: 10px; line-height: 1.5;
    background: var(--bg-secondary); border: 1px solid var(--border);
    color: var(--text-secondary);
  }
  .sec-chip.syn { background: rgba(63,185,80,.1); border-color: rgba(63,185,80,.25); color: var(--accent-green); }
  .sec-chip.ant { background: rgba(248,81,73,.08); border-color: rgba(248,81,73,.25); color: var(--accent-red); }
  .sec-chip.pos { background: rgba(187,154,247,.08); border-color: rgba(187,154,247,.22); color: var(--accent-purple); }
  .posline { display: flex; gap: 8px; align-items: baseline; font-size: var(--font-size-sm); padding: 2px 0; color: var(--text-secondary); }
  .colloc-row { display: flex; align-items: baseline; gap: 10px; font-size: var(--font-size-sm); padding: 2px 0; }
  .colloc-row .pat { font-family: var(--font-mono); color: var(--text-primary); }
  .colloc-row .mea { color: var(--text-muted); margin-left: auto; text-align: right; }
  .sec-note {
    border-left: 2px solid var(--accent-purple); background: var(--bg-secondary);
    border-radius: 0 var(--syo-radius-sm) var(--syo-radius-sm) 0;
    padding: 6px 10px; font-size: var(--font-size-sm); line-height: 1.6;
    color: var(--text-secondary);
  }
  .sec-note.tip { border-left-color: var(--accent-green); }
  .sec-root { font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--accent); line-height: 1.5; }
  .sec .ex {
    border-left: 2px solid var(--accent-green); background: var(--bg-secondary);
    border-radius: 0 var(--syo-radius-sm) var(--syo-radius-sm) 0; padding: 7px 10px; margin-bottom: 6px;
  }
  .sec .ex .o { font-size: var(--font-size-sm); color: var(--text-primary); margin-bottom: 2px; line-height: 1.5; }
  .sec .ex .tr { font-size: calc(var(--font-size-sm) - 1px); color: var(--text-muted); line-height: 1.5; }
  .sec-more { font-size: calc(var(--font-size-sm) - 1px); color: var(--text-muted); font-style: italic; }

  .chip.reg { background: rgba(125,207,255,.1); color: var(--syo-cyan); border-color: rgba(125,207,255,.25); }

  /* ── 设置浮窗：显示内容复选框 ── */
  .set-chks { display: flex; flex-wrap: wrap; gap: 4px 10px; }
  .set-chk {
    display: inline-flex; align-items: center; gap: 5px;
    font-family: var(--font-display); font-size: 12px; color: var(--text-muted);
    cursor: pointer; user-select: none;
  }
  .set-chk input { accent-color: var(--accent); margin: 0; cursor: pointer; }
  .set-chk.on { color: var(--text-secondary); }

  /* ── 设置小浮窗（独立浮层，从齿轮按钮旁弹出）── */
  .settings-pop {
    position: fixed;
    z-index: 2147483648; /* 高于主卡片 */
    width: 250px; max-width: calc(100vw - 24px);
    background: rgba(22, 27, 34, calc(var(--card-opacity, 1) * 0.95));
    -webkit-backdrop-filter: blur(14px) saturate(140%);
    backdrop-filter: blur(14px) saturate(140%);
    border: 1px solid var(--border);
    border-radius: var(--syo-radius-lg);
    box-shadow: 0 8px 32px rgba(0,0,0,.55);
    animation: popIn 200ms var(--syo-ease-out);
  }
  :host(.theme-light) .settings-pop {
    background: rgba(255, 255, 255, calc(var(--card-opacity, 1) * 0.97));
    box-shadow: 0 8px 32px rgba(31, 35, 40, 0.18);
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
  /** 溢出菜单是否展开 */
  private _showMore = false;
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
  /** 弹泡知识区显隐配置（id → 是否显示；缺省全开） */
  private _sections: Record<string, boolean> = {};

  /** 外部注入弹泡知识区配置（content script 从 storage 读出后调用） */
  setSections(sections: Record<string, boolean> | undefined): void {
    this._sections = sections ?? {};
    this.update();
  }

  /** 某知识区是否显示（显式 false 才隐藏） */
  private _secOn(id: string): boolean {
    return this._sections[id] !== false;
  }

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
          <button class="expand" @click=${() => this._openOptions()} title="打开设置页检查翻译源与 API Key">
            ${iconSettings} 去设置
          </button>
        </div>
      </div>`;
    }
    if (!this.translation) return nothing;

    const t = this.translation;
    // 长文本不整体回显原文（折叠成超大块没有意义），仅短文显示
    const showOrig = t.text !== this._originalWord && this._originalWord.length <= 120;
    const bubbleStyle = `width:${this._width}px;max-height:${this._maxHeight}px`;

    return html`<div class="bubble ${this.pinned ? 'pinned' : ''}" style="${bubbleStyle}">
      <div class="meta" @mousedown=${(e: MouseEvent) => this._onDragStart(e)}>
        <span class="sig">${this._sig || ''}</span>
        <span class="grip" title="拖拽移动卡片"></span>
        ${this._secOn('register') && t.register ? html`<span class="chip reg" title="语域">${t.register}</span>` : nothing}
        <span class="chip">${t.source}</span>
      </div>
      <div class="body">
        ${showOrig ? html`<div class="orig">${this._originalWord}</div>` : nothing}
        ${t.phonetic ? html`<div class="phon">/${t.phonetic}/</div>` : nothing}
        <div class="trans">${t.text}</div>
        ${this._sectionsTemplate(t)}
      </div>
      <div class="divider"></div>
      <div class="actions">
        <button class="iconbtn" title="复制译文" @click=${() => this._copyTranslation()}>${iconCopy}</button>
        <button class="iconbtn" title="朗读" @click=${() => this.emit('speak-word', { word: this._originalWord })}>${iconSpeak}</button>
        <button class="iconbtn ${this.isFavorited ? 'on' : ''}" title="收藏" @click=${() => this._toggleFavorite()}>${iconStar}</button>
        <div class="more-wrap">
          <button class="iconbtn ${this._showMore ? 'on' : ''}" title="更多操作" @click=${() => this._toggleMore()}>${iconMore}</button>
          ${this._showMore ? this._moreMenuTemplate() : nothing}
        </div>
        <button class="expand" title="展开详情" @click=${() => this.emit('expand-detail')}>详情 ${iconChevronRight}</button>
      </div>
      <div class="resize-handle" title="拖拽调整卡片尺寸" @mousedown=${(e: MouseEvent) => this._onResizeStart(e)}></div>
    </div>
    ${this._showSettings ? this._settingsPopTemplate() : nothing}`;
  }

  /** 弹泡知识区（按用户配置显隐；LLM 源才有的字段，无值不渲染） */
  private _sectionsTemplate(t: TranslationResult) {
    const hasAny =
      (this._secOn('pos') && !!t.partsOfSpeech?.length)
      || (this._secOn('inflections') && !!t.inflections?.length)
      || (this._secOn('synonyms') && (!!t.synonyms?.length || !!t.antonyms?.length))
      || (this._secOn('collocations') && !!t.collocations?.length)
      || (this._secOn('wordRoot') && !!t.wordRoot)
      || (this._secOn('usageNote') && !!t.usageNote)
      || (this._secOn('memoryTip') && !!t.memoryTip)
      || (this._secOn('examples') && !!t.examples?.length);
    if (!hasAny) return nothing;

    return html`<div class="sections">
      ${this._secOn('pos') && t.partsOfSpeech?.length ? html`<div class="sec">
        <div class="sec-label">释义</div>
        ${t.partsOfSpeech.map(p => html`<div class="posline"><span class="sec-chip pos">${p.type}</span><span>${p.meanings.join('；')}</span></div>`)}
      </div>` : nothing}

      ${this._secOn('inflections') && t.inflections?.length ? html`<div class="sec">
        <div class="sec-label">词形变化</div>
        <div class="sec-chips">${t.inflections.map(i => html`<span class="sec-chip">${i}</span>`)}</div>
      </div>` : nothing}

      ${this._secOn('synonyms') && (t.synonyms?.length || t.antonyms?.length) ? html`<div class="sec">
        <div class="sec-label">同反义词</div>
        <div class="sec-chips">
          ${(t.synonyms ?? []).map(s => html`<span class="sec-chip syn">${s}</span>`)}
          ${(t.antonyms ?? []).map(a => html`<span class="sec-chip ant">${a}</span>`)}
        </div>
      </div>` : nothing}

      ${this._secOn('collocations') && t.collocations?.length ? html`<div class="sec">
        <div class="sec-label">常用搭配</div>
        ${t.collocations.map(c => html`<div class="colloc-row"><span class="pat">${c.pattern}</span><span class="mea">${c.meaning}</span></div>`)}
      </div>` : nothing}

      ${this._secOn('wordRoot') && t.wordRoot ? html`<div class="sec">
        <div class="sec-label">词根词缀</div>
        <div class="sec-root">${t.wordRoot}</div>
      </div>` : nothing}

      ${this._secOn('usageNote') && t.usageNote ? html`<div class="sec">
        <div class="sec-label">易混辨析</div>
        <div class="sec-note">${t.usageNote}</div>
      </div>` : nothing}

      ${this._secOn('memoryTip') && t.memoryTip ? html`<div class="sec">
        <div class="sec-label">记忆技巧</div>
        <div class="sec-note tip">${t.memoryTip}</div>
      </div>` : nothing}

      ${this._secOn('examples') && t.examples?.length ? html`<div class="sec">
        <div class="sec-label">例句</div>
        ${t.examples.slice(0, 2).map(ex => html`<div class="ex"><div class="o">${ex.original}</div><div class="tr">${ex.translated}</div></div>`)}
        ${t.examples.length > 2 ? html`<div class="sec-more">…共 ${t.examples.length} 条，完整见侧栏</div>` : nothing}
      </div>` : nothing}
    </div>`;
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
    this._showSettings = false;
    this._showMore = false;
    this.setVisible(false);
    this.translation = null;
    this.loading = false;
    this.error = '';
    this.update();
  }

  /** 外接重定位（窗口 resize 时按锚点重新摆放；未固定才有效） */
  reposition(anchorRect: DOMRect): void {
    if (this.pinned || this.el.style.display === 'none') return;
    this._position(anchorRect);
  }

  /**
   * 打开扩展设置页（翻译失败时的引导出口）。
   * content script 环境无法直接调用 chrome.runtime.openOptionsPage()，
   * 需由 content/index.ts 转发给 Service Worker 执行。
   */
  private _openOptions(): void {
    this.emit('open-options');
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
    const closed = this._showSettings || this._showMore;
    this._showSettings = false;
    this._showMore = false;
    if (closed) this.update();
    return closed;
  }

  /** 外部恢复透明度 */
  setOpacity(v: number): void {
    this._opacity = Math.max(0.4, Math.min(1, v));
    this.el.style.setProperty('--card-opacity', String(this._opacity));
  }

  private _openSettings(anchorEl: HTMLElement): void {
    const r = anchorEl.getBoundingClientRect();
    this._settingsX = r.left;
    this._settingsY = r.bottom + 4;
    this._showSettings = true;
    this._showMore = false;
    this.update();
  }

  // ── 溢出菜单（低频操作收纳）──

  private _toggleMore(): void {
    this._showMore = !this._showMore;
    this._showSettings = false;
    this.update();
  }

  private _moreMenuTemplate() {
    return html`<div class="more-menu">
      <button class="more-item" title="固定卡片：点页面其他地方不会关" @click=${() => this._togglePin()}>
        ${iconPin}${this.pinned ? '取消固定' : '固定卡片'}
      </button>
      <button class="more-item" title="设置字体、透明度、翻译方向与源" @click=${(e: Event) => this._openSettings(e.currentTarget as HTMLElement)}>
        ${iconSettings}设置
      </button>
    </div>`;
  }

  private _settingsPopTemplate() {
    // 把小浮窗夹在视口内
    const m = 8, vw = window.innerWidth, vh = window.innerHeight;
    const w = 250, hEst = 460;
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
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              <option value="es">Español</option>
            </select>
            <span class="set-arrow">→</span>
            <select class="set-sel" .value=${this._targetLang} @change=${(e: Event) => this._onDirChange(e, 'to')}>
              <option value="zh">中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
              <option value="ko">한국어</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              <option value="es">Español</option>
            </select>
          </div>
        </div>
        <div class="set-row">
          <div class="set-label">弹泡显示内容</div>
          <div class="set-chks">
            ${SECTION_ITEMS.map(s => html`
              <label class="set-chk ${this._secOn(s.id) ? 'on' : ''}">
                <input type="checkbox" .checked=${this._secOn(s.id)} @change=${(e: Event) => this._onSectionToggle(s.id, (e.target as HTMLInputElement).checked)} />
                ${s.label}
              </label>`)}
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

  /** 知识区显隐切换 → 本地重渲染 + 交 content script 持久化 */
  private _onSectionToggle(id: string, on: boolean): void {
    this._sections[id] = on;
    this.update();
    this.emit('sections-change', { sections: { ...this._sections } });
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
    this._showMore = false;
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

  // ── 复制译文 ──
  private _copyTranslation(): void {
    const text = this.translation?.text ?? '';
    if (!text) return;
    const done = () => this.showToast('已复制译文');
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(() => this._legacyCopy(text, done));
    } else {
      this._legacyCopy(text, done);
    }
  }

  /** content script 环境 clipboard API 不可用时的降级复制 */
  private _legacyCopy(text: string, done: () => void): void {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      done();
    } catch {
      this.showToast('复制失败，请手动选择');
    }
  }

}
