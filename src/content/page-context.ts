/**
 * 页面正文采集（薄 DOM 壳）：TreeWalker 逐个文本节点拼接，跳过脚本/导航/页脚等噪声。
 * 所有判断逻辑（截断/token 估算）都在 src/shared/assistant.ts，便于无 DOM 测试。
 */

/** 采集上限：截断发生在更上层，这里只是防止对超长页面做无谓遍历 */
export const MAX_PAGE_CHARS = 60000;

const SKIP_TAGS = [
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'IFRAME', 'VIDEO', 'AUDIO',
  'NAV', 'FOOTER', 'ASIDE', 'HEADER', 'FORM', 'BUTTON', 'SELECT', 'TEXTAREA', 'OPTION',
];

/** 命中的容器连同其后代整体跳过：只比对父元素会漏掉 <nav><div><span> 这类深层嵌套 */
const SKIP_SELECTOR = [...SKIP_TAGS.map(t => t.toLowerCase()), '[aria-hidden="true"]', '[hidden]'].join(',');

/** 语义化正文容器；页面没有这类容器时返回 null */
function semanticRoot(): Element | null {
  return document.querySelector('article, main, [role="main"]');
}

/** 正文根：优先语义化容器，回落到 body */
function contentRoot(): Element | null {
  return semanticRoot() ?? document.body;
}

export function collectPageText(maxChars = MAX_PAGE_CHARS): string {
  const root = contentRoot();
  if (!root) return '';
  const parts: string[] = [];
  let total = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node: Node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      if (parent.closest(SKIP_SELECTOR)) return NodeFilter.FILTER_REJECT;
      return node.nodeValue && node.nodeValue.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = (node.nodeValue ?? '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    parts.push(text);
    total += text.length + 1;
    if (total >= maxChars) break;
  }
  return parts.join('\n').slice(0, maxChars);
}

/** 选中位置最近的标题路径，如 "H2: 安装 > H3: 配置"。找不到返回 '' */
export function headingPath(): string {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return '';
  const start = sel.getRangeAt(0).startContainer;
  // 程序化选区（如 selectNodeContents(document)）的 startContainer 可能是 Document 等非元素节点，
  // 直接对它们取 .closest 会抛 TypeError 并冒泡到询问流程，这里统一降级为 ''
  const origin = start.nodeType === Node.TEXT_NODE
    ? start.parentElement
    : (start instanceof Element ? start : null);
  if (!origin) return '';

  const root = semanticRoot();
  const label = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);

  /** 站名/目录/页脚这类页面噪声里的标题不算章节；
      但正文根内部的 <header>/<aside> 是文章自己的标题区，要算。
      没有语义化正文容器时保守处理：宁可少给一段，也不要标错章节 */
  const isNoise = (el: Element): boolean => {
    const holder = el.closest(SKIP_SELECTOR);
    if (!holder) return false;
    if (!root) return true;
    return !root.contains(holder);
  };

  /** 前一个兄弟节点子树里「文档顺序最后」的标题 = 最近的上一级标题 */
  const nearestHeadingIn = (node: Element): Element | null => {
    if (/^H[1-3]$/.test(node.tagName)) return node;
    const list = node.querySelectorAll('h1, h2, h3');
    return list.length > 0 ? list[list.length - 1] : null;
  };

  // 最内层：选中位置本身落在某个标题里（含标题元素自身）
  const hits: Array<{ level: number; text: string }> = [];
  const own = origin.closest('h1, h2, h3');
  if (own && !isNoise(own)) {
    const text = label(own);
    if (text) hits.push({ level: Number(own.tagName[1]), text });
  }

  // 逐层向上找标题：越靠上层级越高；只保留级别严格递减的，最多 3 层。
  // 同一层必须一路扫到第一个前兄弟为止：更靠前的浅标题仍可能是外层章节，
  // 撞见一个更深的标题就收手会把目录、上一节这类非祖先标题当成章节。
  // 起点用 own 本身而不是它的父元素：选中标题时也要收下它前面的更浅标题，
  // 否则那一层空着，反而让目录这类非祖先标题补位。
  let cur: Element | null = own ?? origin;
  while (cur && hits.length < 3) {
    let prev: Element | null = cur.previousElementSibling;
    while (prev) {
      const heading = nearestHeadingIn(prev);
      if (heading) {
        const text = label(heading);
        const level = Number(heading.tagName[1]);
        // 空标题、站名/目录这类噪声容器里的标题都不算章节，继续往前找，不要就此收手
        if (text && !isNoise(heading) && !hits.some(h => h.level <= level)) {
          hits.push({ level, text });
        }
      }
      prev = prev.previousElementSibling;
    }
    cur = cur.parentElement;
  }
  return hits.reverse().map(h => `H${h.level}: ${h.text}`).join(' > ');
}

export function pageTitle(): string {
  return (document.title || '').trim().slice(0, 200);
}

export function pageUrl(): string {
  return location.href;
}
