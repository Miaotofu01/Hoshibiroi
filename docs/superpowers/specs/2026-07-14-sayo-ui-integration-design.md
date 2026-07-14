# Sayo UI 混合集成 — 设计文档

**日期**：2026-07-14  
**策略**：混合集成 — 沿用 `--syo-*` 令牌体系 + 保留项目自有 class/组件 + 交互层用 Sayo JS API

---

## 动机

当前项目已经有三套不同的 CSS 变量命名空间（vocab/popup 的 GitHub 暗色、content script 的 Tokyo Night、options 的独立调色板），色值实际都对齐 Primer Dark。引入 Sayo UI 的 `--syo-*` 令牌体系统一命名，同时用 Sayo 的交互引擎替换手写的 cursor/toast/dialog。

---

## 范围

### 包含
- **CSS 令牌重命名**：vocab、popup、options、content script 四处的 CSS 变量统一为 `--syo-*`
- **交互层替换**：
  - `src/vocab/effects/cursor.ts` → `Sayo.cursor.init()` + `Sayo.trail.init()`
  - `src/vocab/utils.ts:showToast()` → `Sayo.toast.show()`
  - `src/vocab/utils.ts:showConfirm()` → `Sayo.dialog.confirm()`
  - `src/vocab/panels/settings.ts` — toast/confirm 调用更新
  - `src/vocab/panels/learn.ts` — toast 调用更新
  - `src/vocab/panels/browse.ts` — toast 调用更新
- **sayo.js 引入**：作为项目静态资源复制到 `src/vocab/` 下，在 `index.html` 中以 `<script>` 标签加载

### 不包含
- 不引入 `sayo.css` 组件类（`.syo-btn`、`.syo-card` 等）——保留自定义 class
- 不改变 DOM 结构、面板布局、闪卡逻辑
- Content script Shadow DOM 组件的 class 结构不动
- `trigger-icon.ts`、`shadow-view.ts` 不动

---

## 设计

### 1. CSS 令牌迁移

#### 1a. `vocab/index.html` 和 `popup/index.html`

当前 `:root` 块替换为 Sayo 令牌定义（色值不变，命名对齐）：

```css
:root {
  /* Sayo UI 令牌 — 暗色主题 */
  --syo-bg-base: #0d1117;
  --syo-bg-surface: #161b22;
  --syo-bg-elevated: #1c2129;
  --syo-bg-selection: rgba(31, 111, 235, 0.2);

  --syo-border: #30363d;
  --syo-border-muted: #21262d;

  --syo-fg-default: #e6edf3;
  --syo-fg-body: #c9d1d9;
  --syo-fg-muted: #8b949e;

  --syo-red: #f85149;
  --syo-orange: #f0883e;
  --syo-yellow: #d29922;
  --syo-green: #3fb950;
  --syo-teal: #39d353;
  --syo-cyan: #79c0ff;
  --syo-blue: #58a6ff;
  --syo-purple: #bc8cff;
  --syo-pink: #d2a8ff;

  --syo-danger: var(--syo-red);
  --syo-warning: var(--syo-yellow);
  --syo-success: var(--syo-green);
  --syo-info: var(--syo-blue);
  --syo-accent: var(--syo-purple);
  --syo-secondary: var(--syo-cyan);
  --syo-special: var(--syo-orange);
  --syo-subtle: var(--syo-teal);

  --syo-font-sans: "Inter", "Noto Sans SC", -apple-system, BlinkMacSystemFont, sans-serif;
  --syo-font-mono: "Fira Code", "SF Mono", "Cascadia Code", "JetBrains Mono", monospace;
  --syo-font-size: 15px;
  --syo-line-height: 1.65;

  --syo-space-1: 4px;  --syo-space-2: 8px;   --syo-space-3: 12px;
  --syo-space-4: 16px; --syo-space-5: 20px;  --syo-space-6: 24px;
  --syo-space-8: 32px; --syo-space-10: 40px; --syo-space-12: 48px;

  --syo-radius-sm: 4px;  --syo-radius-md: 6px;
  --syo-radius-lg: 8px;  --syo-radius-full: 999px;

  --syo-ease-elastic: cubic-bezier(0.34, 1.56, 0.64, 1);
  --syo-ease-out: cubic-bezier(0.4, 0, 0.2, 1);
  --syo-ease-spring: cubic-bezier(0.25, 0.46, 0.45, 0.94);

  --syo-trans-color: color 180ms var(--syo-ease-out);
  --syo-trans-spring: transform 250ms var(--syo-ease-elastic), border-color 200ms var(--syo-ease-out), background 200ms var(--syo-ease-out);
  --syo-trans-active: transform 100ms var(--syo-ease-out);

  /* 保留：项目特有的字体变量（Sayo 没有中英文字体分离控制） */
  --font-display: "Inter", "Noto Sans SC", -apple-system, BlinkMacSystemFont, sans-serif;
  --font-body: "Noto Sans SC", "Inter", -apple-system, BlinkMacSystemFont, sans-serif;
}
```

