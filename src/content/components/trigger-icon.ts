import { LitElement, html, css, unsafeCSS } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import themeCss from '../styles/theme.css?inline';

@customElement('trigger-icon')
export class TriggerIcon extends LitElement {
  @property({ type: Boolean }) visible = false;
  @property({ type: Number }) x = 0;
  @property({ type: Number }) y = 0;

  static styles = [
    // 直接内联 theme CSS
    unsafeCSS(themeCss),
    css`
      :host {
        display: none;
        position: fixed;
        z-index: 2147483646;
      }
      :host([visible]) {
        display: block;
      }
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
    `,
  ];

  render() {
    const style = `left: ${this.x}px; top: ${this.y}px;`;
    return html`
      <div style="${style}">
        <button class="trigger-btn" title="翻译 (Alt+T)" @click="${this._onClick}">
          🔤
        </button>
      </div>
    `;
  }

  _onClick(e: Event) {
    e.stopPropagation();
    this.dispatchEvent(new CustomEvent('trigger-translate', {
      bubbles: true, composed: true,
    }));
  }

  show(x: number, y: number) {
    this.x = x;
    this.y = y;
    // 定位设在宿主 :host 上（position:fixed 的是它，不是内层 div）
    this.style.left = `${x}px`;
    this.style.top = `${y}px`;
    this.visible = true;
  }

  hide() {
    this.visible = false;
  }
}
