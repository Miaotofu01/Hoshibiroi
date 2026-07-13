# 生词本 UI 重设计 — 设计规格说明书

> 状态：待实现  
> 日期：2026-07-13  
> 版本：v1.0

---

## 一、设计目标

将划词翻译的生词本页面重构为该项目的核心卖点。融合三种设计源：

| 来源 | 贡献 |
|------|------|
| **不背单词** | 极简审美、单词主角、会话内循环复习、三档评分 |
| **Anki** | 可定制卡片模板、SM-2 间隔重复、丰富统计面板 |
| **GitHub Primer Dark + osu!** | 配色体系、布局风格、弹性物理交互 |

## 二、配色体系

### CSS 变量定义

```css
:root {
  /* 底色层 */
  --bg-base: #0d1117;
  --bg-surface: #161b22;
  --bg-elevated: #1c2129;
  --bg-selection: rgba(31,111,235,0.2);

  /* 文字层 */
  --fg-default: #e6edf3;
  --fg-body: #c9d1d9;
  --fg-muted: #8b949e;

  /* 边框 */
  --border-default: #30363d;
  --border-muted: #21262d;

  /* 功能色 */
  --accent: #58a6ff;
  --accent-success: #3fb950;
  --accent-warning: #d29922;
  --accent-danger: #f85149;
  --accent-purple: #bc8cff;
  --accent-secondary: #79c0ff;

  /* 形状 */
  --radius: 6px;
  --radius-sm: 4px;
  --radius-lg: 8px;

  /* 字体 */
  --font-sans: "Inter", "SF Pro Display", -apple-system, "Noto Sans SC", "PingFang SC", sans-serif;
  --font-mono: "Fira Code", "SF Mono", "Cascadia Code", "JetBrains Mono", monospace;

  /* 缓动 */
  --ease-elastic: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-out: cubic-bezier(0.25, 0.46, 0.45, 0.94);

  /* 字号 */
  --text-micro: 11px;
  --text-sm: 12px;
  --text-base: 14px;
  --text-lg: 16px;
  --text-xl: 20px;
  --text-display: 56px;
}
```

### 功能色语义约定

| 颜色 | 用途 |
|------|------|
| `--accent`（蓝） | 主操作、链接、选中态、进度条 |
| `--accent-success`（绿） | 成功、掌握、认识按钮 |
| `--accent-warning`（橙） | 模糊、待处理、提醒 |
| `--accent-danger`（红） | 不认识、删除、错误 |
| `--accent-purple`（紫） | 词性标签、元信息 |
| `--accent-secondary`（浅蓝） | 辅助高亮、次要强调 |

---

## 三、整体布局

### 页面结构

```
┌──────────────────────────────────────────────────────┐
│  导航栏：[学习] [词库] [统计]                  [⚙ 设置]│
│──────────────────────────────────────────────────────│
│                                                      │
│                   面板区域（全屏切换）                  │
│                   max-width: 860px                    │
│                   margin: 0 auto                      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 布局规则

- 容器 `max-width: 860px`，居中
- 区块用 `1px solid var(--border-default)` 分隔，不用阴影
- 圆角 4-6px，不超 8px
- 三层深度：base → surface → elevated
- 响应式断点：768px，移动端导航栏收缩为图标

### 导航栏

- 底部 `2px solid var(--accent)` 指示当前 tab
- 非激活 tab 颜色 `--fg-muted`，hover 变 `--fg-body`
- 复习 tab 旁显示到期数量 badge
- 设置齿轮独立于 tab 系统，点击打开右侧抽屉
- 字体 `--font-mono` + `letter-spacing: .04em`

---

## 四、面板一：学习面板

### 4.1 学习流程

借鉴不背单词的核心机制：**会话内循环重复**。

```
今天要学的词（新词 N 个 + 到期复习词 M 个）
        │
        ▼
   ┌─────────────┐
   │ 看词 → 点击翻转│
   │ → 判断        │
   └──────┬──────┘
          │
   ┌──────┼──────┐
   ▼      ▼      ▼
 不认识   模糊   认识
   │      │      │
   ▼      ▼      ▼
 插回队列 插回队尾  毕业
 (等2词) (等5词)  → SM-2 调度
   │      │
   └──────┘
   再次出现（循环到毕业或跳过）
