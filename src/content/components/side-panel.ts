import { html, nothing } from 'lit';
import type { TranslationResult, GrammarAnalysis } from '../../shared/types';
import { ShadowView } from '../shadow-view';
import { iconLanguages, iconSpeakSm, iconStar, iconCopy, iconClose } from '../icons';

const CSS = `
  :host {
    position: fixed; top: 0; right: 0; width: 380px; max-width: 100vw; height: 100vh;
    z-index: 2147483647;
    background: var(--bg-primary);
    border-left: 1px solid var(--border);
    box-shadow: -8px 0 40px rgba(0,0,0,.45);
    font-family: var(--font-family);
    color: var(--text-primary);
    overflow-y: auto;
    animation: slideIn .25s ease;
    opacity: var(--card-opacity, 1);
    transition: transform .2s ease, opacity .2s ease;
  }
  @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
  .closing { transform: translateX(100%); opacity: 0; }

  .panel { padding: 22px 22px 26px; min-height: 100%; display: flex; flex-direction: column; }

  .phead { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
  .brand {
    display: flex; align-items: center; gap: 8px;
    font-family: var(--font-mono); font-size: var(--font-size-sm); letter-spacing: .16em; text-transform: uppercase;
    color: var(--text-muted);
  }
  .brand svg { width: 14px; height: 14px; color: var(--color-info); }
  .closebtn {
    width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center;
    border-radius: var(--radius-sm); border: 1px solid var(--border);
    background: transparent; color: var(--text-secondary); cursor: pointer; transition: var(--transition);
  }
  .closebtn:hover { background: var(--color-info-red); border-color: var(--color-info-red); color: #1a1b26; }
  .closebtn svg { width: 14px; height: 14px; }

  .headword { display: flex; align-items: flex-end; gap: 12px; margin-bottom: 4px; }
  .headword .w { font-family: var(--font-mono); font-size: var(--font-size-xl, 26px); font-weight: 600; color: var(--text-primary); word-break: break-word; line-height: 1.15; }
  .play {
    flex-shrink: 0; width: 30px; height: 30px; margin-bottom: 3px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 50%; border: 1px solid var(--border);
    background: transparent; color: var(--color-info); cursor: pointer; transition: var(--transition);
  }
  .play:hover { background: var(--color-info); color: #1a1b26; }
  .play svg { width: 15px; height: 15px; }
  .phonline { font-family: var(--font-mono); font-size: var(--font-size-base); color: var(--text-muted); margin-bottom: 24px; }

  .sect { margin-bottom: 22px; }
  .sect .lbl {
    display: flex; align-items: center; gap: 8px;
    font-family: var(--font-mono); font-size: var(--font-size-sm); letter-spacing: .16em; text-transform: uppercase;
    color: var(--text-muted); margin-bottom: 11px;
  }
  .sect .lbl::after { content: ''; flex: 1; height: 1px; background: var(--border-soft); }

  .pos { display: flex; gap: 10px; margin-bottom: 9px; align-items: baseline; }
  .pos .t {
    flex-shrink: 0; font-family: var(--font-mono); font-size: var(--font-size-sm); color: var(--color-accent);
    background: rgba(187,154,247,.1); border: 1px solid rgba(187,154,247,.2);
    padding: 1px 7px; border-radius: 5px;
  }
  .pos .m { font-size: var(--font-size-base); line-height: 1.5; color: var(--text-primary); }

  .ex {
    border-left: 2px solid var(--color-info-green); background: var(--bg-secondary);
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0; padding: 10px 14px; margin-bottom: 9px;
  }
  .ex .o { font-size: var(--font-size-base); color: var(--text-primary); margin-bottom: 4px; line-height: 1.5; }
  .ex .tr { font-size: var(--font-size-sm); color: var(--text-secondary); line-height: 1.5; }

  .srctabs { display: flex; gap: 6px; flex-wrap: wrap; }
  .srctab {
    font-family: var(--font-mono); font-size: var(--font-size-sm); padding: 5px 11px; border-radius: 6px;
    background: transparent; border: 1px solid transparent; color: var(--text-muted);
    cursor: pointer; transition: var(--transition);
  }
  .srctab:hover { background: var(--bg-hover); color: var(--text-secondary); }
  .srctab.active { background: rgba(158,206,106,.14); color: var(--color-info-green); border-color: rgba(158,206,106,.3); }
  .srctab.loading { opacity: .5; cursor: default; }

  .pfoot {
    margin-top: auto; padding-top: 18px; border-top: 1px solid var(--border-soft);
    display: flex; gap: 8px;
  }
  .fbtn {
    flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px;
    height: 36px; border-radius: var(--radius-sm);
    background: var(--bg-secondary); border: 1px solid var(--border);
    color: var(--text-secondary); font-family: var(--font-family); font-size: var(--font-size-base);
    cursor: pointer; transition: var(--transition);
  }
  .fbtn:hover { background: var(--bg-hover); color: var(--text-primary); }
  .fbtn.on { color: var(--color-info-yellow); border-color: rgba(224,175,104,.4); }
  .fbtn.on svg { fill: var(--color-info-yellow); }
  .fbtn.copied { color: var(--color-info-green); border-color: rgba(158,206,106,.4); }
  .fbtn svg { width: 15px; height: 15px; }
`;

