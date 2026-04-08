# ChatGPT Deep Research Markdown Exporter Chrome 插件

[English](README.md) | 中文

用于将 **ChatGPT Deep Research** 报告导出为 **Markdown (.md)** 的 Chrome 插件，并将内部引用解析为可直接点击的链接。

便于搜索的名称：

- ChatGPT Deep Research Markdown Exporter
- ChatGPT Deep Research 导出 Markdown Chrome 插件
- ChatGPT Deep Research 引用导出插件
- ChatGPT Deep Research 分享链接导出 Markdown

## 功能说明

- 将 ChatGPT Deep Research 报告导出为 `.md`
- 特别适合处理分享后的 Deep Research 链接，例如 `https://chatgpt.com/s/...`
- 页面暴露内嵌 report 数据时，优先直接提取完整正文
- 将 ChatGPT 内部研究引用转换为正文内联 Markdown 链接，如 `[2](url)`
- 导出结果更适合导入 Obsidian、Notion、Typora、GitHub
- 支持直接下载和复制到剪贴板

## 为什么要做这个插件

ChatGPT Deep Research 默认导出有时会保留 ChatGPT 内部引用格式，离开原页面后不方便使用。

这个插件会直接从页面中重建报告，因此可以把分享后的 Deep Research 页面导出成带完整可点击引用的 Markdown 文档。

## 支持页面

- ChatGPT Deep Research 分享链接：`https://chatgpt.com/s/...`
- `chatgpt.com` 上的 Deep Research 全屏报告页
- `chat.openai.com` 上暴露相同结构的报告页面

## 安装方法

1. 打开 `chrome://extensions`
2. 打开 `开发者模式`
3. 点击 `加载已解压的扩展程序`
4. 选择目录：`chatgpt-deep-research-md-exporter`

## 使用方法

1. 打开分享后的 ChatGPT Deep Research 链接，或完整报告页面
2. 点击插件图标
3. 可选设置标题前缀，默认：`gpt-`
4. 点击 `下载 Markdown` 或 `复制 Markdown`

## 导出行为

- 导出的标题可加前缀，默认 `gpt-`
- 正文引用会转换成 Markdown 内联链接
- 对分享链接页面，优先使用页面内嵌结构化 report 提取
- 对兼容的全屏报告页面，保留 DOM 提取作为 fallback

## 文件说明

- `manifest.json`: Chrome MV3 插件清单
- `popup.html` / `popup.css` / `popup.js`: 弹窗界面与导出交互
- `content.js`: 报告提取、引用解析与 Markdown 生成逻辑

## 注意事项

- 本项目不调用 OpenAI 私有接口
- 如果 ChatGPT 页面结构后续调整，可能需要更新选择器或解析规则
- 某些页面若未暴露足够的 report 数据，会回退到 DOM 提取逻辑

## 关键词

`ChatGPT Deep Research`, `Deep Research Markdown`, `ChatGPT Chrome Extension`, `ChatGPT 引用导出`, `分享 deep research 链接`, `Markdown 导出`, `Chrome 插件`
