# ChatGPT Deep Research Markdown Exporter Chrome 插件

[English](README.md) | 中文

用于从具体 ChatGPT 对话中直接导出已打开的 **Deep Research 全屏报告**，生成 **Markdown (.md)** 并将内部引用解析为可点击链接。

便于搜索的名称：

- ChatGPT Deep Research Markdown Exporter
- ChatGPT Deep Research 导出 Markdown Chrome 插件
- ChatGPT Deep Research 引用导出插件
- ChatGPT 对话报告导出 Markdown

## 功能说明

- 将 ChatGPT Deep Research 报告导出为 `.md`
- 直接在具体 ChatGPT 对话中工作，不需要先生成分享或邀请链接
- 在具体对话页只提取当前打开的全屏报告，不再自动选择最后一条助手消息
- 继续兼容能够提供结构化报告数据的旧分享页
- 将 ChatGPT 内部研究引用转换为正文内联 Markdown 链接，如 `[2](url)`
- 导出结果更适合导入 Obsidian、Notion、Typora、GitHub
- 支持直接下载和复制到剪贴板

## 为什么要做这个插件

ChatGPT Deep Research 默认导出有时会保留 ChatGPT 内部引用格式，离开原页面后不方便使用。

这个插件会直接从当前对话页面重建报告，因此无需先创建分享链接，也能导出带可点击引用的 Markdown 文档。

## 支持页面类型

- 普通具体对话：`https://chatgpt.com/c/...`
- 项目内具体对话：`https://chatgpt.com/g/.../c/...`
- 兼容的旧版报告分享页仍作为后备路径保留

## 安装方法

1. 打开 `chrome://extensions`
2. 打开 `开发者模式`
3. 点击 `加载已解压的扩展程序`
4. 选择目录：`chatgpt-deep-research-md-exporter`

## 使用方法

1. 打开包含 Deep Research 结果的具体 ChatGPT 对话
2. 将报告打开为全屏视图
3. 点击插件图标
4. 可选设置标题前缀，默认：`gpt-`
5. 点击 `开始识别`
6. 如果按钮可用，可点击 `LaTeX $ 修正`，将 `\[ ... \]` 或仅含数学内容的 `[ ... ]` 块转换为 `$$ ... $$`
7. 点击 `下载 Markdown` 或 `复制 Markdown`

## 导出行为

- 导出的标题可加前缀，默认 `gpt-`
- 正文引用会转换成 Markdown 内联链接
- 全屏报告正文优先于外围聊天内容
- 用户提问、输入框和无关助手回复不会进入导出结果
- 可选的 LaTeX 修正支持 `\[ ... \]` 和仅含数学内容的 `[ ... ]`，不会修改 Markdown 链接、普通方括号文本或代码块

## 文件说明

- `manifest.json`: Chrome MV3 插件清单
- `popup.html` / `popup.css` / `popup.js`: 弹窗界面与导出交互
- `content.js`: 报告提取、引用解析与 Markdown 生成逻辑

## 注意事项

- 本项目不调用 OpenAI 私有接口
- 如果 ChatGPT 页面结构后续调整，可能需要更新选择器或解析规则
- 为获得最稳定的结果，请先打开全屏报告再导出
- 未打开全屏报告时会明确提示，不会从多轮会话中猜测目标报告

## 友链

- 社区友链：[LINUX DO](https://linux.do)

## 关键词

`ChatGPT Deep Research`, `Deep Research Markdown`, `ChatGPT Chrome Extension`, `ChatGPT 引用导出`, `对话报告`, `Markdown 导出`, `Chrome 插件`
