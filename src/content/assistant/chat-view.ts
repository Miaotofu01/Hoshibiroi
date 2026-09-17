import { html, nothing, type TemplateResult } from 'lit';
// `live` 只在子路径导出（lit 主入口只再导出 lit-html 的 is-server），
// 用它是因为普通绑定只跟「上次提交的值」比对：草稿被外部清空时提交值早已是 ''，
// lit 会跳过赋值，DOM 里的 textarea 与按钮就停在旧状态上。
import { live } from 'lit/directives/live.js';
import type { AssistantController, AssistantFocus } from './controller';
import { QUICK_PROMPTS } from '../../shared/assistant';
import { iconSend, iconStop, iconTrash, iconChevronDown, iconSpeak, iconCopy } from '../icons';

export interface ChatUiState {
  draft: string;
  thinkOpen: boolean;
}

export interface ChatViewHandlers {
  onDraft(text: string): void;
  onAsk(question: string, focus?: AssistantFocus, selection?: string): void;
  onQuick(id: string): void;
  onStop(): void;
  onClear(): void;
  onDeepThink(): void;
  onThinkToggle(): void;
  onSpeak(text: string): void;
  onCopy(text: string): void;
  onOpenSettings(): void;
  /**
   * 把对话搬到侧栏。可选：只有需要这个入口的 surface（弹泡）才提供，
   * 侧栏自己就是这个页签，不给 handler，按钮随之不渲染（不留空操作按钮）。
   */
  onOpenPanel?(): void;
}

