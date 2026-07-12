import { html } from 'lit';
import { ShadowView } from '../shadow-view';

const CSS = `
  :host { position: fixed; z-index: 2147483646; }
  .trigger-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: var(--radius);
    background: var(--bg-secondary);
    border: 1px solid var(--border);
    box-shadow: 0 2px 8px var(--shadow);
    cursor: pointer;
    transition: var(--transition);
    font-size: 16px;
  }
  .trigger-btn:hover {
    background: var(--bg-hover);
    border-color: var(--accent);
    transform: scale(1.05);
  }
`;

export class TriggerIcon extends ShadowView {
  constructor() {
    super(CSS);
    this.update();
  }

  protected template() {
    return html`
      <button class="trigger-btn" title="翻译 (Alt+T)" @click=${(e: Event) => this._onClick(e)}>
        🔤
      </button>
    `;
  }

  private _onClick(e: Event) {
    e.stopPropagation();
    this.emit('trigger-translate');
  }

  show(x: number, y: number) {
    // 定位设在宿主上（:host 是 position:fixed 的元素）
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;
    this.setVisible(true);
  }

  hide() {
    this.setVisible(false);
  }
}
