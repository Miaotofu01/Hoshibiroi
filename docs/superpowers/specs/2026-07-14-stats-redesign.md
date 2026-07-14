# 统计面板重设计 Spec

## 目标

将分散的 4 个统计区块 + 3 个新增需求聚合为 4 张卡片，由近及远叙事：**今日状态 → 学习节奏 → 词汇健康 → 成长趋势**。

---

## 整体布局

```
┌─ 1. 今日状态 ─────────────────┐
│  连续 N 天 · 今日 X/Y · 积压 Z 词 │
│  [进度条]                       │
│  总词汇 | 30天留存 | 本周新词     │
└────────────────────────────────┘
┌─ 2. 学习节奏 ─────────────────┐
│  过去 17 周热力图                │
│  未来 7 天预测柱状图             │
└────────────────────────────────┘
┌─ 3. 词汇健康 ─────────────────┐
│  留存率 | 间隔趋势 | 记忆强度 | 总复习 │
│  掌握度分布条                   │
│  薄弱词 TOP 5                  │
└────────────────────────────────┘
┌─ 4. 成长趋势 ─────────────────┐
│  总词汇 / 已掌握 两线折线图      │
│  30 天留存率趋势                 │
└────────────────────────────────┘
```

---

## Section 1: 今日状态

**聚合来源：** 旧"今日概览" + 新增积压/断档提示

**数据需求：**
| 数据 | 来源 | 状态 |
|------|------|------|
| streak | FullStatsResponse.streak | 已有 |
| reviewedToday | FullStatsResponse.reviewedToday | 已有 |
| dailyGoal | FullStatsResponse.dailyGoal | 已有 |
| total | FullStatsResponse.total | 已有 |
| 30 天留存率 | 客户端 computeRetention(words, 30) | 已有 |
| 本周新词 | 客户端 computeWeeklyNew(words) | 已有 |
| 积压数量 | 客户端 countDue(words) — 计算 due 但未在今日复习的 | **新增** |
| 断档提示 | 客户端 streak === 0 → "今天还没开始学习哦" | **新增** |

**UI 结构：**
- 顶部：streak 火焰图标 + "连续学习 N 天"（与现在一致）
- 进度条区域（与现在一致）
- 三指标行（与现在一致）
- **新增：** 进度条下方一行小字
  - `streak > 0` → "今天已复习 X 词，还有 Y 词待复习"
  - `streak === 0` → "今天还没开始学习哦"（muted 色）
  - 积压 > 0 → "⚠ 有 Z 个单词已逾期未复习"（warning 色）

**变化：** 合并本节与旧 Section 3/4 的"上次断档"逻辑（如有时）

---

## Section 2: 学习节奏

**聚合来源：** 旧"学习日历" + 旧"复习预测"

**数据需求：**
| 数据 | 来源 | 状态 |
|------|------|------|
| 日历热力图 | FullStatsResponse.calendar (119 天) | 已有 |
| 本周柱状图 | 客户端从 calendar 聚合 | 已有 |
| 未来 7 天预测 | FullStatsResponse.forecast | 已有 |

**UI 结构（上下两段）：**

**上段 — 回顾（日历）：**
- 本周柱状图 + "本周 N 次复习"（与现在一致）
- 热力图 + 月份标签 + 图例（与现在一致）

**下段 — 前瞻（预测）：**
- 未来 7 天柱状图（与现在一致）
- 汇总行："共计 N 词 · 最忙日：周X M 词"（与现在一致）
- **新增：** 如果连续 3 天 forecast > 10 → "建议每天分散复习，避免堆积"

**变化：** 将旧 Section 2（日历）和 Section 4（预测）合并到一个 stats-section 内，分为"回顾"和"前瞻"两个子区，各有一个 `<h4>` 子标题（如"过去 17 周""未来 7 天"），中间用一条分隔线分隔。

---

## Section 3: 词汇健康

**聚合来源：** 旧"SRS 健康" + 新增薄弱词

**数据需求：**
| 数据 | 来源 | 状态 |
|------|------|------|
| 30 天留存率 | 客户端 computeRetention(words, 30) | 已有 |
| 间隔增长趋势 | 客户端 computeIntervalTrend(words) | 已有 |
| 平均稳定性 S | 客户端 avg(words.map(w => w.easeFactor)) | 已有 |
| 总复习次数 | 客户端 sum(words.map(w => w.reviewCount)) | 已有 |
| 掌握度分布 | 客户端 computeMastery/stable/learning/new | 已有 |
| 薄弱词 TOP 5 | 客户端 sortBy(words, difficulty desc + retention asc) | **新增** |

**UI 结构（上下两段）：**

**上段 — SRS 指标（保持现有 health-grid）：**
- 4 个小指标卡 + 1 个全宽掌握度分布条（与现在一致）

**下段 — 薄弱词（新增）：**
- 标题："需要加强的词汇"
- 列出最多 5 个词，每个一行：
  - 单词 + 难度评分（D 值）+ 上次评分 + 下次复习日期
  - 无薄弱词时显示："所有词汇都在稳步掌握中 ✓"（success 色）
- 薄弱词判定逻辑：`difficulty >= 7.0` 或最近一次 review quality 为 Again(1)/Hard(2)
- 按 `difficulty DESC, lastReviewedAt ASC` 排序取前 5

---

## Section 4: 成长趋势

**聚合来源：** 新增

**数据需求：** 全部客户端从 `words[]` 计算，无需后端改动。

| 数据 | 计算方式 |
|------|---------|
| 总词汇增长曲线 | 按 createdAt 聚合，按月分桶，累计求和 |
| 已掌握增长曲线 | 同上，仅统计 learned=true 或 mastered 条件的词 |
| 30 天留存率趋势 | 每月底计算一次当时点的 30 天留存率 |

**UI 结构：**
- 用纯 CSS + inline SVG 画简易折线图（不是之前复杂的交互式曲线）
- SVG 尺寸：`600×160`，响应式缩放
- 两条线：总词汇（muted 灰色虚线）/ 已掌握（accent 紫色实线）
- X 轴：月份标签
- Y 轴：数量刻度（左侧，自动 scale）
- 下方一行小字："过去 N 个月，从 X 词增长到 Y 词，其中 Z% 已掌握"
- 无足够数据时（<3 个词或跨度不足 2 个月）：显示空态"积累更多词汇后，这里会显示你的成长趋势"

**实现要点：**
- 纯函数 `computeGrowthData(words)` → `{ months: string[], total: number[], mastered: number[] }`
- 从每個 word.createdAt 按月分桶，累计统计
- 最大显示 12 个月，超过则只显示最近 12 个月

---

## 不变范围

- 不修改 `FullStatsResponse` 接口（所有新数据客户端计算）
- 不修改 worker 端任何代码
- 不修改 Sayo UI 组件库
- 不改变导航结构

---

## 后端改动

**无。** 所有新增数据（积压数、断档提示、薄弱词、成长趋势）全部从客户端现有 `words[]` 数据计算。

---

## 文件改动范围

| 文件 | 改动 |
|------|------|
| `src/vocab/index.html` | 重写 Section 1-4 HTML 结构，添加新增区块元素 |
| `src/vocab/index.html` (CSS) | 添加新 UI 元素的样式：节奏子标题、薄弱词列表、趋势 SVG |
| `src/vocab/panels/stats.ts` | 重写数据计算函数，添加 `computeDue`、`findWeakWords`、`computeGrowthData`；调整 `renderStats` 调用链 |
