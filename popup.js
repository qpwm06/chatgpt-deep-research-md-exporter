const statusNode = document.getElementById('status');
const summaryNode = document.getElementById('summary');
const warningsNode = document.getElementById('warnings');
const startButton = document.getElementById('startButton');
const latexFixButton = document.getElementById('latexFixButton');
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
let cachedTabUrl = null;
let cachedPrefix = 'gpt-';
let currentLocale = 'en';

const MESSAGES = {
  en: {
    hero_title: 'Markdown Export',
    hero_subtitle: 'Export the open full-screen report from a ChatGPT conversation to `.md`.',
    prefix_label: 'Title Prefix',
    status_idle: 'Open the report full screen, then start detection.',
    status_checking: 'Checking current tab…',
    status_generating: 'Generating Markdown…',
    status_ready: 'Page detected. You can download or copy now.',
    status_download_started: 'Markdown download started.',
    status_copied: 'Markdown copied to clipboard.',
    status_latex_fixed: 'LaTeX display delimiters were converted to `$$`.',
    status_latex_unchanged: 'No LaTeX display formulas using `\\[ ... \\]` or bare `[ ... ]` were found.',
    start_button: 'Start Detection',
    latex_fix_button: 'Fix LaTeX $',
    download_button: 'Download Markdown',
    copy_button: 'Copy Markdown',
    tips_title: 'How To Use',
    tip1: 'Open a specific ChatGPT conversation, then open its Deep Research report full screen.',
    tip2: 'If source URLs are incomplete, expand the page’s Sources panel before exporting.',
    tip3: 'The extension rebuilds Markdown from the page instead of relying on ChatGPT’s default download.',
    summary_title: 'Title',
    summary_sources: 'Source Links',
    summary_citations: 'Inline Citations',
    summary_length: 'Markdown Length',
    summary_latex_fixes: 'LaTeX Fixes Available',
    error_tab: 'No readable active tab was found.',
    error_page: 'Please open a Deep Research report in a ChatGPT conversation first.',
    generic_export_failed: 'Export failed.',
    generic_download_failed: 'Download failed.',
    generic_copy_failed: 'Copy failed.',
  },
  'zh-CN': {
    hero_title: 'Markdown 导出',
    hero_subtitle: '直接把 ChatGPT 对话中已打开的全屏报告导出为 `.md`。',
    prefix_label: '标题前缀',
    status_idle: '请先打开目标报告的全屏视图，然后点击开始识别。',
    status_checking: '正在检查当前标签页…',
    status_generating: '正在生成 Markdown…',
    status_ready: '页面已识别，可以下载或复制。',
    status_download_started: 'Markdown 已开始下载。',
    status_copied: 'Markdown 已复制到剪贴板。',
    status_latex_fixed: '已将 LaTeX 行间公式分隔符转换为 `$$`。',
    status_latex_unchanged: '没有发现使用 `\\[ ... \\]` 或裸 `[ ... ]` 的 LaTeX 行间公式。',
    start_button: '开始识别',
    latex_fix_button: 'LaTeX $ 修正',
    download_button: '下载 Markdown',
    copy_button: '复制 Markdown',
    tips_title: '使用说明',
    tip1: '进入具体 ChatGPT 对话，并先把其中的 Deep Research 报告全屏打开。',
    tip2: '如果来源 URL 提取不全，先把页面中的 Sources 区域展开后再导出。',
    tip3: '扩展不会调用 ChatGPT 自带下载，而是直接从页面内容生成 Markdown。',
    summary_title: '标题',
    summary_sources: '来源链接',
    summary_citations: '文内引用',
    summary_length: 'Markdown 长度',
    summary_latex_fixes: '可修正 LaTeX',
    error_tab: '没有可用的当前标签页。',
    error_page: '请先进入具体 ChatGPT 对话并打开 Deep Research 全屏报告。',
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
  startButton.textContent = t('start_button');
  latexFixButton.textContent = t('latex_fix_button');
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
  startButton.disabled = isBusy;
  latexFixButton.disabled = isBusy || !cachedExport || countLatexDisplayDelimiters(cachedExport.markdown) === 0;
  downloadButton.disabled = isBusy || !cachedExport;
  copyButton.disabled = isBusy || !cachedExport;
}

function setStatus(message) {
  statusNode.textContent = message;
}

function countLatexDisplayDelimiters(markdown) {
  return fixLatexDisplayDelimiters(markdown).replacementCount;
}

function looksLikeBareLatexFormula(formula) {
  const text = String(formula || '').trim();
  if (!text || /^https?:\/\//i.test(text)) return false;
  return (
    /\\[A-Za-z]+/.test(text)
    || /[_^]\s*(?:\{|[A-Za-z0-9])/.test(text)
    || /[=+*/<>]|(?:^|\s)-(?:\s|$)/.test(text)
  );
}

function fixLatexInMarkdownText(markdown) {
  let replacementCount = 0;
  let fixed = String(markdown || '').replace(/\\\[\s*([\s\S]*?)\s*\\\]/g, (_match, formula) => {
    replacementCount += 1;
    return `$$\n${String(formula || '').trim()}\n$$`;
  });

  fixed = fixed.replace(/(^|\n)[ \t]*\[\s*([^\n]*?)\s*\][ \t]*(?=\n|$)/g, (match, leadingNewline, formula) => {
    if (!looksLikeBareLatexFormula(formula)) return match;
    replacementCount += 1;
    return `${leadingNewline}$$\n${String(formula || '').trim()}\n$$`;
  });

  return { markdown: fixed, replacementCount };
}

function fixLatexDisplayDelimiters(markdown) {
  let replacementCount = 0;
  const parts = String(markdown || '').split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g);
  const fixed = parts.map((part) => {
    if (/^(?:```|~~~)/.test(part)) return part;
    const result = fixLatexInMarkdownText(part);
    replacementCount += result.replacementCount;
    return result.markdown;
  }).join('');

  return { markdown: fixed, replacementCount };
}

function renderSummary(result) {
  const lines = [
    `${t('summary_title')}: ${result.title || '-'}`,
    `${t('summary_sources')}: ${result.sourceCount}`,
    `${t('summary_citations')}: ${result.citationCount}`,
    `${t('summary_length')}: ${result.markdown.length}`,
    `${t('summary_latex_fixes')}: ${countLatexDisplayDelimiters(result.markdown)}`,
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

function isDirectConversationUrl(url) {
  try {
    return /(?:^|\/)c\/[a-z0-9-]+(?:\/|$)/i.test(new URL(url).pathname);
  } catch {
    return false;
  }
}

async function sendExportMessage(tab, message) {
  if (!isDirectConversationUrl(tab.url) || !chrome.webNavigation?.getAllFrames) {
    return chrome.tabs.sendMessage(tab.id, message);
  }

  let frames = [];
  try {
    frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id }) || [];
  } catch {}

  const deepResearchHost = 'connector-openai-deep-research.web-sandbox.oaiusercontent.com';
  const orderedFrameIds = frames
    .sort((left, right) => {
      const leftDeepResearch = String(left.url || '').includes(deepResearchHost) ? 1 : 0;
      const rightDeepResearch = String(right.url || '').includes(deepResearchHost) ? 1 : 0;
      if (leftDeepResearch !== rightDeepResearch) return rightDeepResearch - leftDeepResearch;
      if (left.frameId === 0) return 1;
      if (right.frameId === 0) return -1;
      return left.frameId - right.frameId;
    })
    .map((frame) => frame.frameId)
    .filter((frameId, index, items) => Number.isInteger(frameId) && items.indexOf(frameId) === index);

  if (!orderedFrameIds.includes(0)) orderedFrameIds.push(0);

  let openedSources = false;
  // 控制按钮与报告正文可能分属父子 frame；先跨 frame 展开来源，再读取正文。
  for (const frameId of orderedFrameIds) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'DEEP_RESEARCH_OPEN_SOURCES',
      }, { frameId });
      openedSources ||= response?.openedSources === true;
    } catch {}
  }
  if (openedSources) {
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }

  let lastResponse = null;
  let lastError = null;
  // Deep Research 正文位于跨域 iframe；逐帧请求可避免顶层错误抢先覆盖正确结果。
  for (const frameId of orderedFrameIds) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, message, { frameId });
      if (response?.ok) return response;
      if (response) lastResponse = response;
    } catch (error) {
      lastError = error;
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError || new Error(t('generic_export_failed'));
}

async function requestExport(force = false) {
  const tab = await getActiveTab();
  if (!tab?.id || !tab.url) {
    throw new Error(t('error_tab'));
  }

  if (!/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//i.test(tab.url)) {
    throw new Error(t('error_page'));
  }

  if (!force && cachedExport && cachedTabId === tab.id && cachedTabUrl === tab.url) {
    return cachedExport;
  }

  const response = await sendExportMessage(tab, {
    type: 'DEEP_RESEARCH_EXPORT_MARKDOWN',
    titlePrefix: currentPrefix(),
    sourceUrl: tab.url,
  });

  if (!response?.ok) {
    throw new Error(response?.error || t('generic_export_failed'));
  }

  cachedTabId = tab.id;
  cachedTabUrl = tab.url;
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

function fixCachedLatex() {
  if (!cachedExport) return;

  const fixed = fixLatexDisplayDelimiters(cachedExport.markdown);
  if (fixed.replacementCount === 0) {
    setStatus(t('status_latex_unchanged'));
    setBusy(false);
    return;
  }

  cachedExport = { ...cachedExport, markdown: fixed.markdown };
  renderSummary(cachedExport);
  setStatus(`${t('status_latex_fixed')} (${fixed.replacementCount})`);
  setBusy(false);
}

async function inspectCurrentTab() {
  cachedExport = null;
  cachedTabId = null;
  cachedTabUrl = null;
  setBusy(true);
  setStatus(t('status_checking'));

  try {
    const result = await requestExport(true);
    renderSummary(result);
    renderWarnings(result.warnings);
    setStatus(t('status_ready'));
  } catch (error) {
    cachedExport = null;
    cachedTabId = null;
    cachedTabUrl = null;
    renderWarnings([]);
    summaryNode.classList.add('hidden');
    setStatus(error instanceof Error ? error.message : String(error || t('generic_export_failed')));
  } finally {
    setBusy(false);
  }
}

startButton.addEventListener('click', inspectCurrentTab);
latexFixButton.addEventListener('click', fixCachedLatex);
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
  cachedTabUrl = null;
  renderWarnings([]);
  summaryNode.classList.add('hidden');
  setStatus(t('status_idle'));
  setBusy(false);
});
document.addEventListener('DOMContentLoaded', async () => {
  await loadLocale();
  await loadPrefix();
  setStatus(t('status_idle'));
  setBusy(false);
});

// 仅供真实 Chrome 回归测试使用；普通扩展弹窗不会带 reload 参数。
if (new URLSearchParams(location.search).get('reload') === '1') {
  document.title = 'Reloading extension';
  window.setTimeout(() => chrome.runtime.reload(), 100);
}