export const chatCss = `
  .chat { display: flex; flex-direction: column; min-height: 0; flex: 1 1 auto; }
  .ctx-line {
    display: flex; align-items: center; gap: 6px; flex-wrap: wrap;
    padding: 6px 0 8px; font-family: var(--font-mono, monospace); font-size: 11px; color: var(--syo-fg-muted);
  }
  .ctx-chip {
    padding: 1px 6px; border-radius: 8px;
    background: var(--syo-bg-surface); border: 1px solid var(--syo-border-muted); color: var(--syo-fg-body);
  }
  .ctx-chip.warn { color: var(--syo-warning); border-color: rgba(224,175,104,.35); }
  .ctx-chip.link { cursor: pointer; }
  .ctx-chip.link:hover { color: var(--syo-info); border-color: var(--syo-info); }

  .chat-scroll { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; padding-right: 4px; }
  .chat-scroll::-webkit-scrollbar { width: 8px; }
  .chat-scroll::-webkit-scrollbar-thumb { background: var(--syo-border); border-radius: 4px; }

  .msg { display: flex; flex-direction: column; gap: 6px; }
  .msg .who { font-family: var(--font-mono, monospace); font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: var(--syo-fg-muted); }
  .msg.user .bubble-txt {
    background: var(--syo-bg-elevated); border: 1px solid var(--syo-border-muted);
    border-radius: var(--syo-radius-md); padding: 7px 10px;
    font-size: var(--font-size-sm); line-height: 1.6; color: var(--syo-fg-default); white-space: pre-wrap; word-break: break-word;
  }
  .msg.assistant .bubble-txt {
    font-size: var(--font-size-base); line-height: 1.7; color: var(--syo-fg-default);
    white-space: pre-wrap; word-break: break-word;
  }
  .msg.assistant.error .bubble-txt { color: var(--syo-danger); font-size: var(--font-size-sm); }
  .msg .foot { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono, monospace); font-size: 10px; color: var(--syo-fg-muted); }
  .msg .foot .minibtn {
    display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px;
    background: transparent; border: 1px solid var(--syo-border-muted); border-radius: var(--syo-radius-sm);
    color: var(--syo-fg-muted); cursor: pointer;
  }
  .msg .foot .minibtn:hover { color: var(--syo-info); border-color: var(--syo-info); }
  .msg .foot .minibtn svg { width: 12px; height: 12px; }

  .think { border-left: 2px solid var(--syo-border); padding-left: 8px; }
  .think .head {
    display: inline-flex; align-items: center; gap: 4px; background: none; border: none; cursor: pointer;
    font-family: var(--font-mono, monospace); font-size: 11px; color: var(--syo-fg-muted); padding: 0;
  }
  .think .head:hover { color: var(--syo-fg-body); }
  .think .head svg { width: 12px; height: 12px; transition: transform .15s var(--syo-ease-out); }
  .think .head.open svg { transform: rotate(180deg); }
  .think .body {
    margin-top: 5px; font-size: var(--font-size-sm); line-height: 1.6; color: var(--syo-fg-muted);
    white-space: pre-wrap; word-break: break-word; max-height: 220px; overflow-y: auto;
  }
  .caret { display: inline-block; width: 7px; height: 14px; margin-left: 2px; vertical-align: -2px; background: var(--syo-info); animation: blink 1s steps(2, start) infinite; }
  @keyframes blink { to { visibility: hidden; } }

  /* 快捷提问的容器用对话区专属类名：不能写成 .chips —— 侧栏详情页签的
     词形变化/同反义词也用 .chips，chatCss 拼在它前面，同特异度下这条
     未声明的 padding 会漏进详情视图。chatInput 渲染的 chips 在 .chat 之外
     （弹泡的 .chat-foot / 侧栏的 .panel），所以也不能收窄成 .chat .chips。 */
  .quick-chips { display: flex; flex-wrap: wrap; gap: 5px; padding: 8px 0 0; }
  .chipq {
    font-family: var(--font-display); font-size: 12px; padding: 4px 9px; border-radius: 12px;
    background: transparent; border: 1px solid var(--syo-border); color: var(--syo-fg-body); cursor: pointer;
    transition: color .15s var(--syo-ease-out), background .15s var(--syo-ease-out);
  }
  .chipq:hover { background: var(--syo-bg-elevated); color: var(--syo-fg-default); border-color: var(--syo-info); }
  .chipq:disabled { opacity: .45; cursor: default; }

  .input-row { flex: 0 0 auto; display: flex; align-items: flex-end; gap: 6px; padding-top: 8px; border-top: 1px solid var(--syo-border-muted); margin-top: 8px; }
  .input-row textarea {
    flex: 1 1 auto; resize: none; min-height: 34px; max-height: 120px;
    padding: 8px 10px; border-radius: var(--syo-radius-sm);
    background: var(--syo-bg-surface); border: 1px solid var(--syo-border); color: var(--syo-fg-default);
    font-family: var(--font-display); font-size: var(--font-size-sm); line-height: 1.5; outline: none;
  }
  .input-row textarea:focus { border-color: var(--syo-info); }
  .input-row .send {
    display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; flex-shrink: 0;
    background: rgba(125,207,255,.12); border: 1px solid rgba(125,207,255,.3); border-radius: var(--syo-radius-sm);
    color: var(--syo-info); cursor: pointer;
  }
  .input-row .send:hover { background: rgba(125,207,255,.2); }
  .input-row .send.stop { color: var(--syo-danger); border-color: rgba(248,81,73,.35); background: rgba(248,81,73,.1); }
  .input-row .send svg { width: 15px; height: 15px; }
  .input-tools { display: flex; align-items: center; gap: 6px; padding-top: 6px; }
  .tool {
    display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 10px;
    background: transparent; border: 1px solid var(--syo-border-muted); color: var(--syo-fg-muted);
    font-family: var(--font-display); font-size: 11px; cursor: pointer;
  }
  .tool:hover { color: var(--syo-fg-body); border-color: var(--syo-border); }
  .tool.on { color: var(--syo-accent); border-color: rgba(187,154,247,.4); background: rgba(187,154,247,.1); }
  .tool svg { width: 12px; height: 12px; }
  .hint { font-family: var(--font-mono, monospace); font-size: 10px; color: var(--syo-fg-muted); margin-left: auto; }
`;

/**
 * 用量脚注：↑输入（缓存命中率）↓输出 · 耗时。
 * 错误消息没有用量、被放弃的一轮带的是全零统计（读成「0 tokens」会误导），
 * 两种情况都不出数字；「已停止」由 chatBody 的 foot 统一渲染（正文为空也要显示）。
 */
function statsLine(ctrl: AssistantController): string {
  if (ctrl.lastFinishReason === 'aborted') return '';
  const last = ctrl.session.messages[ctrl.session.messages.length - 1];
  if (!last?.stats || last.error) return '';
  const s = last.stats;
  const cache = s.promptTokens > 0 ? Math.round((s.cachedTokens / s.promptTokens) * 100) : 0;
  const ups = `↑${(s.promptTokens / 1000).toFixed(1)}k${s.promptTokens > 0 ? `（缓存 ${cache}%）` : ''}`;
  return `${ups} ↓${s.answerTokens} · ${(s.elapsedMs / 1000).toFixed(1)}s`;
}

