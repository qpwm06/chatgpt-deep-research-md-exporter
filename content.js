if (!globalThis.__deepResearchMarkdownExporterLoaded) {
  globalThis.__deepResearchMarkdownExporterLoaded = true;

  const SOURCE_HEADING_RE = /\b(sources?|references?)\b|来源|参考|引用/i;
  const TOC_HEADING_RE = /\b(table of contents|contents?)\b|目录/i;
  const REPORT_HEADING_RE = /\b(report|research)\b|报告|研究/i;
  const SKIP_SECTION_RE = /\b(table of contents|contents|sources?|references?|activity|history)\b|目录|来源|参考|引用|活动记录|过程/i;
  const INTERNAL_HOST_RE = /(^|\.)((chatgpt\.com)|(chat\.openai\.com))$/i;
  const CHAT_UI_RE = /\b(copy|share|retry|regenerate|edit|message chatgpt|ask anything)\b|复制|分享|重试|重新生成|继续追问|发送消息/i;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function normalizeText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function applyTitlePrefix(title, prefix) {
    const cleanTitle = normalizeText(title || '') || 'Deep Research Report';
    const cleanPrefix = String(prefix || '').trim();
    if (!cleanPrefix) return cleanTitle;
    if (cleanTitle.startsWith(cleanPrefix)) return cleanTitle;
    return `${cleanPrefix}${cleanTitle}`;
  }

  function quoteForJsonParse(value) {
    return `"${String(value || '')
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r')
      .replace(/\t/g, '\\t')}"`;
  }

  function decodeTransportString(value) {
    return JSON.parse(quoteForJsonParse(value));
  }

  function decodeEmbeddedText(value, options = {}) {
    let text = String(value || '');

    if (options.stripLeadingQuote) {
      text = text.replace(/^\\+"/, '');
    }

    text = text
      .replace(/\\+u([0-9a-fA-F]{4})/g, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
      .replace(/\\+n/g, '\n')
      .replace(/\\+r/g, '\r')
      .replace(/\\+t/g, '\t')
      .replace(/\\+"/g, '"')
      .replace(/\\+\//g, '/')
      .replace(/\\+(?=[^\s\\])/g, '')
      .replace(/\\$/gm, '');

    return text;
  }

  function collapseBlankLines(text) {
    const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let blankCount = 0;
    let inFence = false;

    for (const line of lines) {
      if (/^\s*```/.test(line)) {
        inFence = !inFence;
        blankCount = 0;
        out.push(line);
        continue;
      }

      if (inFence) {
        out.push(line);
        continue;
      }

      if (line.trim() === '') {
        blankCount += 1;
        if (blankCount <= 1) {
          out.push('');
        }
        continue;
      }

      blankCount = 0;
      out.push(line.replace(/\s+$/g, ''));
    }

    return out.join('\n').trim();
  }

  function firstHeadingFromMarkdown(markdown) {
    const match = String(markdown || '').match(/^#\s+(.+)$/m);
    return normalizeText(match?.[1] || '');
  }

  function cleanUrl(url) {
    return String(url || '')
      .replace(/\\+/g, '')
      .replace(/[)>.,;]+$/g, '')
      .trim();
  }

  function extractTransportPayloadsFromScripts() {
    const payloads = [];

    for (const script of Array.from(document.scripts)) {
      const text = script.textContent || '';
      if (!text.includes('streamController.enqueue(')) continue;

      const matches = text.matchAll(/streamController\.enqueue\("([\s\S]*?)"\);/g);
      for (const match of matches) {
        try {
          payloads.push(decodeTransportString(match[1]));
        } catch {}
      }
    }

    return payloads;
  }

  function extractEmbeddedReportBody(payload) {
    const match = payload.match(
      /report_message[\s\S]*?parts(?:\\)*": \[([\s\S]*?)(?:\\)*"]\}, (?:\\)*"status/s,
    );
    if (!match) return '';

    const body = decodeEmbeddedText(match[1], { stripLeadingQuote: true });
    return body
      .replace(/\uE200image_group[\s\S]*?\uE201/g, '')
      .trim();
  }

  function extractEmbeddedContentReferences(payload) {
    const references = [];
    const pattern = /matched_text(?:\\)*": (?:\\)*"([\s\S]*?)(?:\\)*", (?:\\)*"prefix(?:\\)*": [\s\S]*?safe_urls(?:\\)*": \[([\s\S]*?)\]/g;

    let match;
    while ((match = pattern.exec(payload))) {
      const matchedText = decodeEmbeddedText(match[1]);
      const urls = Array.from(match[2].matchAll(/https?:\/\/[^\s"\\]+/g), (item) => cleanUrl(item[0]))
        .filter(Boolean);

      if (!matchedText || urls.length === 0) continue;
      references.push({
        matchedText,
        urls: dedupeBy(urls, (item) => item),
      });
    }

    return dedupeBy(references, (item) => item.matchedText);
  }

  function buildEmbeddedReferenceMap(items) {
    const map = new Map();
    for (const item of items) {
      map.set(item.matchedText, item.urls);
    }
    return map;
  }

  function replaceEmbeddedCitations(markdown, referenceMap) {
    const urlNumbers = new Map();
    let nextNumber = 1;

    const assignNumber = (url) => {
      if (!urlNumbers.has(url)) {
        urlNumbers.set(url, nextNumber);
        nextNumber += 1;
      }
      return urlNumbers.get(url);
    };

    const body = String(markdown || '').replace(/\uE200cite[\s\S]*?\uE201/g, (matched) => {
      const urls = referenceMap.get(matched) || [];
      if (urls.length === 0) {
        return '';
      }

      return urls
        .map((url) => `[${assignNumber(url)}](${url})`)
        .join('');
    });

    return {
      markdown: body,
      citationCount: Array.from(urlNumbers.keys()).length,
      sourceCount: Array.from(urlNumbers.keys()).length,
    };
  }

  function extractStructuredReport(titlePrefix = '') {
    const payload = extractTransportPayloadsFromScripts().find((item) => (
      item.includes('report_message')
      && item.includes('content_references')
    ));

    if (!payload) return null;

    const markdownBody = extractEmbeddedReportBody(payload);
    if (!markdownBody) return null;

    const references = extractEmbeddedContentReferences(payload);
    const referenceMap = buildEmbeddedReferenceMap(references);
    const citationReplacement = replaceEmbeddedCitations(markdownBody, referenceMap);

    const title = applyTitlePrefix(
      firstHeadingFromMarkdown(markdownBody)
      || normalizeText(document.title.replace(/^ChatGPT\s*-\s*/i, ''))
      || 'Deep Research Report',
      titlePrefix,
    );

    const frontMatter = buildFrontMatter(title, location.href);
    const markdownBodyWithTitle = citationReplacement.markdown.replace(/^#\s+.+$/m, `# ${title}`);
    const markdown = collapseBlankLines(`${frontMatter}${markdownBodyWithTitle}`) + '\n';
    const warnings = [];

    if (citationReplacement.citationCount === 0) {
      warnings.push('识别到了内嵌 report，但没有命中 citation 映射。');
    }

    return {
      title,
      filename: title,
      markdown,
      sourceCount: citationReplacement.sourceCount,
      citationCount: citationReplacement.citationCount,
      warnings,
    };
  }

  function escapeInlineCode(text) {
    const raw = String(text || '');
    if (!raw) return '';
    const tickCount = Math.max(...Array.from(raw.matchAll(/`+/g), (match) => match[0].length), 0);
    const fence = '`'.repeat(tickCount + 1);
    return `${fence}${raw}${fence}`;
  }

  function escapeTableCell(text) {
    return String(text || '').replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
  }

  function toAbsoluteUrl(href) {
    try {
      return new URL(href, location.href).href;
    } catch {
      return '';
    }
  }

  function isVisible(element) {
    if (!(element instanceof Element)) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isExternalUrl(url) {
    if (!url) return false;
    try {
      const parsed = new URL(url);
      if (!/^https?:$/i.test(parsed.protocol)) return false;
      return !INTERNAL_HOST_RE.test(parsed.hostname);
    } catch {
      return false;
    }
  }

  function dedupeBy(items, keyGetter) {
    const out = [];
    const seen = new Set();
    for (const item of items) {
      const key = keyGetter(item);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  }

  function nearestBlock(element) {
    let cursor = element;
    while (cursor && cursor !== document.body) {
      if (
        cursor.matches?.('li, article, section, div, aside, tr')
        && normalizeText(cursor.textContent).length <= 1200
      ) {
        return cursor;
      }
      cursor = cursor.parentElement;
    }
    return element;
  }

  function looksLikeSourceHeading(text) {
    return SOURCE_HEADING_RE.test(normalizeText(text));
  }

  function looksLikeTocHeading(text) {
    return TOC_HEADING_RE.test(normalizeText(text));
  }

  function maybeOpenSourcesPanels() {
    const candidates = Array.from(document.querySelectorAll('button, [role="button"], [role="tab"], summary'))
      .filter((node) => isVisible(node))
      .filter((node) => looksLikeSourceHeading(node.textContent || node.getAttribute?.('aria-label') || ''));

    for (const element of candidates.slice(0, 3)) {
      try {
        element.click();
      } catch {}
    }
  }

  function collectSourceSections() {
    const sections = [];
    const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'))
      .filter((node) => isVisible(node))
      .filter((node) => looksLikeSourceHeading(node.textContent));

    for (const heading of headings) {
      let container = heading.closest('section, aside, nav, article');
      if (!container) {
        container = heading.parentElement;
      }

      while (container && container !== document.body) {
        const textLength = normalizeText(container.textContent).length;
        const externalLinks = Array.from(container.querySelectorAll('a[href]'))
          .map((link) => toAbsoluteUrl(link.getAttribute('href')))
          .filter((href) => isExternalUrl(href));

        if (textLength > 0 && textLength <= 12000 && externalLinks.length > 0) {
          sections.push(container);
          break;
        }

        container = container.parentElement;
      }
    }

    return dedupeBy(sections, (item) => item);
  }

  function parseSourceIndex(text, fallback) {
    const normalized = normalizeText(text);
    const explicit = normalized.match(/^\s*(?:\[\s*)?(\d{1,3})(?:\s*[\].)])?(?:\s|$)/);
    if (explicit) {
      return Number.parseInt(explicit[1], 10);
    }
    return fallback;
  }

  function collectSourcesFromSections(sections) {
    const sourceEntries = [];

    for (const section of sections) {
      const links = Array.from(section.querySelectorAll('a[href]'))
        .filter((link) => isVisible(link))
        .map((link) => ({
          element: link,
          href: toAbsoluteUrl(link.getAttribute('href')),
        }))
        .filter((item) => isExternalUrl(item.href));

      let ordinal = 1;
      for (const item of links) {
        const block = nearestBlock(item.element);
        const rawBlockText = normalizeText(block.textContent);
        const title = normalizeText(item.element.textContent) || rawBlockText || item.href;
        const index = parseSourceIndex(rawBlockText, ordinal);

        sourceEntries.push({
          index,
          title,
          url: item.href,
          blockText: rawBlockText,
        });
        ordinal += 1;
      }
    }

    return dedupeBy(sourceEntries, (item) => `${item.index}::${item.url}`);
  }

  function collectFallbackSources(root) {
    const links = Array.from(root.querySelectorAll('a[href]'))
      .filter((link) => isVisible(link))
      .map((link) => ({
        url: toAbsoluteUrl(link.getAttribute('href')),
        title: normalizeText(link.textContent) || normalizeText(link.getAttribute('title')) || '',
      }))
      .filter((item) => isExternalUrl(item.url));

    const deduped = dedupeBy(links, (item) => item.url);
    return deduped.map((item, index) => ({
      index: index + 1,
      title: item.title || item.url,
      url: item.url,
      blockText: item.title || item.url,
    }));
  }

  async function extractSources(root) {
    maybeOpenSourcesPanels();
    await sleep(250);

    let sources = collectSourcesFromSections(collectSourceSections());
    if (sources.length === 0) {
      sources = collectFallbackSources(root);
    }

    sources.sort((left, right) => left.index - right.index);

    const normalized = [];
    const usedIndexes = new Set();
    let nextIndex = 1;

    for (const source of sources) {
      let index = Number.isInteger(source.index) && source.index > 0 ? source.index : nextIndex;
      while (usedIndexes.has(index)) {
        index += 1;
      }
      usedIndexes.add(index);
      nextIndex = Math.max(nextIndex, index + 1);

      normalized.push({
        index,
        title: source.title || source.url,
        url: source.url,
      });
    }

    return normalized;
  }

  function scoreCandidate(element) {
    if (!(element instanceof HTMLElement) || !isVisible(element)) return -1;
    const textLength = normalizeText(element.textContent).length;
    if (textLength < 800) return -1;

    const headings = element.querySelectorAll('h1, h2, h3').length;
    const paragraphs = element.querySelectorAll('p').length;
    const lists = element.querySelectorAll('ul, ol').length;
    const tables = element.querySelectorAll('table').length;
    const articles = element.matches('article') ? 1 : 0;
    const citations = (element.textContent.match(/\d+\s*†|〖[^〗]+〗/g) || []).length;
    const sourceHeadingCount = Array.from(element.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'))
      .filter((node) => looksLikeSourceHeading(node.textContent))
      .length;
    const tocHeadingCount = Array.from(element.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'))
      .filter((node) => looksLikeTocHeading(node.textContent))
      .length;
    const chatMessageCount = element.querySelectorAll('[data-message-author-role]').length;
    const formCount = element.querySelectorAll('form, textarea').length;
    const buttonText = normalizeText(Array.from(element.querySelectorAll('button')).map((node) => node.textContent).join(' '));
    const chatPenalty = (
      chatMessageCount * 1200
      + formCount * 900
      + (CHAT_UI_RE.test(buttonText) ? 1600 : 0)
    );
    const headingBoost = REPORT_HEADING_RE.test(normalizeText(element.textContent).slice(0, 200)) ? 350 : 0;
    const reportBoost = citations * 40 + sourceHeadingCount * 500 + tocHeadingCount * 500;

    return textLength + headings * 400 + paragraphs * 100 + lists * 80 + tables * 220 + articles * 250 + headingBoost + reportBoost - chatPenalty;
  }

  function isLikelyReportContainer(element) {
    if (!(element instanceof HTMLElement) || !isVisible(element)) return false;
    if (element.matches('nav, aside, form, dialog')) return false;
    if (element.matches('[data-message-author-role]')) return false;

    const text = normalizeText(element.textContent);
    if (text.length < 800) return false;
    if (element.querySelectorAll('h1, h2, h3').length < 2) return false;
    if (element.querySelectorAll('textarea, form').length > 0) return false;
    if (element.querySelectorAll('[data-message-author-role]').length > 1) return false;

    return true;
  }

  function getHashTarget(anchor) {
    const href = anchor.getAttribute('href') || '';
    if (!href.startsWith('#')) return null;
    const id = decodeURIComponent(href.slice(1));
    if (!id) return null;
    return document.getElementById(id) || document.querySelector(`[name="${CSS.escape(id)}"]`);
  }

  function commonAncestor(elements) {
    if (!elements.length) return null;
    const chains = elements.map((element) => {
      const chain = [];
      let cursor = element;
      while (cursor) {
        chain.push(cursor);
        cursor = cursor.parentElement;
      }
      return chain;
    });

    const [first, ...rest] = chains;
    for (const candidate of first) {
      if (rest.every((chain) => chain.includes(candidate))) {
        return candidate;
      }
    }
    return null;
  }

  function expandToLikelyReportContainer(element) {
    let cursor = element;
    let best = null;
    let bestScore = -1;

    while (cursor && cursor !== document.body) {
      if (isLikelyReportContainer(cursor)) {
        const score = scoreCandidate(cursor);
        if (score > bestScore) {
          best = cursor;
          bestScore = score;
        }
      }
      cursor = cursor.parentElement;
    }

    return best;
  }

  function findReportRootFromToc(main) {
    const tocContainers = Array.from(main.querySelectorAll('nav, aside, section, div'))
      .filter((node) => isVisible(node))
      .filter((node) => {
        const heading = Array.from(node.querySelectorAll('h1, h2, h3, h4, h5, h6, [role="heading"]'))
          .find((headingNode) => isVisible(headingNode) && looksLikeTocHeading(headingNode.textContent));
        if (heading) return true;

        const aria = normalizeText(node.getAttribute('aria-label') || '');
        return looksLikeTocHeading(aria);
      });

    for (const toc of tocContainers) {
      const targets = Array.from(toc.querySelectorAll('a[href^="#"]'))
        .map((anchor) => getHashTarget(anchor))
        .filter((node) => node instanceof HTMLElement && isVisible(node));

      if (targets.length < 2) continue;

      const ancestor = commonAncestor(targets);
      const reportRoot = expandToLikelyReportContainer(ancestor);
      if (reportRoot) {
        return reportRoot;
      }
    }

    return null;
  }

  function findReportRootByHeading(main) {
    const titleHeading = Array.from(main.querySelectorAll('h1'))
      .find((node) => isVisible(node) && normalizeText(node.textContent).length > 10);

    if (!titleHeading) return null;

    return expandToLikelyReportContainer(titleHeading);
  }

  function findReportRoot() {
    const main = document.querySelector('main') || document.body;

    const byToc = findReportRootFromToc(main);
    if (byToc) return byToc;

    const byHeading = findReportRootByHeading(main);
    if (byHeading) return byHeading;

    const candidates = new Set([
      main,
      ...main.querySelectorAll('article'),
      ...main.querySelectorAll('section'),
      ...main.querySelectorAll('[class*="prose"]'),
    ]);

    let best = null;
    let bestScore = -1;

    for (const candidate of candidates) {
      const score = scoreCandidate(candidate);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return best;
  }

  function shouldSkipSection(element) {
    if (!(element instanceof Element)) return false;
    if (element.matches('nav, aside, form, dialog')) return true;

    const heading = Array.from(element.children || [])
      .find((child) => child.matches?.('h1, h2, h3, h4, h5, h6, [role="heading"]'));

    const headingText = normalizeText(heading?.textContent || '');
    if (headingText && SKIP_SECTION_RE.test(headingText)) {
      return true;
    }

    const aria = normalizeText(element.getAttribute('aria-label') || '');
    return aria ? SKIP_SECTION_RE.test(aria) : false;
  }

  function parseCitationIdsFromText(text) {
    const ids = new Set();
    const normalized = String(text || '');

    for (const match of normalized.matchAll(/(\d+)\s*†/g)) {
      ids.add(Number.parseInt(match[1], 10));
    }

    if (ids.size === 0 && !/L\d+/i.test(normalized)) {
      const plainBracket = normalized.match(/\[(\d+(?:\s*,\s*\d+)*)\]/);
      if (plainBracket) {
        for (const piece of plainBracket[1].split(',')) {
          const parsed = Number.parseInt(piece.trim(), 10);
          if (Number.isInteger(parsed) && parsed > 0) ids.add(parsed);
        }
      }
    }

    return Array.from(ids).sort((left, right) => left - right);
  }

  function parseCitationIds(element) {
    const ids = new Set();
    const text = normalizeText(element.textContent || '');
    for (const id of parseCitationIdsFromText(text)) ids.add(id);

    for (const attrName of ['href', 'data-source-id', 'data-citation-id', 'aria-label']) {
      const raw = element.getAttribute?.(attrName);
      if (!raw) continue;
      for (const match of String(raw).matchAll(/(?:citation|source|ref)[^\d]{0,12}(\d{1,3})/gi)) {
        ids.add(Number.parseInt(match[1], 10));
      }
    }

    return Array.from(ids).filter((id) => Number.isInteger(id) && id > 0).sort((left, right) => left - right);
  }

  function isCitationElement(element) {
    if (!(element instanceof Element)) return false;

    const text = normalizeText(element.textContent || '');
    if (element.matches('sup')) {
      return parseCitationIds(element).length > 0 || /^\d+$/.test(text);
    }

    if (!text || text.length > 40) return false;
    if (/^\d+$/.test(text) && element.matches('button, a, span')) return true;
    if (/†/.test(text) || /〖.+〗/.test(text)) return true;

    const href = element.getAttribute?.('href') || '';
    if (href && (!isExternalUrl(toAbsoluteUrl(href)) || href.startsWith('#'))) {
      return parseCitationIds(element).length > 0;
    }

    return false;
  }

  function citationMarkdown(element, sourceIndexSet) {
    const sourceByIndex = sourceIndexSet instanceof Map ? sourceIndexSet : new Map();
    const ids = parseCitationIds(element).filter((id) => sourceByIndex.has(id));
    if (ids.length === 0) {
      return normalizeText(element.textContent || '');
    }
    return ids.map((id) => `[${id}](${sourceByIndex.get(id).url})`).join('');
  }

  function textFromChildren(element, context) {
    let out = '';
    for (const child of element.childNodes) {
      out += renderInlineNode(child, context);
    }
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n[ \t]+/g, '\n');
  }

  function renderInlineNode(node, context) {
    if (node.nodeType === Node.TEXT_NODE) {
      return String(node.textContent || '').replace(/\s+/g, ' ');
    }

    if (!(node instanceof Element) || !isVisible(node)) return '';

    if (isCitationElement(node)) {
      return citationMarkdown(node, context.sourceIndexSet);
    }

    const tag = node.tagName.toLowerCase();

    if (tag === 'br') return '  \n';
    if (tag === 'code' && node.parentElement?.tagName.toLowerCase() !== 'pre') {
      return escapeInlineCode(normalizeText(node.textContent));
    }
    if (tag === 'strong' || tag === 'b') return `**${textFromChildren(node, context).trim()}**`;
    if (tag === 'em' || tag === 'i') return `*${textFromChildren(node, context).trim()}*`;
    if (tag === 's' || tag === 'del') return `~~${textFromChildren(node, context).trim()}~~`;
    if (tag === 'a') {
      const href = toAbsoluteUrl(node.getAttribute('href'));
      const text = textFromChildren(node, context).trim() || href;

      if (!href || !isExternalUrl(href)) {
        return text;
      }
      return `[${text}](${href})`;
    }
    if (tag === 'img') {
      const src = toAbsoluteUrl(node.getAttribute('src'));
      if (!src) return '';
      const alt = normalizeText(node.getAttribute('alt') || 'image');
      return `![${alt}](${src})`;
    }

    return textFromChildren(node, context);
  }

  function renderCodeBlock(element) {
    const code = element.querySelector('code');
    const raw = (code || element).textContent || '';
    const classText = code?.className || '';
    const langMatch = classText.match(/language-([a-z0-9_-]+)/i);
    const language = langMatch ? langMatch[1] : '';
    return `\n\n\`\`\`${language}\n${raw.replace(/\n+$/, '')}\n\`\`\`\n\n`;
  }

  function renderBlockquote(element, context) {
    const text = renderChildren(element, context).trim();
    if (!text) return '';
    return `\n\n${text.split('\n').map((line) => `> ${line}`.trimEnd()).join('\n')}\n\n`;
  }

  function renderList(element, context, depth = 0) {
    const ordered = element.tagName.toLowerCase() === 'ol';
    const items = Array.from(element.children).filter((child) => child.tagName?.toLowerCase() === 'li');
    if (items.length === 0) return '';

    const lines = [];
    items.forEach((item, index) => {
      const marker = ordered ? `${index + 1}. ` : '- ';
      const indent = '  '.repeat(depth);
      const text = renderListItem(item, context, depth).trim();
      if (!text) return;

      const parts = text.split('\n');
      lines.push(`${indent}${marker}${parts[0]}`);
      for (const continuation of parts.slice(1)) {
        lines.push(`${indent}  ${continuation}`);
      }
    });

    return `\n\n${lines.join('\n')}\n\n`;
  }

  function renderListItem(element, context, depth) {
    const segments = [];

    for (const child of element.childNodes) {
      if (child instanceof Element && child.matches('ul, ol')) {
        segments.push(renderList(child, context, depth + 1).trim());
        continue;
      }

      if (child instanceof Element && isBlockNode(child)) {
        segments.push(renderBlockNode(child, context).trim());
        continue;
      }

      segments.push(renderInlineNode(child, context));
    }

    return collapseBlankLines(segments.join(' ').replace(/\s+\n/g, '\n'));
  }

  function renderTable(element) {
    const rows = Array.from(element.querySelectorAll('tr'));
    if (rows.length === 0) return '';

    const matrix = rows.map((row) =>
      Array.from(row.children)
        .filter((cell) => /^(td|th)$/i.test(cell.tagName))
        .map((cell) => escapeTableCell(normalizeText(cell.textContent)))
    ).filter((row) => row.length > 0);

    if (matrix.length === 0) return '';

    const width = Math.max(...matrix.map((row) => row.length));
    const normalizedRows = matrix.map((row) => {
      const out = [...row];
      while (out.length < width) out.push('');
      return out;
    });

    const header = normalizedRows[0];
    const divider = header.map(() => '---');
    const lines = [
      `| ${header.join(' | ')} |`,
      `| ${divider.join(' | ')} |`,
    ];

    for (const row of normalizedRows.slice(1)) {
      lines.push(`| ${row.join(' | ')} |`);
    }

    return `\n\n${lines.join('\n')}\n\n`;
  }

  function isBlockNode(element) {
    if (!(element instanceof Element)) return false;
    return /^(address|article|aside|blockquote|div|dl|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|li|main|nav|ol|p|pre|section|table|ul)$/i.test(element.tagName);
  }

  function renderHeading(element, context) {
    const level = Number.parseInt(element.tagName.slice(1), 10);
    const text = textFromChildren(element, context).trim();
    if (!text) return '';
    return `\n\n${'#'.repeat(Math.min(Math.max(level, 1), 6))} ${text}\n\n`;
  }

  function renderBlockNode(element, context) {
    if (!(element instanceof Element) || !isVisible(element) || shouldSkipSection(element)) {
      return '';
    }

    const tag = element.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) return renderHeading(element, context);
    if (tag === 'p') {
      const text = textFromChildren(element, context).trim();
      return text ? `\n\n${text}\n\n` : '';
    }
    if (tag === 'pre') return renderCodeBlock(element);
    if (tag === 'blockquote') return renderBlockquote(element, context);
    if (tag === 'ul' || tag === 'ol') return renderList(element, context);
    if (tag === 'table') return renderTable(element);
    if (tag === 'hr') return '\n\n---\n\n';
    if (tag === 'img') {
      const src = toAbsoluteUrl(element.getAttribute('src'));
      if (!src) return '';
      const alt = normalizeText(element.getAttribute('alt') || 'image');
      return `\n\n![${alt}](${src})\n\n`;
    }

    return renderChildren(element, context);
  }

  function renderChildren(element, context) {
    let out = '';
    for (const child of element.childNodes) {
      if (child instanceof Element && isBlockNode(child)) {
        out += renderBlockNode(child, context);
      } else {
        out += renderInlineNode(child, context);
      }
    }
    return out;
  }

  function buildFrontMatter(title, url) {
    const safeTitle = String(title || '').replace(/"/g, '\\"');
    const safeUrl = String(url || '').replace(/"/g, '\\"');
    return [
      '---',
      `title: "${safeTitle}"`,
      `source: "${safeUrl}"`,
      `exported_at: "${new Date().toISOString()}"`,
      '---',
      '',
    ].join('\n');
  }

  function finalizeMarkdown(markdown, sources, title) {
    const body = collapseBlankLines(markdown);
    const heading = title ? `# ${title}\n\n` : '';
    const frontMatter = buildFrontMatter(title || document.title || 'Deep Research Report', location.href);
    return collapseBlankLines(`${frontMatter}${heading}${body}`) + '\n';
  }

  async function exportMarkdown(titlePrefix = '') {
    const structured = extractStructuredReport(titlePrefix);
    if (structured) {
      return structured;
    }

    const root = findReportRoot();
    if (!root) {
      throw new Error('没有识别到 Deep Research 报告主体。请先打开全屏报告页。');
    }

    const titleElement = root.querySelector('h1') || document.querySelector('main h1') || document.querySelector('h1');
    const title = applyTitlePrefix(
      normalizeText(titleElement?.textContent || document.title || 'Deep Research Report'),
      titlePrefix,
    );
    const sources = await extractSources(root);
    const sourceIndexSet = new Map(sources.map((item) => [item.index, item]));
    const markdownBody = renderChildren(root, { sourceIndexSet });
    const markdown = finalizeMarkdown(markdownBody, sources, title);
    const citationMatches = markdownBody.match(/\[\d+\]\(https?:\/\/[^)]+\)/g) || [];

    const warnings = [];
    if (sources.length === 0) {
      warnings.push('没有提取到来源链接；如果页面里有 Sources / 来源 面板，请先展开后重试。');
    }
    if (citationMatches.length === 0) {
      warnings.push('没有识别到文内 citation；如果当前页面不是 Deep Research 报告正文，导出结果可能不完整。');
    }

    return {
      title,
      filename: title,
      markdown,
      sourceCount: sources.length,
      citationCount: citationMatches.length,
      warnings,
    };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== 'DEEP_RESEARCH_EXPORT_MARKDOWN') return undefined;

    (async () => {
      const result = await exportMarkdown(message?.titlePrefix || 'gpt-');
      sendResponse({ ok: true, result });
    })().catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error || '导出失败。'),
      });
    });

    return true;
  });
}
