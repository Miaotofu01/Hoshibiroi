# 词库面板六功能重构

日期：2026-07-15

## 概述

为词库面板 (browse panel) 增加 6 个功能：星标、备注、发音、下次复习排序+到期日、例句展开优化、词性音标换色。

## 功能详述

### 1. 星标 (Star/Pin)

- `FavoriteWord.starred` 字段已存在
- 卡片状态圆点旁加星标按钮 `.btn-icon--sm`，空心☆/实心★切换
- 点击发送 `STAR_WORD` 消息到 worker，worker 端新增 handler
- 排序加"星标优先"：starred 排最前，同组按时间倒序
- 星标词左边框金色 `border-left: 2px solid var(--syo-warning)`
- worker handler: `updateFavorite(id, { starred })`

### 2. 备注 (Notes)

- `FavoriteWord` 加 `note: string` 字段
- 卡片底部可展开备注区，初始显示"添加备注…"提示文字
- 点击展开 textarea，失焦/回车保存，发送 `UPDATE_NOTE` 消息
- 搜索范围覆盖 `word.note`
- 有备注的词旁显示 SVG 笔记图标（非 emoji），颜色 `var(--syo-fg-muted)`
- worker handler: `updateFavorite(id, { note })`

### 3. 发音

- 单词右侧加发音按钮 `.btn-icon--sm`
- 点击调用 `chrome.runtime.sendMessage({ type: 'SPEAK', text: word.word, lang: 'en' })`
- 放在删除按钮左边

### 4. 下次复习排序 + 到期日

- 排序加"下次复习"选项 `next-review`：按 `nextReviewAt` 升序，`nextReviewAt===0` 的排最后
- 卡片 meta 区显示下次复习日期
- `nextReviewAt===0`（新词）显示"新词"
- `learned===true` 显示"已掌握"
- 今天到期 (`nextReviewAt <= now && nextReviewAt > 0`) 的日期用橙色 `var(--syo-warning)`
- 将来日期用 muted 色

### 5. 例句展开优化

- 替换当前 line-clamp 2 行 + 点击展开模式
- 使用 `.syo-inertia` 横向滚动容器，呈现样式与学习卡片背面一致
- 内容：`word.context`（原文上下文）作为第一张卡片 + `word.translation.examples[]` 后续卡片
- 每张卡片为 `.syo-card`，宽 260px，标题=原文，描述=译文

### 6. 词性/音标换色

- `.pos-tag` 颜色改为 `var(--syo-accent)`（紫色）
- `.phon` 颜色改为 `var(--syo-info)`（蓝色）

## 文件变更

| 文件 | 变更 |
|------|------|
| `src/shared/types.ts` | 加 `note: string` |
| `src/worker/index.ts` | 加 `STAR_WORD`、`UPDATE_NOTE` handler |
| `src/vocab/panels/browse.ts` | 6 功能 UI 渲染 + 事件处理 |
| `src/vocab/browse.css` | 星标、备注、发音、例句、到期日样式 |
| `src/vocab/index.html` | sort select 加选项 |
| `src/vocab/utils.ts` | 加 note SVG 图标 |

## 不变更

- Shadow DOM、content script、worker/FSRS 核心、Sayo UI
- 学习面板、统计面板、设置抽屉
- 现有 `.btn-icon`、`.pill` 按钮体系
