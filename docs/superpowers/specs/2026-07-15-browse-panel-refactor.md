# 词库面板六功能重构 Spec

## 目标

为词库面板（browse panel）增加 6 个功能：星标、备注、发音、复习排序、例句轮播、词性音标换色。严格按顺序实现，每完成一个验证构建。

---

## 改动范围

| 文件 | 改动内容 |
|------|----------|
| `src/shared/types.ts` | `FavoriteWord` 加 `starred`、`note` 字段 |
| `src/shared/messages.ts` | 新增 `STAR_WORD`、`UPDATE_NOTE` 消息类型 |
| `src/worker/index.ts` | 路由新消息到 handler |
| `src/worker/handlers/favorites.ts` | 新增 `handleStarWord`、`handleUpdateNote` |
| `src/vocab/utils.ts` | 新增 4 个 SVG 图标：star、star-filled、volume、note |
| `src/vocab/panels/browse.ts` | 所有 UI 和事件逻辑 |
| `src/vocab/style.css` | 新增样式 |
| `src/vocab/index.html` | 排序下拉加选项 |

不动：content script、学习面板、统计面板、设置、Sayo UI、FSRS。

---

## 功能 1：星标（Star / Pin）

### 数据

`FavoriteWord` 新增 `starred: boolean`（默认 `false`）。

### 消息

```ts
// 请求
interface StarWordRequest {
  type: 'STAR_WORD';
  wordId: string;
  starred: boolean;
}
// 响应
interface StarWordResponse {
  type: 'STAR_RESULT';
  wordId: string;
  starred: boolean;
}
```

### Worker

`handleStarWord` 调用 `updateFavorite(wordId, { starred })`。

### UI

- 状态圆点（`.status-dot`）旁边加星标按钮，使用 `Icons.star`（空心）和 `Icons.star-filled`（实心）
- 已标星：金色 `var(--syo-warning)`，实心图标
- 未标星：灰色 `var(--syo-fg-muted)`，空心图标
- 已标星词卡左侧加 `border-left: 3px solid var(--syo-warning)`
- 点击切换 starred 状态，发送 `STAR_WORD` 消息

### 排序

新增"星标优先"选项（`starred`）：starred 的排最前，同组内按 `createdAt` 倒序。

---

## 功能 2：备注（Notes）

### 数据

`FavoriteWord` 新增 `note: string`（默认 `""`）。

### 消息

```ts
interface UpdateNoteRequest {
  type: 'UPDATE_NOTE';
  wordId: string;
  note: string;
}
interface UpdateNoteResponse {
  type: 'NOTE_RESULT';
  wordId: string;
  note: string;
}
```

### Worker

`handleUpdateNote` 调用 `updateFavorite(wordId, { note })`。

### UI

- 释义下方、context 上方加可折叠备注区
- 空备注：显示"添加备注…"文字链接（灰色，`.note-add-btn`），点击展开
- 展开后：`<textarea>` + 保存/取消按钮
- 有备注：显示备注文本 + 单词旁显示便签图标（`Icons.note`），点击进入编辑模式
- 保存时发送 `UPDATE_NOTE` 消息，然后 `loadWords()` + `renderBrowse()`

### 搜索

`getFiltered()` 搜索范围加入 `w.note`。

### 图标

单词旁便签图标使用自定义 SVG（非 emoji），颜色 `var(--syo-fg-muted)`，小尺寸。

---

## 功能 3：卡片发音

### 实现

- 单词右侧、card-actions 左侧加发音按钮（喇叭图标 `Icons.volume`）
- 复用已有 `SPEAK` 消息：`chrome.runtime.sendMessage({ type: 'SPEAK', text: word.word, lang: 'en' })`
- 按钮样式：`.btn-icon--sm`，hover 时高亮

### 图标

喇叭图标：speaker 带声波弧线的 SVG。

---

## 功能 4：下次复习排序 + 到期日

### 排序

新增"下次复习"选项（`next-review`）：
- 按 `nextReviewAt` 升序
- `nextReviewAt === 0`（新词，未调度）排到最后

### 到期日显示

- 卡片 meta 区（`.card-meta`）显示复习时间信息
- `nextReviewAt > 0`：格式化为"下次复习：7月18日"
- `nextReviewAt <= Date.now()` 且 `nextReviewAt > 0`：橙色文字（`var(--syo-warning)`），表示已到期
- mastered（`reviewCount >= 3 && easeFactor >= 2.0`）：显示"已掌握"，绿色
- `nextReviewAt === 0`（新词）：不显示

### 格式化

用 `new Date(ts).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })` 生成"7月18日"格式。

---

## 功能 5：例句轮播

### 现状

`word.context` 截断 2 行，点击展开只取消 `-webkit-line-clamp`，样式单调。

### 新行为

- 未展开：保持现状（2 行截断，左边框，chevron）
- 展开后：替换为 `.syo-inertia` 水平滚动轮播容器
- 轮播卡片顺序：
  1. 网页原文 context（如有）：卡片标题"原文"，内容 `word.context`
  2. 每条 `word.translation.examples[]`：卡片标题 `ex.original`，内容 `ex.translated`
- 卡片样式与学习面板（`learn.ts` `showCard()`）一致：`syo-card` + `syo-card-head`/`syo-card-title` + `syo-card-desc`
- 激活 `.syo-inertia` 的惯性滚动

### 实现细节

点击 card-context 时，检测 `data-expanded`：false → true 时替换 innerHTML 为轮播；true → false 时恢复为截断文本。用 Sayo 的 inertia scroll 初始化。

---

## 功能 6：词性 & 音标颜色

### CSS 改动

```css
.pos-tag {
  color: var(--syo-accent);  /* 紫色，替换默认 */
}

.card-head .phon {
  color: var(--syo-info);    /* 蓝色，替换默认 */
}
```

纯 CSS，不改 JS。

---

## 图标设计

新增 4 个 SVG 图标（24x24 viewBox，stroke 风格，与现有图标一致）：

| 图标 | key | 描述 |
|------|-----|------|
| 空心星 | `star` | 五角星轮廓，未标星状态 |
| 实心星 | `star-filled` | 填充五角星，已标星状态 |
| 喇叭 | `volume` | speaker + 声波弧线，发音按钮 |
| 便签 | `note` | 记事本/文档图标，有备注标记 |

---

## 实现顺序

严格按 1 → 2 → 3 → 4 → 5 → 6 顺序，每完成一个功能执行 `npm run build` 验证。