#### 1b. CSS 中所有变量引用更新

全局替换（按顺序，防部分匹配）：

| 搜索 | 替换为 |
|------|--------|
| `var(--bg-base)` | `var(--syo-bg-base)` |
| `var(--bg-surface)` | `var(--syo-bg-surface)` |
| `var(--bg-elevated)` | `var(--syo-bg-elevated)` |
| `var(--fg-default)` | `var(--syo-fg-default)` |
| `var(--fg-body)` | `var(--syo-fg-body)` |
| `var(--fg-muted)` | `var(--syo-fg-muted)` |
| `var(--border-default)` | `var(--syo-border)` |
| `var(--border-muted)` | `var(--syo-border-muted)` |
| `var(--color-info)` | `var(--syo-info)` |
| `var(--color-success)` | `var(--syo-success)` |
| `var(--color-warning)` | `var(--syo-warning)` |
| `var(--color-danger)` | `var(--syo-danger)` |
| `var(--color-accent)` | `var(--syo-accent)` |
| `var(--color-secondary)` | `var(--syo-secondary)` |
| `var(--color-special)` | `var(--syo-special)` |
| `var(--color-subtle)` | `var(--syo-subtle)` |
| `var(--radius-sm)` | `var(--syo-radius-sm)` |
| `var(--radius-md)` | `var(--syo-radius-md)` |
| `var(--radius-lg)` | `var(--syo-radius-lg)` |
| `var(--ease-elastic)` | `var(--syo-ease-elastic)` |
| `var(--ease-out)` | `var(--syo-ease-out)` |
| `var(--ease-in-out)` | `var(--syo-ease-spring)` |

#### 1c. Content Script (`styles/theme.css` + Shadow DOM `:host`)

Content script 的 Shadow DOM 组件中用 `:host {}` 定义 `--syo-*` 变量，与全局 Sayo 令牌保持一致色值：

```css
:host {
  --syo-bg-base: #0d1117;
  --syo-bg-surface: #161b22;
  --syo-bg-elevated: #1c2129;
  --syo-border: #30363d;
  --syo-border-muted: #21262d;
  --syo-fg-default: #e6edf3;
  --syo-fg-body: #c9d1d9;
  --syo-fg-muted: #8b949e;
  --syo-info: #58a6ff;
  --syo-success: #3fb950;
  --syo-warning: #d29922;
  --syo-danger: #f85149;
  --syo-accent: #bc8cff;
  --syo-secondary: #79c0ff;
  --syo-radius-sm: 4px;
  --syo-radius-md: 6px;
  --syo-ease-elastic: cubic-bezier(0.34, 1.56, 0.64, 1);
  --syo-ease-out: cubic-bezier(0.4, 0, 0.2, 1);
}
```

### 2. JS 交互层替换

#### 2a. 光标/光晕/拖尾

**删除**：`src/vocab/effects/cursor.ts`（全部 184 行）  
**删除**：`vocab/index.html` 中的 `#custom-cursor` div 和 `#glow-canvas` canvas 元素