export class SidePanel extends ShadowView {
  translation: TranslationResult | null = null;
  private _originalWord = '';
  private _isFavorited = false;
  private _copied = false;
  private _copiedTimer: ReturnType<typeof setTimeout> | null = null;
  private _sources: Array<{ id: string; name: string }> = [];
  private _activeSourceId = '';
  private _switchingId = '';
  /** 语法分析状态 */
  private _grammarLoading = false;
  private _grammar: GrammarAnalysis | null = null;
  private _grammarError = '';

  constructor() {
    super(CSS);
    this.update();
  }

  protected template() {
    const t = this.translation;
    if (!t) return nothing;

    const meanings = t.partsOfSpeech && t.partsOfSpeech.length > 0
      ? t.partsOfSpeech.map(pos => html`
          <div class="pos"><span class="t">${pos.type}</span><span class="m">${pos.meanings.join('；')}</span></div>`)
      : html`<div class="pos"><span class="m">${t.text}</span></div>`;

    return html`<div class="panel">
      <div class="phead">
        <span class="brand">${iconLanguages} 翻译详情</span>
        <button class="closebtn" title="关闭" @click=${() => this.hide()}>${iconClose}</button>
      </div>

      <div class="headword">
        <span class="w">${this._originalWord}</span>
        <button class="play" title="朗读" @click=${() => this.emit('speak-word', { word: this._originalWord })}>${iconSpeakSm}</button>
      </div>
      ${t.phonetic ? html`<div class="phonline">/${t.phonetic}/</div>` : html`<div style="height:12px"></div>`}

      <div class="sect">
        <div class="lbl">释义</div>
        ${meanings}
      </div>

      ${t.examples && t.examples.length > 0 ? html`<div class="sect">
        <div class="lbl">例句</div>
        ${t.examples.map(ex => html`
          <div class="ex"><div class="o">${ex.original}</div><div class="tr">${ex.translated}</div></div>`)}
      </div>` : nothing}

      ${this._sources.length > 0 ? html`<div class="sect">
        <div class="lbl">来源 · 点击切换</div>
        <div class="srctabs">
          ${this._sources.map(s => html`
            <button
              class="srctab ${s.id === this._activeSourceId ? 'active' : ''} ${s.id === this._switchingId ? 'loading' : ''}"
              @click=${() => this._onTab(s.id)}>${s.name}</button>`)}
        </div>
      </div>` : nothing}

      ${this._grammarLoading ? html`<div class="sect">
        <div class="lbl">语法分析</div>
        <div style="color:var(--text-muted);font-family:var(--font-mono);font-size:var(--font-size-sm);padding:8px 0">分析中…</div>
      </div>` : this._grammarError ? html`<div class="sect">
        <div class="lbl">语法分析</div>
        <div style="color:var(--color-info-red);font-size:var(--font-size-sm)">${this._grammarError}</div>
      </div>` : this._grammar ? html`<div class="sect">
        <div class="lbl">语法分析</div>
        <div class="gram-structure" style="margin-bottom:12px;font-size:var(--font-size-base);line-height:1.6;color:var(--text-primary)">${this._grammar.structure}</div>
        <div class="gram-tokens" style="margin-bottom:10px">
          ${this._grammar.tokens.map(tk => html`
            <div style="display:flex;align-items:baseline;gap:8px;padding:3px 0;font-size:var(--font-size-sm)">
              <span style="font-family:var(--font-mono);color:var(--text-primary);font-weight:600;min-width:40px">${tk.word}</span>
              <span style="font-family:var(--font-mono);font-size:10px;color:var(--color-accent);background:rgba(187,154,247,.1);border:1px solid rgba(187,154,247,.2);padding:1px 5px;border-radius:4px">${tk.pos}</span>
              ${tk.lemma && tk.lemma !== tk.word ? html`<span style="color:var(--text-muted);font-size:11px">(${tk.lemma})</span>` : nothing}
              <span style="color:var(--text-secondary);margin-left:auto">${tk.role}</span>
            </div>`)}
        </div>
        ${this._grammar.grammarPoints.length > 0 ? html`
          <div style="display:flex;flex-direction:column;gap:6px">
            ${this._grammar.grammarPoints.map(gp => html`
              <div style="background:var(--bg-secondary);border-left:2px solid var(--color-accent);padding:6px 10px;border-radius:0 var(--radius-sm) var(--radius-sm) 0;font-size:var(--font-size-sm);color:var(--text-secondary);line-height:1.5">${gp}</div>`)}
          </div>` : nothing}
      </div>` : nothing}

      <div class="pfoot">
        <button class="fbtn ${this._isFavorited ? 'on' : ''}" @click=${() => this._toggleFavorite()}>
          ${iconStar} ${this._isFavorited ? '已收藏' : '收藏'}
        </button>
        <button class="fbtn ${this._copied ? 'copied' : ''}" @click=${() => this._copy()}>${this._copied ? '已复制' : html`${iconCopy} 复制`}</button>
        ${this._canAnalyze() ? html`
          <button class="fbtn" @click=${() => this._analyzeGrammar('brief')}>语法简析</button>
        ` : nothing}
      </div>
    </div>`;
  }