export function quickChips(ctrl: AssistantController, h: ChatViewHandlers): TemplateResult {
  const hasSel = !!ctrl.selection.text;
  return html`<div class="quick-chips">
    ${QUICK_PROMPTS.map(q => html`<button
      class="chipq"
      ?disabled=${ctrl.busy || (q.needsSelection && !hasSel)}
      title=${q.needsSelection && !hasSel ? '先在页面上选中一段文字' : ''}
      @click=${() => h.onQuick(q.id)}>${q.label}</button>`)}
  </div>`;
}

export function chatBody(ctrl: AssistantController, ui: ChatUiState, h: ChatViewHandlers): TemplateResult {
  const ctx = ctrl.contextSummary();
  const empty = ctrl.session.empty;
  return html`<div class="chat">
    <div class="ctx-line">
      <span class="ctx-chip ${ctx.truncated ? 'warn' : ''}" title="注入的页面上下文规模">页面 ${(ctx.chars / 1000).toFixed(1)}k 字 · ≈${(ctx.tokens / 1000).toFixed(1)}k tokens${ctx.truncated ? '（已截取）' : ''}</span>
      ${ctrl.selection.text ? html`<span class="ctx-chip">选中 ${ctrl.selection.text.length} 字</span>` : nothing}
      <span class="ctx-chip link" @click=${() => h.onOpenSettings()}>上下文/思考设置</span>
    </div>

    <div class="chat-scroll">
      ${empty ? html`<div style="color:var(--syo-fg-muted);font-size:var(--font-size-sm);line-height:1.7">
        就这一页向 AI 提问吧${ctrl.selection.text ? '（已带上你选中的内容）' : '（先在页面上选中一段文字，问题会更准）'}。
      </div>` : nothing}

      ${ctrl.session.messages.map((m, i) => {
        const isLast = i === ctrl.session.messages.length - 1;
        const streamingNow = isLast && ctrl.session.streaming && m.role === 'assistant';
        if (m.role === 'user') {
          return html`<div class="msg user"><span class="who">你</span><div class="bubble-txt">${m.content}</div></div>`;
        }
        const stats = isLast ? statsLine(ctrl) : '';
        return html`<div class="msg assistant ${m.error ? 'error' : ''}">
          <span class="who">助手</span>
          ${m.reasoning ? html`<div class="think">
            <button class="head ${ui.thinkOpen ? 'open' : ''}" @click=${() => h.onThinkToggle()}>
              思考过程 · ${m.reasoning.length} 字 ${iconChevronDown}
            </button>
            ${ui.thinkOpen ? html`<div class="body">${m.reasoning}</div>` : nothing}
          </div>` : nothing}
          <div class="bubble-txt">${m.content}${streamingNow ? html`<span class="caret"></span>` : nothing}</div>
          ${(() => {
            // 停止标记只认「最后一轮 + 已被放弃 + 不再流式」：正文为空也要说「已停止」，
            // 否则思考阶段被停下的一轮看起来像什么都没发生。
            const aborted = isLast && ctrl.lastFinishReason === 'aborted' && !streamingNow;
            const withActions = !streamingNow && !m.error && !!m.content;   // 朗读/复制要有正文才有意义
            if (!aborted && !withActions) return nothing;
            return html`<div class="foot">
              ${aborted ? html`<span>已停止</span>` : nothing}
              ${withActions && stats ? html`<span>${stats}</span>` : nothing}
              ${withActions ? html`
                <button class="minibtn" title="朗读答案" @click=${() => h.onSpeak(m.content)}>${iconSpeak}</button>
                <button class="minibtn" title="复制答案" @click=${() => h.onCopy(m.content)}>${iconCopy}</button>` : nothing}
            </div>`;
          })()}
          ${(() => {
            // 结束原因提示：'length' 是撞到输出上限，'incomplete' 是流在没有 [DONE] 的情况下断掉
            // （worker 侧兜底标记）。两者都必须说出来，否则半截回答看起来像完整答案。
            if (!isLast) return nothing;
            const reason = ctrl.lastFinishReason;
            if (reason === 'length') return html`<div class="foot" style="color:var(--syo-warning)">回答达到长度上限被截断，可在设置里调大「回答长度」或在输入框重新追问</div>`;
            if (reason === 'incomplete') return html`<div class="foot" style="color:var(--syo-warning)">连接中断，回答可能不完整，可重新提问</div>`;
            return nothing;
          })()}
        </div>`;
      })}
    </div>

    ${empty ? quickChips(ctrl, h) : nothing}
  </div>`;
}

