# 贡献指南

感谢你愿意帮助星拾 (Hoshibiroi) 变得更好！任何形式的贡献都欢迎：报告 Bug、提交功能建议、改进文档、提交代码。

## 快速开始

```bash
git clone git@github.com:Miaotofu01/Hoshibiroi.git
cd Hoshibiroi
npm install
npm run dev        # 开发模式，dist/ 自动更新
```

加载到 Chrome：`chrome://extensions` → 开发者模式 → 加载已解压的扩展程序 → 选择 `dist/`。

## 提 Issue

- **Bug 报告**：请使用 Bug 模板，说明复现步骤、期望行为、实际行为、环境（Chrome 版本/OS）。
- **功能建议**：请使用 Feature 模板，说明使用场景和期望效果——「我想解决什么问题」比「我想要某个功能」更有价值。

## 提 PR

1. 从 `main` 切分支：`git checkout -b feat/your-feature`
2. 提交信息用 [Conventional Commits](https://www.conventionalcommits.org/) 风格：
   - `feat:` 新功能 · `fix:` 修 Bug · `docs:` 文档 · `refactor:` 重构 · `perf:` 性能 · `chore:` 杂项
3. 改动前后请确保：

```bash
npm run build                 # 构建通过
npx tsc --noEmit              # 类型检查零错误
```

4. PR 描述里说明改动动机和验证方式。小改动（文档、样式微调）直接提即可，大改动建议先开 Issue 讨论方案。

## 代码约定

- 架构与消息协议见 [CLAUDE.md](CLAUDE.md)（内容脚本 / Service Worker / 生词本页三段式）
- 所有 content↔worker↔vocab 通信必须在 `src/shared/messages.ts` 里定义类型，禁止裸对象消息
- FSRS-5 调度逻辑在 `src/worker/srs.ts`，参数调优理由记录在 [docs/srs-strategy.md](docs/srs-strategy.md)
- UI 基于自研 Sayo UI 组件库（`.syo-*` 类），Shadow DOM 内需同步 token（`src/content/styles/theme.css`）
- SVG 图标一律内联（`src/vocab/utils.ts` 的 `ico()`），不引入外部图标库

## 测试

```bash
npx vitest run tests/          # SRS 调度器黑盒测试等
```

## 行为准则

- 友善、具体、就事论事。技术讨论不上升人身。