  show(
    originalWord: string,
    trans: TranslationResult,
    sources: Array<{ id: string; name: string }> = [],
    activeSourceId = '',
  ) {
    this._originalWord = originalWord;
    this.translation = trans;
    this._sources = sources;
    this._activeSourceId = activeSourceId || trans.sourceId || '';
    this._switchingId = '';
    this.setVisible(true);
    this.update();
  }

  /** 换源成功后原地刷新（面板保持打开） */
  applySwitch(trans: TranslationResult, sourceId: string) {
    this.translation = trans;
    this._activeSourceId = sourceId;
    this._switchingId = '';
    this.update();
  }

  /** 换源失败：清掉 loading 态，保留原内容 */
  clearSwitching() {
    this._switchingId = '';
    this.update();
  }

  hide() {
    if (!this.translation) { this.setVisible(false); return; }
    // 滑出动画，动画结束后真隐藏
    const onEnd = () => {
      this.el.removeEventListener('transitionend', onEnd);
      this.setVisible(false);
      this.translation = null;
      this._switchingId = '';
      this._clearGrammar();
      this.update();
    };
    this.el.addEventListener('transitionend', onEnd);
    this.el.classList.add('closing');
    // 安全网：动画 300ms 还没结束就强制收
    setTimeout(() => { this.el.classList.remove('closing'); onEnd(); }, 350);
  }

  setFavorited(val: boolean) {
    this._isFavorited = val;
    this.update();
  }

  // ── 语法分析 ──
  private _canAnalyze(): boolean {
    if (!this._originalWord || this._grammarLoading) return false;
    return this._originalWord.length >= 15 || this._originalWord.includes(' ');
  }

  private _analyzeGrammar(detail: 'brief' | 'full') {
    if (!this._canAnalyze()) return;
    this._grammarLoading = true;
    this._grammar = null;
    this._grammarError = '';
    this.update();
    this.emit('analyze-grammar', { text: this._originalWord, detail });
  }

  setGrammarLoading(): void {
    this._grammarLoading = true;
    this._grammar = null;
    this._grammarError = '';
    this.update();
  }

  setGrammarResult(analysis: GrammarAnalysis): void {
    this._grammarLoading = false;
    this._grammar = analysis;
    this._grammarError = '';
    this.update();
  }

  setGrammarError(msg: string): void {
    this._grammarLoading = false;
    this._grammar = null;
    this._grammarError = msg;
    this.update();
  }

  private _clearGrammar(): void {
    this._grammarLoading = false;
    this._grammar = null;
    this._grammarError = '';
  }

  private _onTab(id: string) {
    if (id === this._activeSourceId || this._switchingId) return;
    this._switchingId = id;
    this.update();
    this.emit('switch-source', { sourceId: id });
  }

  private _toggleFavorite() {
    this._isFavorited = !this._isFavorited;
    this.update();
    this.emit('toggle-favorite', { word: this._originalWord, translation: this.translation });
  }

  private _copy() {
    navigator.clipboard.writeText(this.translation?.text ?? '').then(() => {
      this._copied = true; this.update();
      if (this._copiedTimer) clearTimeout(this._copiedTimer);
      this._copiedTimer = setTimeout(() => { this._copied = false; this.update(); }, 1500);
    }).catch(() => {});
  }
}
