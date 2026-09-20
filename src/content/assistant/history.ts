/**
 * 译文历史：卡片记住最近查过的词，支持前后回退。
 *
 * 纯逻辑、无 DOM、无 chrome 依赖，便于 vitest 覆盖。
 *
 * 关键不变式：
 * - 同一「词 + 翻译源」重复翻译只保留最新一条，不产生重复项（换源重译算不同条目）；
 * - 只在内存，刷新页面即清空；
 * - **必须跨 hide() 存活**——滚动、点击页面、Esc、✕ 都不清空它。
 *   卡片现有的 hide() 惯例是「清空一切状态」，历史是那条惯例的唯一例外。
 */

/** 历史容量：够回退即可，避免无上限增长 */
export const HISTORY_LIMIT = 10;

export interface HistoryEntry<T> {
  /** 查的词（原文） */
  word: string;
  /** 翻译源 id；同词换源重译算不同条目 */
  sourceId: string;
  /** 语言签名，如 "EN → ZH"（方向来自响应而非译文载荷，必须一并存下） */
  sig: string;
  /** 译文载荷（TranslationResult），由调用方决定具体类型 */
  payload: T;
}

export class TranslationHistory<T> {
  private entries: HistoryEntry<T>[] = [];
  /** 当前查看位置；-1 表示不在历史里（或历史为空） */
  private cursor = -1;

  get size(): number { return this.entries.length; }
  /** 能否回退到更早的条目 */
  get canBack(): boolean { return this.cursor > 0; }
  /** 能否前进到更新的条目 */
  get canForward(): boolean { return this.cursor >= 0 && this.cursor < this.entries.length - 1; }
  /** 当前位置（1 基，用于「3/10」这类指示）；不在历史里时为 0 */
  get position(): number { return this.cursor < 0 ? 0 : this.cursor + 1; }

  /** 当前正在查看的条目（没有则 null） */
  current(): HistoryEntry<T> | null {
    return this.cursor >= 0 ? this.entries[this.cursor] ?? null : null;
  }

  /**
   * 记一条新译文，并把游标移到它上面。
   * 同「词 + 源」已存在时：更新其载荷与签名并把它移到末尾（最近使用），不新增条目。
   */
  push(word: string, sourceId: string, sig: string, payload: T): void {
    const w = (word ?? '').trim();
    const sid = sourceId ?? '';
    if (!w) return;
    const at = this.entries.findIndex(e => e.word === w && e.sourceId === sid);
    if (at >= 0) {
      const [existing] = this.entries.splice(at, 1);
      existing.payload = payload;
      existing.sig = sig;
      this.entries.push(existing);
    } else {
      this.entries.push({ word: w, sourceId: sid, sig, payload });
      // 超容量时从最老的开始丢
      while (this.entries.length > HISTORY_LIMIT) this.entries.shift();
    }
    this.cursor = this.entries.length - 1;
  }

  /** 回退到上一条；返回该条目，不能回退时返回 null */
  back(): HistoryEntry<T> | null {
    if (!this.canBack) return null;
    this.cursor--;
    return this.current();
  }

  /** 前进到下一条；返回该条目，不能前进时返回 null */
  forward(): HistoryEntry<T> | null {
    if (!this.canForward) return null;
    this.cursor++;
    return this.current();
  }

  /**
   * 游标移出历史（例如用户翻译了一个不在历史里的新词，或手动关闭）。
   * 不清空条目——清空是 clear() 的职责。
   */
  detach(): void {
    this.cursor = -1;
  }

  clear(): void {
    this.entries = [];
    this.cursor = -1;
  }
}
