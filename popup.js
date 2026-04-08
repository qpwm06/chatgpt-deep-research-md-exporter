const statusNode = document.getElementById('status');
const summaryNode = document.getElementById('summary');
const warningsNode = document.getElementById('warnings');
const downloadButton = document.getElementById('downloadButton');
const copyButton = document.getElementById('copyButton');
const titlePrefixInput = document.getElementById('titlePrefixInput');

let cachedExport = null;
let cachedTabId = null;
let cachedPrefix = 'gpt-';

async function readStoredPrefix() {
  try {
    return String(localStorage.getItem('titlePrefix') || 'gpt-');
  } catch {
    return 'gpt-';
  }
}

async function writeStoredPrefix(prefix) {
  try {
    localStorage.setItem('titlePrefix', prefix);
  } catch {}
}

async function loadPrefix() {
  cachedPrefix = await readStoredPrefix();
  titlePrefixInput.value = cachedPrefix;
}

async function savePrefix(prefix) {
  cachedPrefix = String(prefix || '');
  await writeStoredPrefix(cachedPrefix);
}

function currentPrefix() {
  return String(titlePrefixInput.value || '').trim();
}

function setBusy(isBusy) {
  downloadButton.disabled = isBusy;
  copyButton.disabled = isBusy;
}

function setStatus(message) {
  statusNode.textContent = message;
}

function renderSummary(result) {
  const lines = [
    `标题：${result.title || '未识别'}`,
    `来源链接：${result.sourceCount}`,
    `文内引用：${result.citationCount}`,
    `Markdown 长度：${result.markdown.length} 字符`,
  ];

  summaryNode.innerHTML = '';
  for (const line of lines) {
    const row = document.createElement('div');
    row.textContent = line;
    summaryNode.appendChild(row);
  }
  summaryNode.classList.remove('hidden');
}

function renderWarnings(warnings) {
  if (!warnings || warnings.length === 0) {
    warningsNode.classList.add('hidden');
    warningsNode.textContent = '';
    return;
  }

  warningsNode.textContent = warnings.join('\n');
  warningsNode.classList.remove('hidden');
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] || null;
}

async function requestExport(force = false) {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url) {
    throw new Error('没有可用的当前标签页。');
  }

  if (!/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//i.test(tab.url)) {
    throw new Error('请先切到 ChatGPT 的 Deep Research 全屏报告页面。');
  }

  if (!force && cachedExport && cachedTabId === tab.id) {
    return cachedExport;
  }

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: 'DEEP_RESEARCH_EXPORT_MARKDOWN',
    titlePrefix: currentPrefix(),
  });

  if (!response?.ok) {
    throw new Error(response?.error || '导出失败。');
  }

  cachedTabId = tab.id;
  cachedExport = response.result;
  return response.result;
}

function buildDownloadUrl(markdown) {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  return URL.createObjectURL(blob);
}

function sanitizeFilename(name) {
  const cleaned = String(name || 'deep-research-report')
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);

  return `${cleaned || 'deep-research-report'}.md`;
}

async function downloadMarkdown() {
  setBusy(true);
  setStatus('正在生成 Markdown…');

  try {
    const result = await requestExport(true);
    renderSummary(result);
    renderWarnings(result.warnings);

    const url = buildDownloadUrl(result.markdown);
    await chrome.downloads.download({
      url,
      filename: sanitizeFilename(result.filename),
      saveAs: true,
    });
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    setStatus('Markdown 已开始下载。');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error || '下载失败。'));
  } finally {
    setBusy(false);
  }
}

async function copyMarkdown() {
  setBusy(true);
  setStatus('正在生成 Markdown…');

  try {
    const result = await requestExport(true);
    renderSummary(result);
    renderWarnings(result.warnings);
    await navigator.clipboard.writeText(result.markdown);
    setStatus('Markdown 已复制到剪贴板。');
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error || '复制失败。'));
  } finally {
    setBusy(false);
  }
}

async function inspectCurrentTab() {
  setBusy(true);
  setStatus('正在检查当前标签页…');

  try {
    await loadPrefix();
    const result = await requestExport(true);
    renderSummary(result);
    renderWarnings(result.warnings);
    setStatus('页面已识别，可以下载或复制。');
  } catch (error) {
    renderWarnings([]);
    summaryNode.classList.add('hidden');
    setStatus(error instanceof Error ? error.message : String(error || '检查失败。'));
  } finally {
    setBusy(false);
  }
}

downloadButton.addEventListener('click', downloadMarkdown);
copyButton.addEventListener('click', copyMarkdown);
titlePrefixInput.addEventListener('change', async () => {
  await savePrefix(currentPrefix());
  cachedExport = null;
  cachedTabId = null;
  inspectCurrentTab();
});
document.addEventListener('DOMContentLoaded', async () => {
  await loadPrefix();
  inspectCurrentTab();
});
