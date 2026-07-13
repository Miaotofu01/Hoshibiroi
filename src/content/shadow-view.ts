import { render, nothing, type TemplateResult } from 'lit';
import themeCss from './styles/theme.css?inline';

/**
 * Content script 的隔离世界里 window.customElements 为 null，无法用 Lit 的
 * 自定义元素（@customElement / LitElement）。但 Element.attachShadow 和
 * lit-html 的 render() 在隔离世界里可用。本基类用这两者搭一个"伪组件"：
 * - this.el      宿主 div（外部 append 到页面、并在它上监听事件）
 * - Shadow DOM   样式隔离（<style> 注入 theme + 组件 CSS）
 * - update()     用 lit-html 把 template() 渲染进容器
 *
 * 子类实现 template()，并在状态变化后调用 update()。
 */
export abstract class ShadowView {
  /** 宿主元素：挂到页面上、并作为事件目标 */
  readonly el: HTMLElement;
  private readonly _container: HTMLElement;

  constructor(componentCss: string) {
    this.el = document.createElement('div');
    const root = this.el.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    // :host 默认隐藏，显隐由 setVisible() 通过宿主 inline style 控制；
    // 容器 display:contents 使其布局透明，子内容如同直接挂在 :host 下。
    style.textContent = `${themeCss}\n:host{display:none}\n.tr-container{display:contents}\n${componentCss}`;
    root.appendChild(style);

    this._container = document.createElement('div');
    this._container.className = 'tr-container';
    root.appendChild(this._container);
  }

  /** 子类返回要渲染的 lit-html 模板（无内容时返回 nothing） */
  protected abstract template(): TemplateResult | typeof nothing;

  /** 重新渲染当前模板 */
  protected update(): void {
    render(this.template(), this._container);
  }

  /** 派发一个可穿透 Shadow DOM 的自定义事件 */
  protected emit(type: string, detail?: unknown): void {
    this.el.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true, detail }));
  }

  /** 显隐：用宿主 inline style 覆盖 :host{display:none} */
  protected setVisible(visible: boolean): void {
    this.el.style.display = visible ? 'block' : 'none';
  }

  /** 设置字体大小（small / medium / large），通过 CSS 变量落到子组件 */
  setFontSize(size: 'small' | 'medium' | 'large'): void {
    const map: Record<string, number> = { small: 15, medium: 20, large: 26 };
    this.applyFontScale(map[size] ?? 20);
  }

  /** 用滑条值（--font-size-xl 的 px 值）等比缩放所有字号 */
  applyFontScale(xlPx: number): void {
    const xl = Math.round(Math.max(12, Math.min(32, xlPx)));
    this.el.style.setProperty('--font-size-xl', `${xl}px`);
    this.el.style.setProperty('--font-size-lg', `${Math.round(xl * 0.8)}px`);
    this.el.style.setProperty('--font-size-base', `${Math.round(xl * 0.7)}px`);
    this.el.style.setProperty('--font-size-sm', `${Math.round(xl * 0.6)}px`);
  }
}
