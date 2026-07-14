# 星拾 (Hoshibiroi) — 划词翻译 · 间隔复习

<p align="center">语言是夜空，词汇是散落的星。每一次遇见好词，都是拾起一颗属于自己的星光。</p>

Chrome 扩展 (Manifest V3)。选中文字即时翻译 + FSRS-5 间隔重复生词本。Sayo 暗色主题，自研 [Sayo UI](https://github.com/user/sayo-ui) 组件库。

## 安装到浏览器

### 1. 克隆项目

```bash
git clone git@github.com:Miaotofu01/Hoshibiroi.git
cd Hoshibiroi
```

### 2. 安装依赖

```bash
npm install
```

需要 Node.js ≥ 18。

### 3. 构建

```bash
npm run build
```

构建产物在 `dist/` 目录。

### 4. 加载到 Chrome

1. 打开 Chrome 浏览器，地址栏输入 `chrome://extensions` 回车
2. 右上角打开 **「开发者模式」** 开关
3. 点击左上角 **「加载已解压的扩展程序」**
4. 在弹出的文件选择器中，找到项目里的 `dist/` 文件夹，点击「选择文件夹」
5. 列表中会出现「划词翻译」扩展卡片，工具栏出现扩展图标，安装完成

### 5. 配置翻译源

首次使用建议配置翻译 API：

1. 右键点击工具栏的扩展图标 → **「选项」**（或点击图标 → 齿轮设置按钮）
2. **DeepSeek**（推荐，有免费额度）：
   - 前往 [platform.deepseek.com](https://platform.deepseek.com) 注册并获取 API Key
   - 在设置页填入 Key，保存
3. **Google Translate**：无需配置，开箱即用（需网络能访问 Google 服务）
4. 其他翻译源（腾讯云 TMT、百度翻译、DeepL）按需配置

### 6. 固定到工具栏

点击 Chrome 工具栏右侧的扩展管理图标（拼图块形状），找到 **「划词翻译」**，点击旁边的图钉图标固定，方便随时打开生词本。

### 开发模式

边改代码边看效果：

```bash
npm run dev
```

`dist/` 会自动更新。在 `chrome://extensions` 中找到扩展卡片，点击右下角的刷新按钮即可加载最新代码。

### 更新版本

```bash
git pull
npm install        # 如有新依赖
npm run build
```

然后在 `chrome://extensions` 中点击扩展的刷新按钮即可。

## 核心功能

### 划词翻译

- 在任意网页选中文字 → 弹出翻译气泡
- 支持 中/英/日/韩/法/德/西 互译
- 多翻译源：DeepSeek、Google Translate、腾讯云 TMT、百度翻译、DeepL
- 快捷键 `Alt+T` 翻译、`Alt+R` 朗读、`Esc` 关闭

### 生词本 · 间隔复习

收藏的词汇进入生词本，用 FSRS-5 算法安排复习：

- **学习面板** — 闪卡式复习，评分 Again / Hard / Good / Easy，即时反馈
- **词库面板** — 浏览、搜索、筛选、管理全部词汇
- **统计面板** — 日历热力图、学习趋势、掌握度分布

### 词库面板 · 词汇管理

| 功能 | 说明 |
|------|------|
| 星标 | 重点词标记，金色左边框，星标优先排序 |
| 备注卡片 | 自定义增删改拖拽排序，标题+内容结构 |
| 发音 | 卡片上直接点击喇叭按钮朗读 |
| 排序 | 最新/最早/A→Z/星标优先/下次复习/掌握度 |
| 筛选 | 全部/新词/学习中/已掌握 |
| 搜索 | 覆盖单词、释义、词性含义 |
| 例句 | 原文上下文 + 翻译例句，横向滚动浏览 |
| 到期日 | 显示下次复习日期，今天到期的橙色高亮 |

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Alt+T` | 翻译选中文字 |
| `Alt+R` | 朗读原文 |
| `Esc` | 关闭弹窗 |
| 学习页 `1/2/3/4` | Again / Hard / Good / Easy |

## 架构

```
网页 (content script)        Service Worker         生词本页面
═══════════════════         ══════════════         ════════════
src/content/index.ts  ──→  src/worker/       ←──  src/vocab/
  Shadow DOM 注入            handlers/               panels/learn.ts
  划词弹泡                    review.ts              panels/browse.ts
  收藏单词                    stats.ts               panels/stats.ts
                              storage.ts
                              srs.ts  FSRS-5
                              translate.ts
```

**消息协议**：`src/shared/messages.ts` 定义所有 content↔worker↔vocab 通信类型。

## FSRS-5 记忆调度

默认参数针对语言学习调校，详见 `docs/srs-strategy.md`：

- 新词学习阶段 (step 1→2) 失败不扣分，只影响前端队列
- Lapse 后恢复基于残余 stability，不完全重置
- 最大间隔 90 天
- 毕业后标记 `learned: true`

## 技术栈

TypeScript + Vite + [vite-plugin-web-extension](https://github.com/aklinker1/vite-plugin-web-extension) + [Sayo UI](https://github.com/user/sayo-ui)

## 目录结构

```
src/
  content/       # Content script — 划词监听、Shadow DOM 弹泡
    index.ts
  worker/        # Service Worker — 消息路由、FSRS、翻译 API
    index.ts
    srs.ts
    storage.ts
    translate.ts
    handlers/    # 按功能拆分的消息处理
  vocab/         # 生词本页面
    index.html / index.ts
    panels/      # learn / browse / stats 三个面板
    state.ts
    utils.ts     # escapeHtml, calcMastery, SVG 图标
    *.css        # 每个面板独立 CSS
  popup/         # 工具栏弹窗
  options/       # 设置页面
  shared/        # 共享类型与消息协议
    types.ts
    messages.ts
tests/
  srs.test.ts    # FSRS 调度器黑盒测试（19 项）
docs/
  srs-strategy.md
```

## 测试

```bash
npx vitest run tests/srs.test.ts
```

## 许可

MIT
