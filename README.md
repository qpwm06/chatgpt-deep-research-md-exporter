# ChatGPT Deep Research Markdown Exporter Chrome Extension

English | [中文](README.zh-CN.md)

Chrome extension for exporting **ChatGPT Deep Research** reports to **Markdown (.md)** with resolved inline citations.

Search-friendly names:

- ChatGPT Deep Research Markdown Exporter
- ChatGPT Deep Research Export to Markdown Chrome Extension
- ChatGPT Deep Research Citation Exporter
- ChatGPT Deep Research Shared Link Exporter

## What It Does

- Exports ChatGPT Deep Research reports to `.md`
- Works especially well with shared Deep Research links such as `https://chatgpt.com/s/...`
- Extracts the embedded report body directly from the page when available
- Resolves ChatGPT internal research citations into inline Markdown links like `[2](url)`
- Keeps the output clean for Obsidian, Notion, Typora, and GitHub
- Supports direct download and clipboard copy

## Why This Extension Exists

ChatGPT Deep Research exports may leave citations in ChatGPT-internal form, which is inconvenient outside the original page.

This extension rebuilds the report from the page itself, so a shared Deep Research page can be exported as reusable Markdown with complete clickable citations.

## Supported Pages

- ChatGPT Deep Research shared links: `https://chatgpt.com/s/...`
- ChatGPT full-page Deep Research report views on `chatgpt.com`
- `chat.openai.com` pages that expose the same report structure

## Installation

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select this folder: `chatgpt-deep-research-md-exporter`

## Usage

1. Open a shared ChatGPT Deep Research link or full report page
2. Click the extension icon
3. Optionally set a title prefix, default: `gpt-`
4. Click `Download Markdown` or `Copy Markdown`

## Output Behavior

- The exported title can be prefixed, default `gpt-`
- Inline citations are converted to Markdown links
- Shared-link pages prefer structured embedded report extraction
- DOM-based extraction remains as a fallback for compatible full-page report views

## Files

- `manifest.json`: Chrome MV3 extension manifest
- `popup.html` / `popup.css` / `popup.js`: popup UI and export actions
- `content.js`: extraction, citation resolution, and Markdown generation

## Notes

- This project does not call private OpenAI APIs
- If ChatGPT changes its page structure, selectors or parsing rules may need updates
- If a page does not expose enough report data, the exporter falls back to DOM extraction

## Keywords

`ChatGPT Deep Research`, `Deep Research Markdown`, `ChatGPT Chrome Extension`, `ChatGPT citation export`, `shared deep research link`, `Markdown exporter`, `Chrome extension`
