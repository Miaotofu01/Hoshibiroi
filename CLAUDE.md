# 星拾 — 划词翻译与间隔复习

Chrome 扩展 (Manifest V3)。网页划词翻译 + FSRS-5 间隔重复复习。

## 命令

```bash
npm install          # 安装依赖
npm run dev          # 开发模式（watch + 热重载）
npm run build        # 生产构建 → dist/
```

构建后 `dist/` 直接在 Chrome `chrome://extensions` 加载。

## 架构

```
网页 (content script)           Service Worker            生词本页面
═══════════════════            ══════════════            ════════════
src/content/index.ts  ─msg→   src/worker/            ←msg→ src/vocab/
  Shadow DOM 注入               handlers/review.ts          panels/learn.ts  学习页
  划词翻译弹泡                   handlers/favorites.ts      panels/browse.ts 词库
  收藏单词                      handlers/stats.ts          panels/stats.ts  统计
  src/content/assistant/ 助手（模式切换/流式对话/页面上下文）
                                handlers/assistant.ts
                                storage.ts                 
                                srs.ts  ← FSRS-5 调度器    
                                statistics.ts              
                                translate.ts  API 调用     
                                assistant.ts  对话流
```

**消息协议**：`src/shared/messages.ts` — 所有 content↔worker↔vocab 的通信类型。
**类型定义**：`src/shared/types.ts` — `FavoriteWord`、`Translation` 等核心类型。
**CSS 框架**：使用自研 [Sayo UI](/home/tofu/我的项目/sayo-ui/)，组件类名 `.syo-btn` `.syo-card` 等。

## 关键文件

| 文件 | 作用 |
|------|------|
| `src/worker/srs.ts` | FSRS-5 调度器，`schedule()` 是核心入口 |
| `src/vocab/panels/learn.ts` | 学习页：队列构建、弹卡、评分提交 |
| `src/vocab/panels/stats.ts` | 统计面板：日历热力图、趋势折线、薄弱词 |
| `src/worker/storage.ts` | `getFavorites()` / `getDueWords()` 等数据层 |
| `src/content/index.ts` | 划词监听 → 注入 Shadow DOM 弹泡 |
| `src/shared/assistant.ts` | 助手设置归一化、系统/用户提示词装配、页面窗口截取（`buildSystemPrompt`/`truncateAround`） |
| `src/worker/assistant.ts` | 助手流式调用 DeepSeek（`streamAssistant`） |
| `src/worker/deepseek-model.ts` | DeepSeek 模型名唯一来源，助手/翻译/语法分析共用 `DEEPSEEK_MODEL` |
| `src/content/assistant/controller.ts` | 弹泡与侧栏共享的助手控制器（会话、设置、页面上下文、请求装配）；`askPreset(id)` 是预设分发的唯一入口 |
| `src/content/assistant/history.ts` | 译文历史纯逻辑（环形缓冲、同词同源去重、前后回退），无 DOM/chrome 依赖 |

## 记忆调度策略

详见 `docs/srs-strategy.md`。核心要点：

- **每次评分立即提交**：复习词点 Again/Hard/Good/Easy 都即刻调 `schedule()`，状态即时修改
- **新词学习阶段不扣分**：step 1→step 2 阶段的失败只影响前端队列，不修改 FSRS 状态
- **Lapse 后恢复**：`reviewCount===0 && lastReviewedAt>0` 时不重置到 `initStability`，基于 lapse 残余继续
- **参数针对语言学习调过**：w8=0.80, w9=0.18, w10=1.30, w15=0.40, MAX_INTERVAL=90天

## 测试

```bash
npx vitest run tests/    # 全部 103 项 / 9 个文件：SRS 调度器、导入、助手（上下文/流式/端口/会话/模型名）、译文历史
```

## Gotchas

- **UI 单例，无注入守卫**：`src/content/index.ts` 的 `init()` 只判断 `document.body` 存在，**没有** id 去重守卫；重复注入靠 content script 本身只注入一次来保证。`#translate-extension-root` 只是三个组件的挂载容器（TriggerIcon / PopupBubble / SidePanel，各带 Shadow DOM），不是去重标记
- **热力图颜色**：用不透明绿色（非 alpha），深绿=复习多，浅绿=复习少。Alpha 绿色在暗色背景上会反直觉
- **`easeFactor` 字段实际存的是 FSRS 的 Stability(S)**：历史遗留命名，别被名字误导
- **统计面板 `renderStats()` 只调一次 `computeRetention`**：结果传给多个子渲染函数共享，避免重复计算
- **SVG 图标全部内联**：`src/vocab/utils.ts` 的 `ico()` 函数和 `Icons` map，不要引入外部图标库
- **`vite-plugin-web-extension` 构建**：manifest 里的路径在构建后会被改写，src 里的导入用相对路径即可
- **助手流式走端口**：`chrome.runtime.connect({name:'assistant-stream'})`，worker 每 20s 发 `ping` 抵抗 MV3 30s 空闲回收，content 回 `pong`；端口断开要当成错误提示用户重试
- **DeepSeek 前缀缓存**：系统提示词（含页面上下文）在会话内必须逐字节稳定，选中范围放每轮用户消息里；正常情况下只在改设置/清空会话时重建，页面地址变化或选中范围已不在缓存正文里也会重建（见 `controller.ts` 的 `promptCache`）。命中价约为未命中的 1/50
- **`reasoning_content` 永不回传**：不带 `tools` 时 API 会忽略它，放进请求体只会白烧 token；思考模式下 `temperature` 被忽略，翻译/语法分析因此显式 `thinking: {type:'disabled'}`
- **译文历史是 `hide()` 的唯一例外**：`PopupBubble.hide()` 的惯例是「清空一切状态」，但译文历史**故意不清空**——滚动、点击页面、Esc、✕ 都会调 `hide()`，清了等于滚一下页面就丢回退能力。只 `detach()` 移出游标。改 `hide()` 时别顺手把历史一起清掉
- **归一化是白名单式的**：`normalizeAssistantSettings` 返回对象是字面量，**未知字段被静默丢弃**。给 `AssistantSettings` 加字段必须同步加进归一化，否则读盘时会被无声抹掉（旧 `instructions` 就是这样被丢弃的，无迁移）
- **预设 id 必须确定性生成**：归一化是纯函数、每次读盘都重跑，`id` 用 `randomUUID()` 会让同一份设置在两次读取间产生不同 id。见 `assistant.ts` 的 `contentId()`
- **预设列表是唯一真源**：chip 栏与工具栏的整页类入口都从 `settings.presets` 派生（`controller.askPreset(id)`），**不要**再按固定 id 硬编码按钮——那正是「用户删了预设、按钮还在、点了没反应」的成因
