/**
 * 页面正文采集（薄 DOM 壳）：TreeWalker 逐个文本节点拼接，跳过脚本/导航/页脚等噪声。
 * 所有判断逻辑（截断/token 估算）都在 src/shared/assistant.ts，便于无 DOM 测试。
 */

/** 采集上限：截断发生在更上层，这里只是防止对超长页面做无谓遍历 */
export const MAX_PAGE_CHARS = 60000;

const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS', 'IFRAME', 'VIDEO', 'AUDIO',
  'NAV', 'FOOTER', 'ASIDE', 'HEADER', 'FORM', 'BUTTON', 'SELECT', 'TEXTAREA', 'OPTION',
]);

/** 正文根：优先语义化容器，回落到 body */
function contentRoot(): Element | null {
  return document.querySelector('article, main, [role="main"]') ?? document.body;
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
      if (SKIP_TAGS.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
      if (parent.closest('[aria-hidden="true"], [hidden]')) return NodeFilter.FILTER_REJECT;
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
  const origin = start.nodeType === Node.TEXT_NODE ? start.parentElement : (start as Element | null);
  if (!origin) return '';

  const found: string[] = [];
  let cur: Element | null = origin;
  while (cur && found.length < 3) {
    // 往前找最近的 h1-h3（前兄弟节点本身或其后代里的最后一个标题）
    let prev: Element | null = cur.previousElementSibling;
    while (prev) {
      const heading = /^H[1-3]$/.test(prev.tagName) ? prev : prev.querySelector('h1, h2, h3');
      if (heading) {
        const text = (heading.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60);
        if (text) found.unshift(`${heading.tagName}: ${text}`);
        break;
      }
      prev = prev.previousElementSibling;
    }
    if (found.length > 0) break;
    cur = cur.parentElement;
  }
  return found.join(' > ');
}

export function pageTitle(): string {
  return (document.title || '').trim().slice(0, 200);
}

export function pageUrl(): string {
  return location.href;
}
