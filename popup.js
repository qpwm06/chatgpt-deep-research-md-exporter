const statusNode = document.getElementById('status');
const summaryNode = document.getElementById('summary');
const warningsNode = document.getElementById('warnings');
const downloadButton = document.getElementById('downloadButton');
const copyButton = document.getElementById('copyButton');
const titlePrefixInput = document.getElementById('titlePrefixInput');
const localeEnButton = document.getElementById('localeEnButton');
const localeZhButton = document.getElementById('localeZhButton');
const heroTitleNode = document.getElementById('heroTitle');
const heroSubtitleNode = document.getElementById('heroSubtitle');
const prefixLabelNode = document.getElementById('prefixLabel');
const tipsTitleNode = document.getElementById('tipsTitle');
const tip1Node = document.getElementById('tip1');
const tip2Node = document.getElementById('tip2');
const tip3Node = document.getElementById('tip3');

let cachedExport = null;
let cachedTabId = null;
let cachedPrefix = 'gpt-';
let currentLocale = 'en';

const MESSAGES = {
  en: {
    hero_title: 'Markdown Export',
    hero_subtitle: 'Export the full report to `.md` and preserve source links whenever possible.',
    prefix_label: 'Title Prefix',
    status_checking: 'Checking current tab…',
    status_generating: 'Generating Markdown…',
    status_ready: 'Page detected. You can download or copy now.',
    status_download_started: 'Markdown download started.',
    status_copied: 'Markdown copied to clipboard.',
    download_button: 'Download Markdown',
    copy_button: 'Copy Markdown',
    tips_title: 'How To Use',
    tip1: 'Use this on a ChatGPT Deep Research full report page.',
    tip2: 'If source URLs are incomplete, expand the page’s Sources panel before exporting.',
    tip3: 'The extension rebuilds Markdown from the page instead of relying on ChatGPT’s default download.',
    summary_title: 'Title',
    summary_sources: 'Source Links',
    summary_citations: 'Inline Citations',
    summary_length: 'Markdown Length',
    error_tab: 'No readable active tab was found.',
    error_page: 'Please switch to a ChatGPT Deep Research report page first.',
    generic_export_failed: 'Export failed.',
    generic_download_failed: 'Download failed.',
    generic_copy_failed: 'Copy failed.',
  },
  'zh-CN': {
    hero_title: 'Markdown 导出',
    hero_subtitle: '把全屏报告导出为可用的 `.md`，并尽量保留来源链接。',
    prefix_label: '标题前缀',
    status_checking: '正在检查当前标签页…',
    status_generating: '正在生成 Markdown…',
    status_ready: '页面已识别，可以下载或复制。',
    status_download_started: 'Markdown 已开始下载。',
    status_copied: 'Markdown 已复制到剪贴板。',
    download_button: '下载 Markdown',
    copy_button: '复制 Markdown',
    tips_title: '使用说明',
    tip1: '在 ChatGPT Deep Research 的全屏报告页使用。',
    tip2: '如果来源 URL 提取不全，先把页面中的 Sources 区域展开后再导出。',
    tip3: '扩展不会调用 ChatGPT 自带下载，而是直接从页面内容生成 Markdown。',
    summary_title: '标题',
    summary_sources: '来源链接',
    summary_citations: '文内引用',
    summary_length: 'Markdown 长度',
    error_tab: '没有可用的当前标签页。',
    error_page: '请先切到 ChatGPT 的 Deep Research 全屏报告页面。',
    generic_export_failed: '导出失败。',
    generic_download_failed: '下载失败。',
    generic_copy_failed: '复制失败。',
  },
};

function t(key) {
  return MESSAGES[currentLocale]?.[key] || MESSAGES.en[key] || key;
}

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

async function readStoredLocale() {
  try {
    const stored = String(localStorage.getItem('uiLocale') || 'en');
    return stored === 'zh-CN' ? 'zh-CN' : 'en';
  } catch {
    return 'en';
  }
}

