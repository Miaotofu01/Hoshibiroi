import { html } from 'lit';
import { ShadowView } from '../shadow-view';
import { iconLanguages } from '../icons';

const CSS = `
  :host { position: fixed; z-index: 2147483646; }
  .trigger {
    display: inline-flex; align-items: center; gap: 6px;
    height: 30px; padding: 0 11px;
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    border-radius: 20px;
    color: var(--accent);
    box-shadow: 0 4px 14px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.02);
    cursor: pointer;
    transition: transform .12s ease, border-color .12s ease, box-shadow .12s ease;
    animation: pop .12s ease;
  }
  .trigger:hover {
    transform: translateY(-1px) scale(1.03);
    border-color: var(--accent);
    box-shadow: 0 6px 18px rgba(0,0,0,.4), 0 0 0 3px rgba(122,162,247,.15);
  }
  .trigger svg { width: 15px; height: 15px; }
  .trigger .lbl {
    font-family: var(--font-mono); font-size: var(--font-size-sm); letter-spacing: .06em;
    color: var(--text-secondary);
  }
  @keyframes pop { from { opacity: 0; transform: scale(.85); } to { opacity: 1; transform: scale(1); } }
`;

export class TriggerIcon extends ShadowView {
  constructor() {
    super(CSS);
    this.update();
  }

  protected template() {
    return html`
      <button class="trigger" title="翻译 (Alt+T)" @click=${(e: Event) => this._onClick(e)}>
        ${iconLanguages}
        <span class="lbl">译</span>
      </button>
    `;
  }

  private _onClick(e: Event) {
    e.stopPropagation();
    this.emit('trigger-translate');
  }

  /** 传入选区矩形，自动决定放左边还是右边 */
  showAtRect(rect: DOMRect) {
    this.setVisible(true);
    const gap = 4, m = 8;
    const box = this.el.getBoundingClientRect();
    const w = box.width || 60, h = box.height || 30;
    const vw = window.innerWidth, vh = window.innerHeight;

    // 优先放选区右边；放不下就放左边
    let left = rect.right + gap;
    if (left + w > vw - m) left = rect.left - gap - w;
    if (left < m) left = m;
    if (left + w > vw - m) left = vw - w - m;

    let top = rect.top;
    if (top + h > vh - m) top = vh - h - m;
    if (top < m) top = m;

    this.el.style.left = `${left}px`;
    this.el.style.top = `${top}px`;
  }

  /** 简单位置（兼容旧调用） */
  show(x: number, y: number) {
    this.showAtRect({ left: x, right: x, top: y, bottom: y } as DOMRect);
  }

  hide() {
    this.setVisible(false);
  }
}