```

### 4.2 三档评分

| 按钮 | 含义 | SM-2 quality | 会话内行为 |
|------|------|-------------|-----------|
| 不认识 | 完全没印象 | q=1 | 插回队列（等 N 个词后），interval 重置为 1 天 |
| 模糊 | 有印象但不确信 | q=3 | 插回队列末尾（等 M 个词后），短 interval |
| 认识 | 很清楚 | q=5 | 毕业！正常 SM-2 调度 |

### 4.3 毕业规则

- 首次"认识" → 直接毕业（用户判断可靠时）
- "认识"前有"模糊"记录 → 需再确认一次（再次出现）
- 一个词 session 内出现 ≥ 5 次仍未毕业 → 标记"今日跳过"
- 连续 3 次"不认识" → 标记"困难词"，本轮跳过

### 4.4 新词 vs 复习词

| | 新词（首次学习） | 复习词（SRS 到期） |
|---|---|---|
| 发音 | 显示音标 | 显示音标 |
| 翻转后 | 释义 + 例句 + 上下文 | 释义 + 上下文（不含例句） |
| 不认识插回间隔 | 等 2 个词 | 等 3 个词 |

### 4.5 闪卡 UI

```
┌──────────────────────────────────────────────────────┐
│  ──●──●──○──○──○──○──○──   3 / 12                   │
│                                                      │
│                                                      │
│              ephemeral                                │  ← 56px mono 700
│           /ɪˈfem.ər.əl/                              │  ← 音标 muted
│                                                      │
│              · · ·                                   │  ← 呼吸提示点
│                                                      │
│  ┌────────────────────────────────────────────────┐  │
│  │  adj. 短暂的；转瞬即逝的                         │  │  ← 翻转后淡入
│  │  "Beauty is ephemeral..."                      │  │
│  │  — theguardian.com                             │  │
│  │                                                │  │
│  │  📌 本次第 1 次 · 新词                          │  │  ← session 状态
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐  │
│  │  不认识   │  │   模糊    │  │      认识 ✓        │  │
│  └──────────┘  └──────────┘  └────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

### 4.6 翻转动画

- 点击卡片 → reveal 内容从 `max-height: 0; opacity: 0` 过渡到 `open`
- 过渡 `0.4s var(--ease-standard)`
- 按钮在 reveal 完成后出现（延迟 100ms）

### 4.7 卡片切换

- 评分后：当前内容 `translateX(-30px)` + fade out（`.15s`）
- 新词从右侧 `translateX(30px)` 弹入到 0（`var(--ease-elastic) .35s`）

### 4.8 完成页

- 本轮复习 N 个词，M 个毕业，K 个跳过
- 显示今日目标进度
- "返回词库"按钮

---

## 五、面板二：词库面板

### 5.1 布局

```
┌──────────────────────────────────────────────────────┐
│  🔍 搜索…                         [筛选 ▾] [排序 ▾]  │
│──────────────────────────────────────────────────────│
│  [全部 42] [🟢 新词 8] [🟡 学习中 19] [🔵 已掌握 15] │
│──────────────────────────────────────────────────────│
│                                                      │
│  词卡列表（高密度，边框分隔）                           │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 5.2 筛选标签

- 一行 pill 按钮：全部 / 新词 / 学习中 / 已掌握
- 当前激活 pill 高亮（`bg: var(--accent)`, `color: #fff`）
- 每个 pill 右上角显示数量
- 分类逻辑：
  - **新词**：`reviewCount === 0`
  - **学习中**：`reviewCount > 0` 且未掌握
  - **已掌握**：`reviewCount >= 3 && easeFactor >= 2.0`

### 5.3 词卡设计

```
┌──────────────────────────────────────────────────────┐
│  ubiquitous                              ● 已掌握    │
│  /juːˈbɪk.wɪ.təs/   复习 5 次 · 间隔 15 天          │
│  adj. 无处不在的；普遍存在的                           │
│  ┌─ 上下文（可折叠）──────────────────────────────┐  │
│  │ "The internet has become ubiquitous..."       │  │
│  └──────────────────────────────────────────────┘  │
│  wikipedia.org · 2026/7/1 · DeepSeek    [复制][🗑]  │
└──────────────────────────────────────────────────────┘
```