**替换**：在 `vocab/index.ts` 中：
```typescript
// 声明 Sayo 全局类型
declare global {
  const Sayo: typeof import('../../sayo-ui/sayo.d.ts')['Sayo'];
}

function switchPanel(panel: string): void {
  // ... 面板切换逻辑 ...
  if (panel === 'learn' || panel === 'stats') {
    Sayo.cursor.init({ accentR: 88, accentG: 166, accentB: 255 }); // #58a6ff
    Sayo.trail.init();
  } else {
    Sayo.cursor.destroy();
    Sayo.trail.destroy();
  }
}
```

#### 2b. Toast

**删除**：`utils.ts` 中 `showToast()` 函数

**替换**：所有调用点改为：
```typescript
// 之前：showToast('设置已保存')
// 之后：
Sayo.toast.show('设置已保存', { type: 'success' });

// 之前：showToast('操作失败')
// 之后：
Sayo.toast.show('操作失败', { type: 'error', duration: 6000 });
```

**涉及文件**：
- `src/vocab/panels/settings.ts` — 保存成功/清除成功 toast
- `src/vocab/panels/learn.ts` — 发音失败 toast
- `src/vocab/panels/browse.ts` — 删除成功 toast

#### 2c. 确认弹窗

**删除**：`utils.ts` 中 `showConfirm()` 函数及 `modal-overlay` 相关 CSS

**替换**：
```typescript
// 之前：const ok = await showConfirm('清除全部数据', '此操作不可恢复...', true)
// 之后：
const ok = await Sayo.dialog.confirm({
  title: '清除全部数据',
  message: '此操作不可恢复，所有生词和复习记录将被永久删除。',
  confirmText: '确认清除',
  cancelText: '取消',
});
```

### 3. 构建集成

#### 3a. sayo.js 引入

复制 `sayo.js` 到 `src/vocab/sayo.js`，在 `index.html` 中通过 `<script>` 标签加载：

```html
<script src="sayo.js"></script>
```

Vite 的 `additionalInputs` 已包含 `src/vocab/index.html`，构建时 `sayo.js` 会作为静态资源复制到 `dist/src/vocab/`。

注意：`sayo.js` 是 IIFE 格式，不能通过 ES import 引入。作为 `<script>` 标签加载后，`window.Sayo` 全局可用。在 TypeScript 中通过 `declare` 声明类型。

#### 3b. 不需要 npm 依赖

Sayo UI 零依赖，不需要修改 `package.json`。

### 4. 删除清单

| 文件/代码 | 操作 |
|-----------|------|
| `src/vocab/effects/cursor.ts` | 删除整文件 |
| `vocab/index.html` — `#custom-cursor` div | 删除 DOM 元素 |
| `vocab/index.html` — `#glow-canvas` canvas | 删除 DOM 元素 |
| `vocab/index.html` — cursor/glow 相关 CSS 规则 | 删除 |
| `vocab/index.html` — `modal-overlay` / `modal-box` CSS | 删除（Sayo dialog 自带） |
| `utils.ts` — `showToast()` 函数 | 删除 |
| `utils.ts` — `showConfirm()` 函数 | 删除 |
| `vocab/index.ts` — `mountCursor`/`unmountCursor` import | 删除 |

### 5. 不变清单

- `shadow-view.ts` 基类
- `popup-bubble.ts` — Shadow DOM 内部 toast（局部 UI 反馈，不是全局通知）
- `side-panel.ts`
- `trigger-icon.ts`
- 所有自定义 class 名（`.fc-card`、`.rate-btn`、`.nav-tab`、`.word-card` 等）
- 面板 DOM 结构、闪卡逻辑、SRS 算法
- Content script 的 lit-html 渲染模式

### 6. 验证

1. `npm run build` — 确认构建通过
2. 加载扩展到 Chrome，验证：
   - Vocab 页面：光标 + 光晕 + 拖尾正常工作
   - Toast 通知：保存设置/删除单词后正常弹出
   - Dialog：清除全部数据时确认弹窗正常
   - Popup：样式正常，颜色正确
   - 划词翻译：content script 弹窗样式正常
3. `prefers-reduced-motion: reduce` 下：光标圆环仍出现，光晕和拖尾静默跳过
