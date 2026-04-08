# ChatGPT Deep Research Markdown Exporter Chrome Extension

English | 中文

Chrome extension for exporting **ChatGPT Deep Research** reports to **Markdown (.md)** with resolved inline citations.

Chrome 插件，用于把 **ChatGPT Deep Research** 报告导出为 **Markdown (.md)**，并把引用解析成可直接点击的真实链接。

Search-friendly names:

- ChatGPT Deep Research Markdown Exporter
- ChatGPT Deep Research Export to Markdown Chrome Extension
- ChatGPT Deep Research Citation Exporter
- ChatGPT Deep Research Markdown Chrome 插件
- ChatGPT Deep Research 导出 Markdown

## What It Does

- Exports ChatGPT Deep Research reports to `.md`
- Works especially well with **shared Deep Research links** such as `https://chatgpt.com/s/...`
- Extracts the embedded report body directly from the page when available
- Resolves ChatGPT internal research citations into inline Markdown links like `[2](url)`
- Keeps the Markdown clean for Obsidian, Notion, Typora, and GitHub
- Supports direct download and clipboard copy

## 功能说明

- 将 ChatGPT Deep Research 报告导出为 `.md`
- 特别适合处理 **分享后的 Deep Research 链接**，例如 `https://chatgpt.com/s/...`
- 优先从页面内嵌数据中直接提取完整 report 正文
- 将 ChatGPT 内部引用解析为正文内联 Markdown 链接，如 `[2](url)`
- 导出的 Markdown 更适合导入 Obsidian、Notion、Typora、GitHub
- 支持直接下载和复制到剪贴板

## Why This Extension Exists

ChatGPT's default Deep Research export may leave citations in ChatGPT-internal form, which is inconvenient outside the original page.

This extension rebuilds the report from the page itself, so a shared Deep Research page can be exported as a reusable Markdown document with complete clickable citations.

ChatGPT 默认的 Deep Research 导出常常会留下 ChatGPT 内部引用格式，离开原页面后不方便使用。

这个插件会直接从页面中重建报告，因此可以把 **分享后的 Deep Research 页面** 导出成带完整可点击引用的 Markdown 文档。

## Supported Pages

- ChatGPT Deep Research shared links: `https://chatgpt.com/s/...`
- ChatGPT full-page Deep Research report views on `chatgpt.com`
- `chat.openai.com` pages that expose the same report structure

## 支持页面

- ChatGPT Deep Research 分享链接：`https://chatgpt.com/s/...`
- `chatgpt.com` 上的 Deep Research 全屏报告页
- `chat.openai.com` 上暴露相同结构的报告页面

## Installation

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder: `chatgpt-deep-research-md-exporter`

## 安装方法

1. 打开 `chrome://extensions`
2. 打开 `开发者模式`
3. 点击 `加载已解压的扩展程序`
4. 选择目录：`chatgpt-deep-research-md-exporter`

## Usage

1. Open a shared ChatGPT Deep Research link or full report page
2. Click the extension icon
3. Optionally set a title prefix, default: `gpt-`
4. Click `Download Markdown` or `Copy Markdown`

## 使用方法

1. 打开分享后的 ChatGPT Deep Research 链接，或完整报告页面
2. 点击插件图标
3. 可选设置标题前缀，默认：`gpt-`
4. 点击 `下载 Markdown` 或 `复制 Markdown`

## Output Behavior

- The exported title can be prefixed, default `gpt-`
- Inline citations are converted to Markdown links
- Shared-link pages prefer structured embedded report extraction
- DOM-based extraction remains as a fallback for compatible full-page report views

## 导出行为

- 导出的标题可加前缀，默认 `gpt-`
- 正文引用会转换成 Markdown 内联链接
- 对分享链接页面，优先使用页面内嵌结构化 report 提取
- 对兼容的全屏报告页面，保留 DOM 提取作为 fallback

## Files

- `manifest.json`: Chrome MV3 extension manifest
- `popup.html` / `popup.css` / `popup.js`: popup UI and export actions
- `content.js`: extraction, citation resolution, and Markdown generation

## 注意事项

- 本项目不调用 OpenAI 私有接口
- 页面结构如果后续变化，可能需要更新选择器或解析规则
- 某些页面如果没有暴露足够的 report 数据，导出会退回 DOM 提取逻辑

## Keywords

`ChatGPT Deep Research`, `Deep Research Markdown`, `ChatGPT Chrome Extension`, `ChatGPT citation export`, `shared deep research link`, `Markdown exporter`, `Chrome extension`
