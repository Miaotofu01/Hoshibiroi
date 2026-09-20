/**
 * 触发图标点击意图的纯逻辑。
 *
 * 触发图标同时承担「翻译」与「关闭」两件事，靠状态区分：
 * - 卡片上已经是当前选区这个词 → 再点一下是关闭（保留原有的 toggle 手感）；
 * - 选区换成了别的词 → 翻译新词。
 *
 * 后者曾经是坏的：旧实现只看「有没有译文」，于是卡片开着时选中第二个词再点「译」
 * 会把卡片关掉，新选的词永远不被翻译，用户必须重新划词再点一次。
 *
 * 无 DOM、无 chrome 依赖，便于测试。
 */

export type TriggerIntent = 'translate' | 'close';

export interface TriggerState {
  /** 当前是否有译文卡片 */
  hasCard: boolean;
  /** 卡片上显示的是哪个词 */
  displayedWord: string;
  /** 当前页面选区文字；没有选区时传 null */
  selectionText: string | null;
}

export function triggerIntent(state: TriggerState): TriggerIntent {
  if (!state.hasCard) return 'translate';
  const sel = (state.selectionText ?? '').trim();
  // 没有选区却看得到触发图标是异常状态（图标只在划词后出现），此时关闭最不意外
  if (!sel) return 'close';
  return sel === state.displayedWord ? 'close' : 'translate';
}