/**
 * 发送按钮的可用态跟着草稿走。
 * onDraft 故意不触发重渲染（连续输入时重渲染会把光标甩到末尾），
 * 所以草稿变化要在这里就地同步，否则按钮会一直停在渲染时的状态。
 * 只认发送按钮（`?disabled` 绑在它身上）：生成中这个位置是停止按钮，
 * 给它写 disabled 会让停止点不动，而停止按钮没有绑定能在重渲染时纠正。
 */
function syncSendBtn(field: HTMLTextAreaElement): void {
  const send = field.closest('.input-row')?.querySelector<HTMLButtonElement>('.send:not(.stop)');
  if (send) send.disabled = !field.value.trim();
}

export function chatInput(ctrl: AssistantController, ui: ChatUiState, h: ChatViewHandlers): TemplateResult {
  // 草稿不变式：ui.draft 是唯一真源，textarea 的值与发送按钮的可用态都必须跟着它走。
  // 清草稿发生在三处（发送、输入框内 Esc、文档级 Esc → popupBubble.handleEscape），
  // 三处都会重渲染，所以两个绑定都用 live()：它比对的是 DOM 现值而不是上次提交的值，
  // 即使提交值已经是 ''/true，也会强制把 DOM 拉回草稿的样子。
  const onOpenPanel = h.onOpenPanel;   // 提出来收窄：闭包里读 h.onOpenPanel 会丢掉 narrowing
  return html`<div>
    <div class="input-row">
      <textarea
        rows="1"
        placeholder=${ctrl.busy ? '正在回答…' : '就这一页提问，Enter 发送 / Shift+Enter 换行'}
        .value=${live(ui.draft)}
        @input=${(e: Event) => {
          const ta = e.target as HTMLTextAreaElement;
          syncSendBtn(ta);
          h.onDraft(ta.value);
        }}
        @keydown=${(e: KeyboardEvent) => {
          // 只吃自己真正消费掉的键：空草稿时的 Esc 继续冒泡，
          // 让文档级处理（关卡片）照常收到；其余按键不惊动宿主页面快捷键。
          if (e.key === 'Escape') {
            if (!ui.draft) return;                               // 没有可清的草稿 → 交给上层
            e.stopPropagation();
            e.preventDefault();
            const ta = e.target as HTMLTextAreaElement;
            ta.value = '';                                       // 草稿要就地清掉才看得见（onDraft 不重渲染）
            syncSendBtn(ta);
            h.onDraft('');
            return;
          }
          e.stopPropagation();
          if (e.key === 'Enter' && !e.shiftKey) {
            // 输入法合成中（选词/上屏的回车，keyCode 229）不是「发送」：
            // 不提交也不 preventDefault，否则会把回车从输入法手里抢走
            if (e.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            h.onAsk(ui.draft);
          }
        }}
      ></textarea>
      ${ctrl.busy
        ? html`<button class="send stop" title="停止" @click=${() => h.onStop()}>${iconStop}</button>`
        : html`<button class="send" title="发送" ?disabled=${live(!ui.draft.trim())} @click=${() => h.onAsk(ui.draft)}>${iconSend}</button>`}
    </div>
    <div class="input-tools">
      <button class="tool ${ctrl.deepThink ? 'on' : ''}" title="本次会话用最强思考（覆盖设置）" @click=${() => h.onDeepThink()}>深想</button>
      <button class="tool" @click=${() => h.onQuick('summary')} ?disabled=${ctrl.busy}>整页速览</button>
      ${onOpenPanel ? html`<button class="tool" title="在侧栏打开（更长对话）" @click=${() => onOpenPanel()}>侧栏</button>` : nothing}
      <button class="tool" title="清空对话" @click=${() => h.onClear()}>${iconTrash} 清空</button>
      <span class="hint">${ctrl.busy ? '生成中…' : 'Enter 发送'}</span>
    </div>
    ${!ctrl.session.empty ? quickChips(ctrl, h) : nothing}
  </div>`;
}