async function writeStoredLocale(locale) {
  try {
    localStorage.setItem('uiLocale', locale);
  } catch {}
}

function applyLocale() {
  document.documentElement.lang = currentLocale;
  document.title = currentLocale === 'zh-CN' ? 'Deep Research 导出' : 'Deep Research Export';
  heroTitleNode.textContent = t('hero_title');
  heroSubtitleNode.textContent = t('hero_subtitle');
  prefixLabelNode.textContent = t('prefix_label');
  downloadButton.textContent = t('download_button');
  copyButton.textContent = t('copy_button');
  tipsTitleNode.textContent = t('tips_title');
  tip1Node.textContent = t('tip1');
  tip2Node.textContent = t('tip2');
  tip3Node.textContent = t('tip3');
  localeEnButton.classList.toggle('active', currentLocale === 'en');
  localeZhButton.classList.toggle('active', currentLocale === 'zh-CN');
}

async function loadLocale() {
  currentLocale = await readStoredLocale();
  applyLocale();
}

async function saveLocale(locale) {
  currentLocale = locale === 'zh-CN' ? 'zh-CN' : 'en';
  await writeStoredLocale(currentLocale);
  applyLocale();
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
    `${t('summary_title')}: ${result.title || '-'}`,
    `${t('summary_sources')}: ${result.sourceCount}`,
    `${t('summary_citations')}: ${result.citationCount}`,
    `${t('summary_length')}: ${result.markdown.length}`,
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
    throw new Error(t('error_tab'));
  }

  if (!/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//i.test(tab.url)) {
    throw new Error(t('error_page'));
  }

  if (!force && cachedExport && cachedTabId === tab.id) {
    return cachedExport;
  }

  const response = await chrome.tabs.sendMessage(tab.id, {
    type: 'DEEP_RESEARCH_EXPORT_MARKDOWN',
    titlePrefix: currentPrefix(),
  });

  if (!response?.ok) {
    throw new Error(response?.error || t('generic_export_failed'));
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
  setStatus(t('status_generating'));

  try {
    const result = await requestExport(false);
    renderSummary(result);
    renderWarnings(result.warnings);

    const url = buildDownloadUrl(result.markdown);
    await chrome.downloads.download({
      url,
      filename: sanitizeFilename(result.filename),
      saveAs: true,
    });
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    setStatus(t('status_download_started'));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error || t('generic_download_failed')));
  } finally {
    setBusy(false);
  }
}

async function copyMarkdown() {
  setBusy(true);
  setStatus(t('status_generating'));

  try {
    const result = await requestExport(false);
    renderSummary(result);
    renderWarnings(result.warnings);
    await navigator.clipboard.writeText(result.markdown);
    setStatus(t('status_copied'));
  } catch (error) {
    setStatus(error instanceof Error ? error.message : String(error || t('generic_copy_failed')));
  } finally {
    setBusy(false);
  }
}

async function inspectCurrentTab() {
  setBusy(true);
  setStatus(t('status_checking'));

  try {
    const result = await requestExport(true);
    renderSummary(result);
    renderWarnings(result.warnings);
    setStatus(t('status_ready'));
  } catch (error) {
    renderWarnings([]);
    summaryNode.classList.add('hidden');
    setStatus(error instanceof Error ? error.message : String(error || t('generic_export_failed')));
  } finally {
    setBusy(false);
  }
}

downloadButton.addEventListener('click', downloadMarkdown);
copyButton.addEventListener('click', copyMarkdown);
localeEnButton.addEventListener('click', async () => {
  await saveLocale('en');
});
localeZhButton.addEventListener('click', async () => {
  await saveLocale('zh-CN');
});
titlePrefixInput.addEventListener('change', async () => {
  await savePrefix(currentPrefix());
  cachedExport = null;
  cachedTabId = null;
  inspectCurrentTab();
});
document.addEventListener('DOMContentLoaded', async () => {
  await loadLocale();
  await loadPrefix();
  inspectCurrentTab();
});
