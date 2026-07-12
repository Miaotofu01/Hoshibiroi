# 划词翻译 (Translate Extension)

Chrome MV3 划词翻译插件。Tokyo Night 暗色主题。

## 安装（开发模式）

1. `npm install && npm run build`
2. 打开 `chrome://extensions`，开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择 `dist/` 目录

## 使用

1. 在任意网页选中英文/中文文字
2. 点击选区旁边的 🔤 按钮（或按 `Alt+T`）
3. 浮动弹窗显示翻译，可展开侧边栏查看详情

## 配置翻译源

点击工具栏图标 → ⚙️ 设置，或右键图标 → 选项：
- **DeepSeek**：默认启用，需填入 API Key（https://platform.deepseek.com）
- **Google Translate**：无需 API Key，但需要代理
- **腾讯云 TMT / 百度翻译**：国内直连，需申请 API Key
- **DeepL**：质量最高，需 API Key

## 快捷键

- `Alt+T` — 翻译选中文字
- `Alt+R` — 朗读原文
- `Esc` — 关闭弹窗

## 技术栈

TypeScript + Vite + Lit + vite-plugin-web-extension

---

## 手动测试清单（未自动执行）

构建完成后，在 `chrome://extensions` 中加载 `dist/` 目录，然后逐项测试：

1. [ ] 打开任意英文网页，选中一个单词 → 应出现 🔤 触发按钮
2. [ ] 点击 🔤 → 应出现翻译弹窗（Google Translate 默认可用）
3. [ ] 点击弹窗中的 🎵 → 应听到发音
4. [ ] 点击 📖 展开详情 → 应出现侧边栏
5. [ ] 点击侧边栏外 / Esc → 应关闭
6. [ ] 点击工具栏图标 → 应出现 Popup
7. [ ] 点击 Popup 中的 ⚙️ 设置 → 应打开 Options 页面
8. [ ] 在 Options 中配置 DeepSeek API key → 保存 → 翻译应优先使用 DeepSeek
9. [ ] 选中中文文字 → 应翻译成英文