- 右侧状态圆点：● 已掌握 / ◉ 学习中 / ○ 新词
- 上下文默认折叠（单行省略），点击展开
- hover 效果：`translateX(4px)` 微移 + 边框颜色微变
- 删除按钮 hover：`--accent-danger` 弹红 + `ease-elastic`

### 5.4 搜索与排序

- 搜索：实时过滤（输入即时生效），匹配单词和释义
- 排序：最新 / 最早 / A→Z / Z→A / 最近复习 / 掌握度

---

## 六、面板三：统计面板

### 6.1 概览数字

```
┌──────────────────────────────────────────────────────┐
│   42          19          15          7              │
│  总词汇      学习中       已掌握      连续天数         │
│                                                      │
│  今日 ──── 8/10 目标 · 已复习 6 个 · 还剩 4 个       │
└──────────────────────────────────────────────────────┘
```

- 大数字：`font-family: mono`, `font-size: 36px`, `font-weight: 600`
- 标签：`font-size: 12px`, `color: --fg-muted`
- 今日进度条：`height: 4px`, `background: --accent`

### 6.2 学习日历（GitHub 贡献热力图）

```
┌──────────────────────────────────────────────────────┐
│  学习日历                                 2026 年 7 月│
│                                                      │
│     一  二  三  四  五  六  日                        │
│     ┌──┬──┬──┬──┬──┬──┬──┐                          │
│     │  │░░│▓▓│██│██│██│██│                          │
│     └──┴──┴──┴──┴──┴──┴──┘                          │
│                                                      │
│  ░░ 1-4 次   ▓▓ 5-9 次   ██ 10+ 次   0 次 = 空白     │
└──────────────────────────────────────────────────────┘
```

- 纯 CSS grid 实现（`display: grid; grid-template-columns: repeat(7, 1fr)`）
- 显示最近 17 周
- 颜色：`#21262d` → `#3fb95044` → `#3fb95088` → `#3fb950`
- 每个格子 `12x12px`, `gap: 3px`, `border-radius: 2px`
- 列头显示星期，行头显示月份标签

### 6.3 复习预测

```
┌──────────────────────────────────────────────────────┐
│  未来 7 天复习预测                                    │
│                                                      │
│  7/14 周一  ████████████████ 8 个                     │
│  7/15 周二  ██████ 3 个                               │
│  ...                                                 │
│                                                      │
│  >15 个标红警告                                       │
└──────────────────────────────────────────────────────┘
```

- 遍历所有 `FavoriteWord`，按 `nextReviewAt` 聚合到未来 7 天
- 横条宽度 = 该日复习量 / max(未来7天) × 100%
- 超过 15 个的日期用 `--accent-danger` 标红

### 6.4 单词记忆曲线

```
┌──────────────────────────────────────────────────────┐
│  记忆曲线                                             │
│                                                      │
│  ┌─ 快速选择 ────────────────────────────────────┐  │
│  │ ubiquitous  ephemeral  serendipity  ...        │  │
│  └──────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ ubiquitous ──────────────────────────────────┐  │
│  │                                                │  │
│  │  掌握度                                        │  │
│  │  100% ┤                   ●━━━━━━━━━━━ 预测   │  │
│  │   80% ┤             ●━━━━┛                    │  │
│  │   60% ┤       ●━━━━┛                          │  │
│  │   40% ┤   ●━━━┛                               │  │
│  │   20% ┤  ●                                     │  │
│  │    0% ┤                                       │  │
│  │       └──┴───┴───┴───┴───┴───┴───             │  │
│  │       7/1  7/3  7/7  ...                      │  │
│  │                                                │  │
│  │  ● = 认识  ◉ = 模糊  ○ = 不认识                │  │
│  │  ━━ = 预测遗忘曲线                              │  │
│  │                                                │  │
│  │  easeFactor: 2.50 · 间隔: 15天 · 下次: 7/28   │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

实现细节：
- SVG `<polyline>` 渲染折线
- X 轴 = 时间（最近 8 次复习日期 + 预测未来 2 个节点）
- Y 轴 = 掌握度 0-100%
- 圆点颜色 = 对应评分（绿=认识、橙=模糊、红=不认识）
- 虚线 = 基于 SM-2 的预测遗忘曲线
- 顶栏横向滚动选择器，点击切换单词
- 默认选中最近复习的词，不选时显示全局平均曲线

### 6.5 掌握度计算

```
mastery(word):
  - 上次复习质量 q ∈ {1, 3, 5}
  - elapsed = (now - lastReviewedAt) / (nextReviewAt - lastReviewedAt)
  - 基准 = q === 5 ? 95 : q === 3 ? 70 : 30
  - 衰减 = elapsed × (100 - 基准) × 0.5
  - mastery = max(0, min(100, 基准 - 衰减))
  - easeFactor < 1.5 → cap at 60%
  - reviewCount ≥ 3 && easeFactor ≥ 2.0 → floor at 80%
