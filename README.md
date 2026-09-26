# ChatGPT Deep Research Markdown Exporter Chrome / Firefox Extension

English | [中文](README.zh-CN.md)

Chrome and Firefox extension for exporting an open **ChatGPT Deep Research full-screen report** directly from its conversation to **Markdown (.md)** with resolved inline citations.

Search-friendly names:

- ChatGPT Deep Research Markdown Exporter
- ChatGPT Deep Research Export to Markdown Chrome Extension
- ChatGPT Deep Research Export to Markdown Firefox Add-on
- ChatGPT Deep Research Citation Exporter
- ChatGPT Conversation Report Exporter

## What It Does

- Exports ChatGPT Deep Research reports to `.md`
- Works directly in a specific ChatGPT conversation; no shared link is required
- Exports only the currently open full-screen report on direct conversation pages
- Keeps legacy structured extraction for compatible shared pages
- Resolves ChatGPT internal research citations into inline Markdown links like `[2](url)`
- Expands a merged citation into every source card actually present in its carousel, while keeping single-source citations single
- Preserves citation links inside Markdown tables
- Opens ChatGPT's `Show code` view to export Mermaid source instead of rendered SVG markup
- Keeps the output clean for Obsidian, Notion, Typora, and GitHub
- Supports direct download and clipboard copy

## Why This Extension Exists

ChatGPT Deep Research exports may leave citations in ChatGPT-internal form, which is inconvenient outside the original page.

This extension rebuilds the report from the currently open conversation page, so a Deep Research report can be exported without creating a shared link first.

## Supported Page Types

- Direct conversations: `https://chatgpt.com/c/...`
- Project conversations: `https://chatgpt.com/g/.../c/...`
- Compatible legacy shared report pages remain supported as a fallback
- Reports rendered inside ChatGPT's sandboxed frames on `*.web-sandbox.oaiusercontent.com`, including both `connector-openai-deep-research` and the newer `mcp-app-*` hosts

## Installation

### Chrome

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder: `chatgpt-deep-research-md-exporter`

### Firefox

Also works in Firefox-based browsers such as Zen and Waterfox.

1. Open `about:debugging#/runtime/this-firefox`
2. Click `Load Temporary Add-on…`
3. Select `manifest.json` in this folder

In Firefox, `Download Markdown` saves straight to your default downloads folder without a Save dialog, because Firefox's Save dialog closes the popup before the file is read, which makes the download fail.

Temporary add-ons are removed when the browser restarts. A permanent install requires the add-on to be signed by Mozilla, for example as an unlisted add-on on addons.mozilla.org.

## Usage

1. Open the specific ChatGPT conversation containing the Deep Research result
2. Open the report in full-screen view
3. Click the extension icon
4. Optionally set a title prefix, default: `gpt-`
5. Click `Start Detection`
6. If available, click `Fix LaTeX $` to convert `\[ ... \]` or math-only `[ ... ]` blocks to `$$ ... $$`
7. Click `Download Markdown` or `Copy Markdown`

## Output Behavior

- The exported title can be prefixed, default `gpt-`
- Inline citations are converted to Markdown links
- Multiple source cards attached to one citation are exported as distinct numbered links
- Domain-group headers are ignored so unrelated same-domain URLs are not attached to a citation
- Mermaid diagrams are exported from their source-code view
- Full-screen report content is preferred over the surrounding conversation
- User prompts, the composer, and unrelated assistant replies are excluded
- Optional LaTeX correction converts `\[ ... \]` and math-only `[ ... ]` display delimiters while leaving Markdown links, plain bracketed text, and code blocks intact

## Files

- `manifest.json`: MV3 extension manifest for Chrome and Firefox
- `popup.html` / `popup.css` / `popup.js`: popup UI and export actions
- `content.js`: extraction, citation resolution, and Markdown generation
- `page-bridge.js`: narrowly scoped bridge for ChatGPT's citation tooltip controls

## Notes

- This project does not call private OpenAI APIs
- If ChatGPT changes its page structure, selectors or parsing rules may need updates
- Open the full-screen report before exporting for the most reliable result
- Direct conversation export stops with a clear prompt when no full-screen report is open

## Friend Link

- Community friend link: [LINUX DO](https://linux.do)

## Keywords

`ChatGPT Deep Research`, `Deep Research Markdown`, `ChatGPT Chrome Extension`, `ChatGPT Firefox Add-on`, `ChatGPT citation export`, `conversation report`, `Markdown exporter`, `Chrome extension`