```

---

## 七、设置面板（右侧抽屉）

### 7.1 布局

```
┌───────────────────────────────────────────┐
│  ╳  设置                                   │
│───────────────────────────────────────────│
│                                           │
│  ── 卡片模板 ─────────────────────────    │
│                                           │
│  正面显示：                                │
│  ☑ 单词  ☑ 音标  ☐ 上下文                 │
│                                           │
│  背面显示：                                │
│  ☑ 释义  ☑ 词性  ☑ 例句  ☑ 上下文  ☐ 来源 │
│                                           │
│  布局风格：                                │
│  ◉ 不背单词（单词为主）                    │
│  ○ 上下文优先（句子挖空）                   │
│                                           │
│  ── 学习参数 ─────────────────────────    │
│                                           │
│  每日新词上限  [ 10 ▼]                     │
│  每日复习上限  [ 50 ▼]                     │
│                                           │
│  ── 通知 ─────────────────────────────    │
│                                           │
│  ☑ 复习提醒  ☐ 达标庆祝                    │
│                                           │
│  ── 数据 ─────────────────────────────    │
│                                           │
│  [导出 CSV]  [导出 JSON]                   │
│  [清除全部数据]                             │
│                                           │
│                              [保存设置]    │
└───────────────────────────────────────────┘
```

### 7.2 交互

| 操作 | 行为 |
|------|------|
| 打开 | 齿轮点击 → 抽屉从右滑入 (`.35s var(--ease-elastic)`) + 半透明遮罩 |
| 关闭 | 点击遮罩 / Esc / 点击 × / 保存后自动关闭 |
| 保存 | 写入 `chrome.storage.sync`，即时生效，toast 反馈 |
| 清除全部 | 红色文字，二次确认弹窗 |

### 7.3 卡片模板设置

- 字段开关：`input[type=checkbox]`，`accent-color: var(--accent)`
- 布局风格：`input[type=radio]`，二选一
- 更改后即时预览（在设置面板内显示微型卡片预览）

### 7.4 学习参数

- 每日新词上限：5/10/15/20/25（下拉选择）
- 每日复习上限：20/30/50/100/无限制（下拉选择）

---

## 八、osu! 交互注入点

| 位置 | 效果 |
|------|------|
| 全局（学习面板） | 自定义光标（16px 圆环 + 光晕跟随 40px）|
| 闪卡点击翻转 | 点击波纹（120px 光环，600ms）+ 弹性缓动 |
| 三档评分按钮 | hover `scale(1.06)` + `ease-elastic`，点击闪烁脉冲 |
| 卡片切换 | `translateX` 滑出 + 新词弹入 (`ease-elastic`) |
| 进度条填充 | `ease-elastic` 动画 |
| 词库卡片 hover | `translateX(4px)` 微移（非 scale） |
| 删除按钮 hover | `ease-elastic` 弹红 |
| 搜索框 focus | `ease-elastic` 光标放大 |
| 抽屉滑入/滑出 | `ease-elastic` + 遮罩淡入淡出 |
| 统计面板 toggle | IntersectionObserver 触发交错入场 |
| 设置 toggle hover | `scale(1.1)` + `ease-elastic` |

### 全局规则

- `prefers-reduced-motion` 时关闭所有动画和光标特效
- 自定义光标仅在学习面板和统计面板生效，词库面板保留系统光标（信息密度高时不干扰）
- 光晕用全屏 canvas 层（`pointer-events: none`），仅在复习页面渲染

---

## 九、数据结构变更

### FavoriteWord 新增字段

```typescript
export interface FavoriteWord {
  // ... 现有字段保持不变 ...
  reviewHistory: Array<{
    timestamp: number;   // 复习时间
    quality: number;     // 1/3/5 (不认识/模糊/认识)
    interval: number;    // 本次复习后安排的间隔(天)
  }>;
  learned: boolean;      // 是否已"学会"（首次毕业标记）
}
```

### Worker 消息新增

```typescript
// 获取单个词的复习历史
export interface GetWordHistoryRequest {
  type: 'GET_WORD_HISTORY';
  wordId: string;
}
export interface WordHistoryResponse {
  type: 'WORD_HISTORY_RESULT';
  wordId: string;
  history: ReviewRecord[];
}

// 批量获取未来复习预测
export interface GetForecastRequest {
  type: 'GET_FORECAST';
  days: number; // 未来 N 天
}
export interface ForecastResponse {
  type: 'FORECAST_RESULT';
  days: Array<{ date: string; count: number }>;
}

// 获取完整学习统计数据（增强版）
export interface GetFullStatsRequest {
  type: 'GET_FULL_STATS';
}
export interface FullStatsResponse {
  type: 'FULL_STATS_RESULT';
  total: number;
  learning: number;
  mastered: number;
  streak: number;
  reviewedToday: number;
  dailyGoal: number;
  calendar: Array<{ date: string; count: number }>; // 最近 4 个月
  forecast: Array<{ date: string; count: number }>; // 未来 7 天
}
```

### 设置存储新增

```typescript
interface VocabSettings {
  // 卡片模板
  cardFront: ('word' | 'phonetic' | 'context')[];
  cardBack: ('meaning' | 'pos' | 'examples' | 'context' | 'source')[];
  cardLayout: 'minimal' | 'context-first';

  // 学习参数
  dailyNewLimit: number;     // 每日新词上限，默认 10
  dailyReviewLimit: number;  // 每日复习上限，默认 50，0 表示无限制

  // 通知
  reviewReminder: boolean;
  goalCelebration: boolean;
}
```

---

## 十、文件结构

```
src/vocab/
├── index.html          # 主 HTML（重写）
├── index.ts            # 主逻辑入口（重写，拆分为模块）
├── panels/
│   ├── learn.ts        # 学习面板逻辑
│   ├── browse.ts       # 词库面板逻辑
│   ├── stats.ts        # 统计面板逻辑（含 SVG 图表渲染）
│   └── settings.ts     # 设置抽屉逻辑
├── components/
│   ├── flashcard.ts    # 闪卡组件（渲染 + 翻转 + 动画）
│   ├── word-card.ts    # 词库卡片组件
│   ├── sparkline.ts    # SVG 迷你曲线 + 记忆曲线
│   ├── calendar.ts     # 热力图日历
│   ├── forecast.ts     # 复习预测横条图
│   └── cursor.ts       # 自定义光标 + 光晕 + 点击波纹
├── state.ts            # 全局状态管理（当前面板、数据缓存）
└── utils.ts            # 工具函数（时间格式化、掌握度计算等）
```

---

## 十一、技术约束

- **零框架**：纯 HTML + CSS + TypeScript DOM 操作
- **lit-html 不用于此页面**：vocab 是独立新标签页，不需要 Shadow DOM 隔离
- **SVG 渲染图表**：不依赖 canvas/chart 库，所有曲线和日历用 SVG 或 CSS grid
- **chrome.storage 持久化**：设置用 `sync`，数据用 `local`
- **构建**：`vite-plugin-web-extension` 的 `additionalInputs` 入口

---

## 十二、设计评审自检

- [x] 每个面板有自己的"签名"吗？（学习=闪卡翻转、统计=记忆曲线、词库=筛选标签）
- [x] 有没有可以去掉的装饰？无阴影、无渐变、无多余色块
- [x] 颜色语义一致吗？绿=认识/掌握、橙=模糊、红=不认识/删除
- [x] 有 emoji 吗？全部替换为 inline SVG
- [x] hover/focus 状态覆盖了吗？
- [x] `prefers-reduced-motion` 尊重了吗？
- [x] 文案是否直接明确？按钮文字=动词，标签=名词
