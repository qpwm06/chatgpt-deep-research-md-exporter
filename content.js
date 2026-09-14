if (!globalThis.__deepResearchMarkdownExporterLoaded) {
  globalThis.__deepResearchMarkdownExporterLoaded = true;

  const SOURCE_HEADING_RE = /\b(sources?|references?)\b|来源|参考|引用/i;
  const CITATION_HEADING_RE = /\bcitations?\b|文内引用|引文|引用/i;
  const TOC_HEADING_RE = /\b(table of contents|contents?)\b|目录/i;
  const REPORT_HEADING_RE = /\b(report|research)\b|报告|研究/i;
  const SKIP_SECTION_RE = /\b(table of contents|contents|sources?|references?|activity|history)\b|目录|来源|参考|引用|活动记录|过程/i;
  const INTERNAL_HOST_RE = /(^|\.)((chatgpt\.com)|(chat\.openai\.com))$/i;
  const CHAT_UI_RE = /\b(copy|share|retry|regenerate|edit|message chatgpt|ask anything)\b|复制|分享|重试|重新生成|继续追问|发送消息/i;
  const FULLSCREEN_LAYER_SELECTOR = [
    'dialog[open]',
    '[role="dialog"]',
    '[aria-modal="true"]',
    '[data-writing-block-fullscreen-editor-layout="fullscreen"]',
    '[data-writing-block-fullscreen-editor-layout]:not([data-writing-block-fullscreen-editor-layout="inline"])',
    '[data-state="open"]',
    '[class~="fixed"][class~="inset-0"]',
    '[class~="fixed"][class~="start-0"][class~="end-0"][class~="top-0"][class~="bottom-0"]',
    '[style*="position:fixed"]',
    '[style*="position: fixed"]',
  ].join(', ');
  const REPORT_CONTENT_SELECTOR = [
    '[data-testid*="deep-research" i]',
    '[data-testid*="research-report" i]',
    '[data-testid*="report-view" i]',
    '[data-writing-block-fullscreen-editor-region="true"]',
    '[data-writing-block="true"]',
    '[class*="markdown"]',
    '[class*="prose"]',
    'article',
    'section',
  ].join(', ');

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

  function normalizeMermaidLabel(label) {
    return String(label || '')
      .replace(/\r\n/g, '\n')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('<br/>')
      .replace(/"/g, '\'');
  }

  function sanitizeMermaidFlowchart(code) {
    let out = String(code || '').trim();

    out = out.replace(
      /(\b[A-Za-z][A-Za-z0-9_-]*)\{([^{}]*?)\}/gs,
      (_match, id, label) => `${id}{"${normalizeMermaidLabel(label)}"}`,
    );

    out = out.replace(
      /(\b[A-Za-z][A-Za-z0-9_-]*)\[([^[\]]*?)\]/gs,
      (_match, id, label) => `${id}["${normalizeMermaidLabel(label)}"]`,
    );

    return out;
  }

  function sanitizeMermaidBlocks(markdown) {
    return String(markdown || '').replace(/```(?:mermaid|marid|meriad)\s*\n([\s\S]*?)\n```/gi, (_match, code) => {
      const trimmed = String(code || '').trim();
      const firstLine = trimmed.split('\n')[0]?.trim().toLowerCase() || '';

      // Older Mermaid builds often fail on xychart-beta entirely.
      if (firstLine.startsWith('xychart-beta')) {
        return `\`\`\`text\n${trimmed}\n\`\`\``;
      }

      if (firstLine.startsWith('flowchart') || firstLine.startsWith('graph')) {
        return `\`\`\`mermaid\n${sanitizeMermaidFlowchart(trimmed)}\n\`\`\``;
      }

      return `\`\`\`mermaid\n${trimmed}\n\`\`\``;
    });
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

  function extractStructuredReport(titlePrefix = '', sourceUrl = location.href) {
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

    const frontMatter = buildFrontMatter(title, sourceUrl);
    const markdownBodyWithTitle = sanitizeMermaidBlocks(
      citationReplacement.markdown.replace(/^#\s+.+$/m, `# ${title}`),
    );
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

  function isBareHomepageUrl(url) {
    try {
      const parsed = new URL(url);
      return parsed.pathname === '/' && !parsed.search && !parsed.hash;
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

    const toggles = candidates.filter((node) => {
      const label = normalizeText(`${node.textContent || ''} ${node.getAttribute?.('aria-label') || ''}`);
      return (
        node.hasAttribute('aria-expanded')
        || node.getAttribute('aria-haspopup') === 'dialog'
        || /sources? and activity|来源与活动/i.test(label)
      );
    });
    const controls = toggles.length > 0 ? toggles : candidates;

    if (controls.some((node) => (
      node.getAttribute('aria-expanded') === 'true'
      || node.getAttribute('aria-selected') === 'true'
    ))) return true;

    // 当前脚本运行在已选中的 Deep Research frame 内，工具栏与正文可能是兄弟节点。
    const control = controls.find((node) => node.getAttribute('aria-selected') !== 'true');
    if (!control) return false;

    try {
      control.click();
      return true;
    } catch {
      return false;
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

  function collectCitationSections() {
    const sections = Array.from(document.querySelectorAll([
      'section[aria-labelledby*="citation" i]',
      'section[id*="citation" i]',
      '[role="tabpanel"] section',
    ].join(', '))).filter((section) => {
      if (!isVisible(section)) return false;

      const labelledBy = section.getAttribute('aria-labelledby') || '';
      const label = labelledBy
        ? document.getElementById(labelledBy)?.textContent || ''
        : '';
      const ownHeading = section.querySelector('h1, h2, h3, h4, h5, h6, [role="heading"], p[id]');
      return (
        /citation/i.test(`${section.id} ${labelledBy}`)
        || CITATION_HEADING_RE.test(normalizeText(label || ownHeading?.textContent))
      );
    });

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

  function findCitationEntry(link, section) {
    let cursor = link.parentElement;
    while (cursor && cursor !== section) {
      const markers = Array.from(cursor.querySelectorAll('[data-citation-index], [data-citation-id], [data-source-id]'));
      const ids = new Set(markers.flatMap((marker) => parseCitationIds(marker)));
      if (ids.size === 1) {
        const [onlyId] = ids;
        const marker = markers.find((candidate) => parseCitationIds(candidate).includes(onlyId));
        if (marker) return { container: cursor, marker };
      }
      cursor = cursor.parentElement;
    }
    return null;
  }

  function collectCitationSources(sections) {
    const sourceEntries = [];

    // 新版全屏报告按域名分组显示引用，DOM 顺序不等于引用编号。
    for (const section of sections) {
      const links = Array.from(section.querySelectorAll('a[href]'))
        .filter((link) => isVisible(link))
        .map((link) => ({
          element: link,
          href: toAbsoluteUrl(link.getAttribute('href')),
        }))
        .filter((item) => isExternalUrl(item.href));

      for (const item of links) {
        const entry = findCitationEntry(item.element, section);
        if (!entry) continue;

        const ids = parseCitationIds(entry.marker);
        const index = ids[0];
        if (!Number.isInteger(index) || index <= 0) continue;

        const rawBlockText = normalizeText(entry.container.textContent);
        sourceEntries.push({
          index,
          title: normalizeText(item.element.textContent) || rawBlockText || item.href,
          url: item.href,
          blockText: rawBlockText,
        });
      }
    }

    const specificEntries = new Map();
    for (const source of sourceEntries) {
      const key = `${source.index}::${source.url}`;
      const previous = specificEntries.get(key);
      if (!previous || source.blockText.length < previous.blockText.length) {
        specificEntries.set(key, source);
      }
    }
    return Array.from(specificEntries.values());
  }

  const SHOW_CODE_LABEL_RE = /^(?:show|view|display)(?:\s+the)?\s+code$|^(?:显示|查看|展开)代码$/i;

  function controlLabels(element) {
    return [
      element.textContent,
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
    ].map(normalizeText).filter(Boolean);
  }

  function findShowCodeControls(scopes) {
    const interactiveSelector = 'button, [role="button"], [role="tab"], [tabindex]';
    const labelledElements = Array.from(scopes)
      .flatMap((scope) => Array.from(scope.querySelectorAll('*')))
      .filter((element) => controlLabels(element).some((label) => SHOW_CODE_LABEL_RE.test(label)))
      .filter((element) => !Array.from(element.children).some((child) => (
        controlLabels(child).some((label) => SHOW_CODE_LABEL_RE.test(label))
      )));

    return dedupeBy(
      labelledElements.map((element) => element.closest(interactiveSelector) || element),
      (element) => element,
    );
  }

  function findMermaidControlContainer(button, boundary) {
    let cursor = button.parentElement;
    while (cursor) {
      if (cursor.querySelector('svg, canvas, [class*="mermaid" i], pre, textarea')) {
        // ChatGPT 会整体替换包裹渲染图的 pre，因此等待范围必须是仍留在 DOM 中的父容器。
        return cursor.tagName.toLowerCase() === 'pre' && cursor.parentElement
          ? cursor.parentElement
          : cursor;
      }
      if (cursor === boundary) break;
      cursor = cursor.parentElement;
    }
    return boundary;
  }

  async function waitForRevealedCode(button, container, previousVisibility) {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const codeVisible = Array.from(container.querySelectorAll('pre code, pre, textarea'))
        .some((element) => isVisible(element) && previousVisibility.get(element) !== true);
      if (codeVisible) return;
      await sleep(50);
    }
  }

  async function revealMermaidCode(root) {
    const scopes = new Set([root]);
    const fullscreenLayer = root.closest(FULLSCREEN_LAYER_SELECTOR);
    if (fullscreenLayer) scopes.add(fullscreenLayer);
    if (root.parentElement) scopes.add(root.parentElement);

    const buttons = findShowCodeControls(scopes);

    // Mermaid 默认只展示 SVG；必须先点击“显示代码”，等待源码视图就绪后再读取 DOM。
    for (const button of buttons) {
      const container = findMermaidControlContainer(button, fullscreenLayer || root.parentElement || root);
      const previousVisibility = new Map(
        Array.from(container.querySelectorAll('pre code, pre, textarea'))
          .map((element) => [element, isVisible(element)]),
      );
      button.click();
      await waitForRevealedCode(button, container, previousVisibility);
    }
    return buttons.length;
  }

  function findCitationCarousels(reportRoot) {
    const candidates = [];
    const excludedSections = [...collectCitationSections(), ...collectSourceSections()];
    for (const tooltip of Array.from(document.querySelectorAll('[role="tooltip"][data-state="open"]'))) {
      if (!isVisible(tooltip)) continue;
      const buttons = Array.from(tooltip.querySelectorAll('button, [role="button"]')).filter(isVisible);
      const rect = tooltip.getBoundingClientRect();
      candidates.push({ container: tooltip, buttons, area: rect.width * rect.height });
    }

    const links = Array.from(document.querySelectorAll('a[href]'))
      .filter((link) => isVisible(link) && isExternalUrl(toAbsoluteUrl(link.getAttribute('href'))))
      .filter((link) => !reportRoot?.contains(link))
      .filter((link) => !excludedSections.some((section) => section.contains(link)));

    for (const link of links) {
      let container = link.parentElement;
      while (container && container !== document.body) {
        if (excludedSections.some((section) => section.contains(container))) break;
        const buttons = Array.from(container.querySelectorAll('button')).filter((button) => isVisible(button));
        if (buttons.length >= 2) {
          const rect = container.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0 && rect.width <= 1000 && rect.height <= 900) {
            candidates.push({ container, buttons, area: rect.width * rect.height });
          }
          break;
        }
        container = container.parentElement;
      }
    }

    candidates.sort((left, right) => left.area - right.area);
    return dedupeBy(candidates, (candidate) => candidate.container);
  }

  function citationCarouselSignature(carousel) {
    const urls = Array.from(carousel.container.querySelectorAll('a[href]'))
      .map((link) => toAbsoluteUrl(link.getAttribute('href')))
      .filter((url) => isExternalUrl(url))
      .sort();
    return `${urls.join('\n')}\n${normalizeText(carousel.container.textContent).slice(0, 1200)}`;
  }

  function normalizedMatchText(value) {
    let text = String(value || '');
    try {
      text = decodeURIComponent(text);
    } catch {}
    return normalizeText(text)
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  function sourceHost(url) {
    try {
      return new URL(url).hostname.replace(/^www\./i, '').toLocaleLowerCase();
    } catch {
      return '';
    }
  }

  function matchTokens(value) {
    const ignored = new Set([
      'http', 'https', 'www', 'com', 'org', 'net', 'html', 'article', 'articles',
      'publication', 'publications', 'collection', 'collections', 'journal', 'contribution',
      'source', 'chatgpt', 'utm', 'doi',
    ]);
    return new Set(
      normalizedMatchText(value)
        .split(' ')
        .filter((token) => token.length >= 4 && !ignored.has(token)),
    );
  }

  function carouselCardMetadata(container) {
    const leafTexts = Array.from(container.querySelectorAll('div, span, p'))
      .filter((element) => element.children.length === 0 && !element.closest('button'))
      .map((element) => normalizeText(element.textContent))
      .filter(Boolean);
    const imageHosts = Array.from(container.querySelectorAll('img[alt]'))
      .map((image) => normalizeText(image.getAttribute('alt')))
      .filter((text) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(text));
    const textHosts = leafTexts.filter((text) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(text));
    const hosts = dedupeBy([...imageHosts, ...textHosts].map((host) => host.replace(/^www\./i, '').toLocaleLowerCase()), (host) => host);
    const title = leafTexts.find((text) => (
      text.length >= 8
      && !hosts.includes(text.replace(/^www\./i, '').toLocaleLowerCase())
      && !/^https?:\/\//i.test(text)
    )) || normalizeText(container.textContent).replace(/^[←→\s]+/, '').slice(0, 500);
    return { hosts, title };
  }

  function matchCarouselCardSource(carousel, knownSources) {
    const metadata = carouselCardMetadata(carousel.container);
    const titleText = normalizedMatchText(metadata.title);
    const titleTokens = matchTokens(metadata.title);
    let best = null;

    for (const source of knownSources) {
      const hostMatches = metadata.hosts.includes(sourceHost(source.url));
      const texts = [source.title, source.blockText, source.url].map(normalizedMatchText).filter(Boolean);
      let score = hostMatches ? 40 : 0;

      for (const text of texts) {
        if (titleText.length >= 12 && (text.includes(titleText) || titleText.includes(text))) {
          score = Math.max(score, (hostMatches ? 40 : 0) + 160);
        }
        const sourceTokens = matchTokens(text);
        const overlap = Array.from(titleTokens).filter((token) => sourceTokens.has(token)).length;
        if (overlap > 0) {
          const ratio = overlap / Math.max(1, Math.min(titleTokens.size, sourceTokens.size));
          score = Math.max(score, (hostMatches ? 40 : 0) + overlap * 10 + ratio * 50);
        }
      }

      if (!best || score > best.score) best = { source, score };
    }

    // 域名相同本身不足以确定来源；必须再有标题词命中，避免同域来源串到每个 citation。
    return best?.score >= 55 ? best.source : null;
  }

  async function carouselSourceEntries(carousel, citationIndex, knownSources = []) {
    if (!carousel?.container) return [];
    const reactResult = await requestPageBridge(carousel.container, 'urls');
    const reactUrls = Array.isArray(reactResult?.urls) ? reactResult.urls : [];
    const linkedUrls = Array.from(carousel.container.querySelectorAll('a[href]'))
      .filter((link) => isVisible(link))
      .map((link) => toAbsoluteUrl(link.getAttribute('href')));
    const metadata = carouselCardMetadata(carousel.container);
    const directSources = dedupeBy(
      linkedUrls
        .map((url) => ({
          index: citationIndex,
          title: metadata.title,
          url: toAbsoluteUrl(url),
        }))
        .filter((source) => (
          isExternalUrl(source.url)
          && !isBareHomepageUrl(source.url)
          && !/^https?:\/\/www\.google\.com\/s2\/favicons/i.test(source.url)
        ))
        .map((source) => ({ ...source, title: source.title || source.url, blockText: source.title || source.url })),
      (source) => source.url,
    );
    if (directSources.length > 0) return directSources;

    const matchedSource = matchCarouselCardSource(carousel, knownSources);
    if (matchedSource) {
      return [{
        ...matchedSource,
        index: citationIndex,
        title: matchedSource.title || metadata.title || matchedSource.url,
        blockText: matchedSource.blockText || metadata.title || matchedSource.url,
      }];
    }

    // React props 偶尔只暴露 favicon、域名主页或被截断的 DOI；仅接受右栏已确认的完整 URL。
    const confirmedReactUrl = reactUrls
      .map(toAbsoluteUrl)
      .find((url) => knownSources.some((source) => source.url === url));
    if (!confirmedReactUrl) return [];
    const confirmedSource = knownSources.find((source) => source.url === confirmedReactUrl);
    return [{ ...confirmedSource, index: citationIndex }];
  }

  function findCarouselNextButton(carousel) {
    const enabled = carousel.buttons.filter((button) => !button.disabled && button.getAttribute('aria-disabled') !== 'true');
    return enabled.find((button) => {
      if (button.closest('a[href]')) return false;
      const labels = controlLabels(button);
      if (labels.some((label) => /\bnext\b|\bright\b|\bforward\b|下一个|下一项|后一项|向右/i.test(label))) {
        return true;
      }

      const glyph = normalizeText(button.textContent);
      if (/^[→›»⟩]$/.test(glyph)) return true;

      const markup = button.outerHTML.toLowerCase().replace(/&gt;/g, '>');
      return (
        /chevron[-_ ]?right|caret[-_ ]?right|angle[-_ ]?right/.test(markup)
        || markup.includes('m9 18 6-6-6-6')
        || markup.includes('m8.25 4.5 7.5 7.5-7.5 7.5')
      );
    });
  }

  function concealCitationCarousel(carousel) {
    const { style } = carousel.container;
    const previous = {
      opacity: style.getPropertyValue('opacity'),
      opacityPriority: style.getPropertyPriority('opacity'),
      pointerEvents: style.getPropertyValue('pointer-events'),
      pointerEventsPriority: style.getPropertyPriority('pointer-events'),
    };
    style.setProperty('opacity', '0', 'important');
    style.setProperty('pointer-events', 'none', 'important');

    return () => {
      style.setProperty('opacity', previous.opacity, previous.opacityPriority);
      style.setProperty('pointer-events', previous.pointerEvents, previous.pointerEventsPriority);
    };
  }

  function clickWithoutNavigation(element) {
    const anchor = element.closest('a[href]');
    const href = anchor?.getAttribute('href');
    const target = anchor?.getAttribute('target');
    const preventNavigation = (event) => event.preventDefault();
    if (anchor) {
      document.addEventListener('click', preventNavigation, true);
      anchor.removeAttribute('href');
      anchor.removeAttribute('target');
    }

    try {
      element.click();
    } finally {
      if (anchor && href !== null) anchor.setAttribute('href', href);
      if (anchor && target !== null) anchor.setAttribute('target', target);
      if (anchor) document.removeEventListener('click', preventNavigation, true);
    }
  }

  const BRIDGE_REQUEST_EVENT = 'deep-research-exporter:bridge-request';
  const BRIDGE_RESPONSE_EVENT = 'deep-research-exporter:bridge-response';
  const BRIDGE_REQUEST_ATTR = 'data-deep-research-exporter-request';
  const BRIDGE_ACTION_ATTR = 'data-deep-research-exporter-action';
  const BRIDGE_RESULT_ATTR = 'data-deep-research-exporter-result';
  let pageBridgePromise = null;

  function ensurePageBridge() {
    if (pageBridgePromise) return pageBridgePromise;
    if (!globalThis.chrome?.runtime?.getURL) return Promise.resolve(false);

    pageBridgePromise = new Promise((resolve) => {
      const script = document.createElement('script');
      const timeout = window.setTimeout(() => resolve(false), 1000);
      script.src = chrome.runtime.getURL('page-bridge.js');
      script.onload = () => {
        window.clearTimeout(timeout);
        script.remove();
        resolve(true);
      };
      script.onerror = () => {
        window.clearTimeout(timeout);
        script.remove();
        resolve(false);
      };
      (document.head || document.documentElement).appendChild(script);
    });
    return pageBridgePromise;
  }

  async function requestPageBridge(element, action) {
    if (!(await ensurePageBridge())) return null;
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    element.setAttribute(BRIDGE_REQUEST_ATTR, requestId);
    element.setAttribute(BRIDGE_ACTION_ATTR, action);

    return new Promise((resolve) => {
      let settled = false;
      const cleanup = () => {
        window.removeEventListener(BRIDGE_RESPONSE_EVENT, onResponse);
        element.removeAttribute(BRIDGE_REQUEST_ATTR);
        element.removeAttribute(BRIDGE_ACTION_ATTR);
        element.removeAttribute(BRIDGE_RESULT_ATTR);
      };
      const finish = (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      };
      const onResponse = () => {
        if (element.getAttribute(BRIDGE_REQUEST_ATTR) !== requestId) return;
        const raw = element.getAttribute(BRIDGE_RESULT_ATTR);
        if (!raw) return;
        try {
          finish(JSON.parse(raw));
        } catch {
          finish(null);
        }
      };
      window.addEventListener(BRIDGE_RESPONSE_EVENT, onResponse);
      window.dispatchEvent(new Event(BRIDGE_REQUEST_EVENT));
      window.setTimeout(() => finish(null), 1000);
    });
  }

  async function activateButton(element) {
    const bridgeResult = await requestPageBridge(element, 'click');
    if (bridgeResult?.ok) return;

    const pointerOptions = {
      bubbles: true,
      cancelable: true,
      button: 0,
      buttons: 1,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
    };
    if (typeof PointerEvent === 'function') {
      element.dispatchEvent(new PointerEvent('pointerdown', pointerOptions));
    }
    element.dispatchEvent(new MouseEvent('mousedown', pointerOptions));
    if (typeof PointerEvent === 'function') {
      element.dispatchEvent(new PointerEvent('pointerup', { ...pointerOptions, buttons: 0 }));
    }
    element.dispatchEvent(new MouseEvent('mouseup', { ...pointerOptions, buttons: 0 }));
    element.dispatchEvent(new MouseEvent('click', { ...pointerOptions, buttons: 0 }));
  }

  function dispatchCitationHover(element, active) {
    const eventTarget = element.parentElement || element;
    const types = active
      ? ['pointerover', 'pointerenter', 'mousemove', 'mouseover', 'mouseenter']
      : ['pointerout', 'pointerleave', 'mouseout', 'mouseleave'];
    for (const type of types) {
      const EventClass = type.startsWith('pointer') && typeof PointerEvent === 'function'
        ? PointerEvent
        : MouseEvent;
      eventTarget.dispatchEvent(new EventClass(type, { bubbles: true, cancelable: true }));
    }
    if (active) element.focus();
    else element.blur();
  }

  function refreshCitationElement(element, root) {
    if (element?.isConnected) return element;
    const citationIndex = parseCitationIds(element)[0];
    if (!Number.isInteger(citationIndex)) return element;
    return Array.from(root.querySelectorAll('sup, [data-citation-index], [data-citation-id]'))
      .find((candidate) => (
        isVisible(candidate)
        && isCitationElement(candidate)
        && parseCitationIds(candidate)[0] === citationIndex
      )) || element;
  }

  function describeCitationUiElement(element) {
    const rect = element.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute('role'),
      className: typeof element.className === 'string' ? element.className.slice(0, 500) : '',
      text: normalizeText(element.textContent).slice(0, 1500),
      href: element.matches('a[href]') ? toAbsoluteUrl(element.getAttribute('href')) : '',
      rect: {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
      html: element.outerHTML.slice(0, 5000),
    };
  }

  async function diagnoseCitationUi() {
    const root = isDirectConversationPage() ? findReportRootFromFullscreenLayer() : findReportRoot();
    if (!root) return { ok: false, error: 'report root not found' };

    const citation = Array.from(root.querySelectorAll('sup, [data-citation-index], [data-citation-id]'))
      .find((element) => (
        isVisible(element)
        && isCitationElement(element)
        && parseCitationIds(element)[0] === 1
      ));
    if (!citation) return { ok: false, error: 'citation 1 not found' };

    clickWithoutNavigation(citation);
    await sleep(700);

    const outsideRoot = Array.from(document.querySelectorAll('body *'))
      .filter((element) => !root.contains(element) && isVisible(element));
    const externalLinks = outsideRoot
      .filter((element) => element.matches('a[href]'))
      .filter((element) => isExternalUrl(toAbsoluteUrl(element.getAttribute('href'))))
      .map(describeCitationUiElement);
    const overlays = outsideRoot
      .filter((element) => {
        const style = window.getComputedStyle(element);
        if (!['fixed', 'absolute'].includes(style.position)) return false;
        const rect = element.getBoundingClientRect();
        const controls = element.querySelectorAll('button, [role="button"], a[href]').length;
        return rect.width >= 120 && rect.height >= 40 && rect.width <= 1200 && rect.height <= 900 && controls > 0;
      })
      .sort((left, right) => (
        left.getBoundingClientRect().width * left.getBoundingClientRect().height
        - right.getBoundingClientRect().width * right.getBoundingClientRect().height
      ))
      .slice(0, 20)
      .map(describeCitationUiElement);
    const controls = outsideRoot
      .filter((element) => element.matches('button, [role="button"]'))
      .filter((element) => {
        const labels = controlLabels(element).join(' ');
        return /next|previous|forward|back|source|citation|下一个|上一个|来源|引用/i.test(labels)
          || /chevron|caret|m9 18 6-6-6-6|m15 18-6-6 6-6/i.test(element.outerHTML);
      })
      .slice(0, 50)
      .map(describeCitationUiElement);

    clickWithoutNavigation(citation);
    return {
      ok: true,
      citation: describeCitationUiElement(citation),
      citationParent: citation.parentElement ? describeCitationUiElement(citation.parentElement) : null,
      externalLinks,
      overlays,
      controls,
    };
  }

  function snapshotVisibleCitationUi() {
    const visible = Array.from(document.querySelectorAll('body *')).filter(isVisible);
    const externalLinks = visible
      .filter((element) => element.matches('a[href]'))
      .filter((element) => isExternalUrl(toAbsoluteUrl(element.getAttribute('href'))))
      .map(describeCitationUiElement);
    const overlays = visible
      .filter((element) => {
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        const overlayRole = element.matches('[role="dialog"], [role="tooltip"], [data-radix-popper-content-wrapper]');
        return (
          overlayRole
          || (['fixed', 'absolute'].includes(style.position)
            && rect.width >= 120
            && rect.height >= 40
            && rect.width <= 1200
            && rect.height <= 900
            && element.querySelectorAll('button, [role="button"], a[href]').length > 0)
        );
      })
      .sort((left, right) => (
        left.getBoundingClientRect().width * left.getBoundingClientRect().height
        - right.getBoundingClientRect().width * right.getBoundingClientRect().height
      ))
      .slice(0, 30)
      .map(describeCitationUiElement);
    const controls = visible
      .filter((element) => element.matches('button, [role="button"]'))
      .filter((element) => {
        const labels = controlLabels(element).join(' ');
        return /next|previous|forward|back|source|citation|下一个|上一个|来源|引用/i.test(labels)
          || /chevron|caret|m9 18 6-6-6-6|m15 18-6-6 6-6/i.test(element.outerHTML);
      })
      .slice(0, 80)
      .map(describeCitationUiElement);
    return { externalLinks, overlays, controls };
  }

  function setDiagnosticCitationHover(citationIndex = 1, active = true) {
    const root = isDirectConversationPage() ? findReportRootFromFullscreenLayer() : findReportRoot();
    if (!root) return { ok: false, error: 'report root not found' };
    const citation = Array.from(root.querySelectorAll('sup, [data-citation-index], [data-citation-id]'))
      .find((element) => (
        isVisible(element)
        && isCitationElement(element)
        && parseCitationIds(element)[0] === citationIndex
      ));
    if (!citation) return { ok: false, error: `citation ${citationIndex} not found` };
    const eventTarget = citation.parentElement || citation;
    if (active) {
      if (citation.getAttribute('aria-pressed') !== 'true') clickWithoutNavigation(citation);
      for (const type of ['pointerover', 'pointerenter', 'mousemove', 'mouseover', 'mouseenter']) {
        const EventClass = type.startsWith('pointer') && typeof PointerEvent === 'function'
          ? PointerEvent
          : MouseEvent;
        eventTarget.dispatchEvent(new EventClass(type, { bubbles: true, cancelable: true }));
      }
      citation.focus();
    } else {
      for (const type of ['pointerout', 'pointerleave', 'mouseout', 'mouseleave']) {
        const EventClass = type.startsWith('pointer') && typeof PointerEvent === 'function'
          ? PointerEvent
          : MouseEvent;
        eventTarget.dispatchEvent(new EventClass(type, { bubbles: true, cancelable: true }));
      }
      citation.blur();
      if (citation.getAttribute('aria-pressed') === 'true') clickWithoutNavigation(citation);
    }
    return { ok: true, citation: describeCitationUiElement(citation) };
  }

  async function diagnoseCitationSlides(citationIndex = 1) {
    const root = isDirectConversationPage() ? findReportRootFromFullscreenLayer() : findReportRoot();
    if (!root) return { ok: false, error: 'report root not found' };
    const citation = Array.from(root.querySelectorAll('sup, [data-citation-index], [data-citation-id]'))
      .find((element) => (
        isVisible(element)
        && isCitationElement(element)
        && parseCitationIds(element)[0] === citationIndex
      ));
    if (!citation) return { ok: false, error: `citation ${citationIndex} not found` };
    const triggerReactResult = await requestPageBridge(citation, 'urls');
    let clickBridgeResult = null;
    if (citation.getAttribute('aria-pressed') !== 'true') {
      clickBridgeResult = await requestPageBridge(citation, 'click');
      if (!clickBridgeResult?.ok) clickWithoutNavigation(citation);
      await sleep(100);
    }
    const currentCitation = refreshCitationElement(citation, root);
    const hoverBridgeResult = await requestPageBridge(currentCitation.parentElement || currentCitation, 'hover');
    const opened = setDiagnosticCitationHover(citationIndex, true);
    if (!opened.ok) return opened;
    await sleep(700);

    const slides = [];
    const visited = new Set();
    for (let page = 0; page < 8; page += 1) {
      const tooltip = Array.from(document.querySelectorAll('[role="tooltip"][data-state="open"]'))
        .find((element) => isVisible(element) && element.querySelectorAll('button, [role="button"]').length >= 2);
      if (!tooltip) break;

      const text = normalizeText(tooltip.textContent);
      if (!text || visited.has(text)) break;
      visited.add(text);
      slides.push({
        ...describeCitationUiElement(tooltip),
        reactResult: await requestPageBridge(tooltip, 'urls'),
      });

      const carousel = {
        container: tooltip,
        buttons: Array.from(tooltip.querySelectorAll('button, [role="button"]')).filter(isVisible),
      };
      const nextButton = findCarouselNextButton(carousel);
      if (!nextButton) break;
      await activateButton(nextButton);

      let changed = false;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await sleep(50);
        const currentTooltip = Array.from(document.querySelectorAll('[role="tooltip"][data-state="open"]'))
          .find((element) => isVisible(element) && element.querySelectorAll('button, [role="button"]').length >= 2);
        if (currentTooltip && normalizeText(currentTooltip.textContent) !== text) {
          changed = true;
          break;
        }
      }
      if (!changed) break;
    }

    await requestPageBridge(currentCitation.parentElement || currentCitation, 'unhover');
    setDiagnosticCitationHover(citationIndex, false);
    return { ok: true, citationIndex, triggerReactResult, clickBridgeResult, hoverBridgeResult, slides };
  }

  async function openCitationCarousel(element, reportRoot) {
    const before = new Map(
      findCitationCarousels(reportRoot)
        .map((carousel) => [carousel.container, citationCarouselSignature(carousel)]),
    );
    if (element.getAttribute('aria-pressed') !== 'true') {
      const clicked = await requestPageBridge(element, 'click');
      if (!clicked?.ok) clickWithoutNavigation(element);
      await sleep(100);
    }
    const currentElement = refreshCitationElement(element, reportRoot);
    await requestPageBridge(currentElement.parentElement || currentElement, 'hover');
    dispatchCitationHover(currentElement, true);
    const tooltipId = currentElement.parentElement?.getAttribute('aria-describedby') || '';
    // ChatGPT 会复用 citation popover，并在动画结束后异步替换卡片内容。
    for (let attempt = 0; attempt < 16; attempt += 1) {
      await sleep(50);
      const carousel = findCitationCarousels(reportRoot).find((candidate) => (
        (tooltipId && candidate.container.id === tooltipId)
        || !before.has(candidate.container)
        || before.get(candidate.container) !== citationCarouselSignature(candidate)
      ));
      if (carousel) return { ...carousel, triggerElement: currentElement };
    }
    return null;
  }

  async function advanceCitationCarousel(carousel, nextButton, reportRoot) {
    const before = new Map(
      findCitationCarousels(reportRoot)
        .map((candidate) => [candidate.container, citationCarouselSignature(candidate)]),
    );
    await activateButton(nextButton);

    // 真实页面的轮播切换可能晚于点击数百毫秒，等待 URL/正文签名实际变化。
    for (let attempt = 0; attempt < 12; attempt += 1) {
      await sleep(50);
      // 弹层已被透明隐藏，不能再依赖 isVisible() 找回同一个节点。
      if (
        carousel.container.isConnected
        && citationCarouselSignature(carousel) !== before.get(carousel.container)
      ) {
        return {
          ...carousel,
          buttons: Array.from(carousel.container.querySelectorAll('button, [role="button"]')),
        };
      }

      const candidates = findCitationCarousels(reportRoot);
      const changed = candidates.find((candidate) => (
        candidate.container === carousel.container
        && citationCarouselSignature(candidate) !== before.get(candidate.container)
      ));
      if (changed) return changed;

      const replacement = candidates.find((candidate) => (
        !before.has(candidate.container)
        || citationCarouselSignature(candidate) !== before.get(candidate.container)
      ));
      if (replacement) return replacement;
    }
    return null;
  }

  async function collectCitationCarouselSources(root, knownSources = []) {
    const entries = [];
    const citationElements = [];
    const usedCitationIndexes = new Set();

    for (const element of Array.from(root.querySelectorAll('sup, [data-citation-index], [data-citation-id]'))) {
      if (!isVisible(element) || !isCitationElement(element)) continue;
      const interactive = element.closest('a[href], button, [role="button"], [tabindex]');
      if (!interactive && typeof element.onclick !== 'function') continue;
      const citationIndex = parseCitationIds(element)[0];
      if (!Number.isInteger(citationIndex) || usedCitationIndexes.has(citationIndex)) continue;
      usedCitationIndexes.add(citationIndex);
      citationElements.push({ element, citationIndex });
    }

    for (const { element, citationIndex } of citationElements) {
      let carousel = await openCitationCarousel(element, root);
      if (!carousel) {
        // 用户可能已打开当前 citation；第一次点击会关闭浮层，再点一次重新打开。
        carousel = await openCitationCarousel(element, root);
      }
      if (!carousel) continue;

      const concealedContainers = new Map();
      concealedContainers.set(carousel.container, concealCitationCarousel(carousel));
      try {
        const visitedSignatures = new Set();
        for (let page = 0; page < 8; page += 1) {
          const currentSources = await carouselSourceEntries(carousel, citationIndex, knownSources);
          const signature = currentSources.map((source) => source.url).sort().join('\n');
          if (!signature || visitedSignatures.has(signature)) break;
          visitedSignatures.add(signature);
          entries.push(...currentSources);

          const nextButton = findCarouselNextButton(carousel);
          if (!nextButton) break;
          carousel = await advanceCitationCarousel(carousel, nextButton, root);
          if (!carousel) break;
          if (!concealedContainers.has(carousel.container)) {
            concealedContainers.set(carousel.container, concealCitationCarousel(carousel));
          }
        }
      } finally {
        const triggerElement = refreshCitationElement(carousel?.triggerElement || element, root);
        await requestPageBridge(triggerElement.parentElement || triggerElement, 'unhover');
        dispatchCitationHover(triggerElement, false);
        if (triggerElement.getAttribute('aria-pressed') === 'true') {
          const clicked = await requestPageBridge(triggerElement, 'click');
          if (!clicked?.ok) clickWithoutNavigation(triggerElement);
        }
        await sleep(60);
        for (const restore of Array.from(concealedContainers.values()).reverse()) restore();
      }
    }

    return dedupeBy(entries, (source) => `${source.index}::${source.url}`);
  }

  function collectFallbackSources(root) {
    const links = Array.from(root.querySelectorAll('a[href]'))
      .filter((link) => isVisible(link))
      .map((link) => ({
        element: link,
        url: toAbsoluteUrl(link.getAttribute('href')),
        title: normalizeText(link.textContent) || normalizeText(link.getAttribute('title')) || '',
      }))
      .filter((item) => isExternalUrl(item.url));

    const deduped = dedupeBy(links, (item) => item.url);
    return deduped.map((item, index) => ({
      index: parseCitationIds(findCitationEntry(item.element, root)?.marker || item.element)[0] || index + 1,
      title: item.title || item.url,
      url: item.url,
      blockText: item.title || item.url,
    }));
  }

  async function extractSources(root) {
    const openedSources = maybeOpenSourcesPanels();
    let sources = [];

    // 来源抽屉异步渲染；优先等待带真实 citation index 的引用列表。
    const attempts = openedSources ? 25 : 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (openedSources) await sleep(200);
      const citationSections = collectCitationSections();
      sources = collectCitationSources(citationSections);
      if (sources.length > 0) break;

      // 兼容旧版分享页：其 Sources 面板使用普通标题和链接列表。
      if (citationSections.length === 0) {
        sources = collectSourcesFromSections(collectSourceSections());
        if (sources.length > 0) break;
      }
    }

    if (sources.length === 0) {
      sources = collectSourcesFromSections(collectSourceSections());
    }
    if (sources.length === 0) {
      const fallbackRoot = window.top === window ? root : document.body;
      sources = collectFallbackSources(fallbackRoot);
    }

    // Tooltip 本身没有 href；先取得右栏完整 URL，再按当前卡片标题逐张匹配。
    const carouselSources = await collectCitationCarouselSources(root, sources);

    sources = dedupeBy([...carouselSources, ...sources], (source) => `${source.index}::${source.url}`)
      .filter((source) => !isBareHomepageUrl(source.url));

    sources.sort((left, right) => left.index - right.index);

    const normalizedByUrl = new Map();

    for (const source of sources) {
      const citationIndex = Number.isInteger(source.index) && source.index > 0
        ? source.index
        : normalizedByUrl.size + 1;
      let normalizedSource = normalizedByUrl.get(source.url);

      if (!normalizedSource) {
        normalizedSource = {
          index: normalizedByUrl.size + 1,
          citationIndexes: [],
          title: source.title || source.url,
          url: source.url,
        };
        normalizedByUrl.set(source.url, normalizedSource);
      }

      if (!normalizedSource.citationIndexes.includes(citationIndex)) {
        normalizedSource.citationIndexes.push(citationIndex);
      }
    }

    return Array.from(normalizedByUrl.values());
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

  function hasReportShape(element) {
    if (!(element instanceof HTMLElement) || !isVisible(element)) return false;

    const textLength = normalizeText(element.textContent).length;
    const headingCount = element.querySelectorAll('h1, h2, h3').length;
    const paragraphCount = element.querySelectorAll('p').length;
    const externalLinkCount = Array.from(element.querySelectorAll('a[href]'))
      .map((link) => toAbsoluteUrl(link.getAttribute('href')))
      .filter((href) => isExternalUrl(href))
      .length;
    const headingText = normalizeText(
      Array.from(element.querySelectorAll('h1, h2, h3'))
        .slice(0, 4)
        .map((heading) => heading.textContent)
        .join(' '),
    );

    if (textLength < 800 || element.querySelector('form, textarea')) return false;
    return (
      headingCount >= 2
      || (headingCount >= 1 && paragraphCount >= 4)
      || (headingCount >= 1 && externalLinkCount >= 2)
      || REPORT_HEADING_RE.test(headingText)
    );
  }

  function bestReportContentWithin(scope) {
    if (!(scope instanceof HTMLElement) || !isVisible(scope)) return null;

    const candidates = new Set([scope, ...scope.querySelectorAll(REPORT_CONTENT_SELECTOR)]);
    let best = null;
    let bestScore = -1;

    for (const candidate of candidates) {
      if (!hasReportShape(candidate)) continue;

      let score = scoreCandidate(candidate);
      if (candidate.matches('[data-testid*="deep-research" i], [data-testid*="research-report" i], [data-testid*="report-view" i]')) {
        score += 5000;
      }
      if (candidate.matches('[class*="markdown"], [class*="prose"]')) {
        score += 2500;
      }

      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return best;
  }

  function isFullscreenLayer(element) {
    if (!(element instanceof HTMLElement) || !isVisible(element)) return false;
    if (element.matches([
      'dialog[open]',
      '[role="dialog"]',
      '[aria-modal="true"]',
      '[data-writing-block-fullscreen-editor-layout]:not([data-writing-block-fullscreen-editor-layout="inline"])',
    ].join(', '))) return true;

    const rect = element.getBoundingClientRect();
    const viewportArea = Math.max(window.innerWidth * window.innerHeight, 1);
    return (rect.width * rect.height) / viewportArea >= 0.35;
  }

  function findReportRootFromFullscreenLayer() {
    // ChatGPT 使用 portal 渲染全屏报告，它通常不在 <main> 内。
    const explicitReports = Array.from(document.querySelectorAll(
      '[data-testid*="deep-research" i], [data-testid*="research-report" i], [data-testid*="report-view" i]',
    ));
    const layers = Array.from(document.querySelectorAll(FULLSCREEN_LAYER_SELECTOR))
      .filter((node) => isFullscreenLayer(node));

    let best = null;
    let bestScore = -1;
    for (const scope of [...explicitReports, ...layers]) {
      const candidate = bestReportContentWithin(scope);
      if (!candidate) continue;

      const score = scoreCandidate(candidate)
        + (candidate.matches('[data-testid*="report" i]') ? 5000 : 0);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return best;
  }

  function findReportRootFromAssistantMessages(main) {
    const messages = Array.from(main.querySelectorAll('[data-message-author-role="assistant"]'));
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      const candidate = bestReportContentWithin(message);
      if (candidate) return candidate;
    }

    return null;
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
    const fullscreenReport = findReportRootFromFullscreenLayer();
    if (fullscreenReport) return fullscreenReport;

    const main = document.querySelector('main') || document.body;

    const assistantReport = findReportRootFromAssistantMessages(main);
    if (assistantReport) return assistantReport;

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

    if (element.matches?.('sup, button, a, span') && /^\d{1,3}$/.test(text)) {
      ids.add(Number.parseInt(text, 10));
    }

    const directIndex = element.getAttribute?.('data-citation-index');
    if (/^\d{1,3}$/.test(directIndex || '')) {
      ids.add(Number.parseInt(directIndex, 10));
    }

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
    if (/^\d+$/.test(text) && element.matches('button, a, span')) {
      // ChatGPT 会用纯数字链接或按钮包住多个 sup；外层必须继续递归，不能吞掉子 citation。
      if (element.querySelector('sup, [data-citation-index], [data-citation-id], [data-source-id]')) {
        return false;
      }
      return true;
    }
    if (/†/.test(text) || /〖.+〗/.test(text)) return true;

    const href = element.getAttribute?.('href') || '';
    if (href && (!isExternalUrl(toAbsoluteUrl(href)) || href.startsWith('#'))) {
      return parseCitationIds(element).length > 0;
    }

    return false;
  }

  function citationMarkdown(element, sourcesByCitationIndex) {
    const sourceGroups = sourcesByCitationIndex instanceof Map ? sourcesByCitationIndex : new Map();
    const ids = parseCitationIds(element).filter((id) => sourceGroups.has(id));
    if (ids.length === 0) {
      return normalizeText(element.textContent || '');
    }
    return ids
      .flatMap((id) => sourceGroups.get(id))
      .map((source) => `[${source.index}](${source.url})`)
      .join('');
  }

  function renumberCitationLinks(markdown) {
    const numberByUrl = new Map();
    return String(markdown || '').replace(/\[\d+\]\((https?:\/\/[^)]+)\)/g, (match, url) => {
      if (!numberByUrl.has(url)) numberByUrl.set(url, numberByUrl.size + 1);
      return `[${numberByUrl.get(url)}](${url})`;
    });
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
      return citationMarkdown(node, context.sourcesByCitationIndex);
    }

    const tag = node.tagName.toLowerCase();

    if (tag === 'br') return '  \n';
    if (tag === 'button' || tag === 'svg' || tag === 'canvas') return '';
    if (tag === 'code' && node.parentElement?.tagName.toLowerCase() !== 'pre') {
      return escapeInlineCode(normalizeText(node.textContent));
    }
    if (tag === 'strong' || tag === 'b') return `**${textFromChildren(node, context).trim()}**`;
    if (tag === 'em' || tag === 'i') return `*${textFromChildren(node, context).trim()}*`;
    if (tag === 's' || tag === 'del') return `~~${textFromChildren(node, context).trim()}~~`;
    if (tag === 'a') {
      const rawHref = node.getAttribute('href') || '';
      const href = toAbsoluteUrl(rawHref);
      const text = textFromChildren(node, context).trim() || href;

      // ChatGPT 可能用首个来源 URL 包住 citation；子 citation 已展开，不能再套一层首来源链接。
      if (node.querySelector('sup, [data-citation-index], [data-citation-id], [data-source-id]')) {
        return text;
      }
      if (!href || rawHref.startsWith('#') || !isExternalUrl(href)) {
        return text;
      }
      if (/^\[\d{1,3}\]$/.test(text)) {
        return `${text}(${href})`;
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
    const textarea = element.querySelector('textarea');
    const raw = textarea?.value || (code || element).textContent || '';
    const hasRenderedDiagram = Boolean(element.querySelector('svg, canvas'));
    if (hasRenderedDiagram && !code && !textarea) return '';

    const classText = code?.className || '';
    const langMatch = classText.match(/language-([a-z0-9_-]+)/i);
    let language = langMatch ? langMatch[1] : '';
    if (/^(?:marid|meriad)$/i.test(language) || looksLikeMermaidSource(raw)) language = 'mermaid';
    return `\n\n\`\`\`${language}\n${raw.replace(/\n+$/, '')}\n\`\`\`\n\n`;
  }

  function looksLikeMermaidSource(raw) {
    return /^\s*(?:---[\s\S]*?---\s*)?(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|quadrantChart|xychart-beta|sankey-beta|gitGraph|C4\w*|block-beta|packet-beta|architecture-beta|kanban|requirementDiagram)\b/i.test(
      String(raw || ''),
    );
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

  function renderTable(element, context) {
    const rows = Array.from(element.querySelectorAll('tr'));
    if (rows.length === 0) return '';

    const matrix = rows.map((row) =>
      Array.from(row.children)
        .filter((cell) => /^(td|th)$/i.test(cell.tagName))
        // 表格中的 citation 也必须经过正文的内联转换，不能直接读取 textContent。
        .map((cell) => escapeTableCell(textFromChildren(cell, context)))
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
    if (element === context.skipTitleElement) return '';

    const tag = element.tagName.toLowerCase();

    if (/^h[1-6]$/.test(tag)) return renderHeading(element, context);
    if (tag === 'p') {
      const text = textFromChildren(element, context).trim();
      return text ? `\n\n${text}\n\n` : '';
    }
    if (tag === 'pre') return renderCodeBlock(element);
    if (tag === 'blockquote') return renderBlockquote(element, context);
    if (tag === 'ul' || tag === 'ol') return renderList(element, context);
    if (tag === 'table') return renderTable(element, context);
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

  function finalizeMarkdown(markdown, sources, title, sourceUrl = location.href) {
    const body = collapseBlankLines(sanitizeMermaidBlocks(markdown));
    const heading = title ? `# ${title}\n\n` : '';
    const frontMatter = buildFrontMatter(title || document.title || 'Deep Research Report', sourceUrl);
    return collapseBlankLines(`${frontMatter}${heading}${body}`) + '\n';
  }

  function isDirectConversationPage() {
    return /(?:^|\/)c\/[a-z0-9-]+(?:\/|$)/i.test(location.pathname);
  }

  function findTitleElement(root) {
    if (!(root instanceof Element)) return null;
    const ownTitle = root.querySelector('h1');
    if (ownTitle) return ownTitle;

    const layer = root.closest(FULLSCREEN_LAYER_SELECTOR);
    return layer?.querySelector('h1') || null;
  }

  async function exportMarkdown(titlePrefix = '', sourceUrl = location.href, includeDiagnostics = false) {
    // 分享页优先读取内嵌 payload；具体聊天页优先导出用户当前打开的报告。
    if (!isDirectConversationPage()) {
      const structured = extractStructuredReport(titlePrefix, sourceUrl);
      if (structured) {
        return structured;
      }
    }

    const directConversation = isDirectConversationPage();
    const root = directConversation ? findReportRootFromFullscreenLayer() : findReportRoot();
    if (!root) {
      if (directConversation) {
        throw new Error('没有识别到当前全屏报告。请先将目标报告打开为全屏视图，再点击开始识别。');
      }
      const structured = extractStructuredReport(titlePrefix, sourceUrl);
      if (structured) return structured;
      throw new Error('没有识别到 Deep Research 报告主体。请先打开全屏报告页。');
    }

    const titleElement = findTitleElement(root) || document.querySelector('main h1') || document.querySelector('h1');
    const title = applyTitlePrefix(
      normalizeText(titleElement?.textContent || document.title || 'Deep Research Report'),
      titlePrefix,
    );
    const sources = await extractSources(root);
    // 来源面板和 citation 浮层会触发 React 重渲染；最后再切 Mermaid 源码，避免被恢复成 SVG。
    await revealMermaidCode(root);
    const sourcesByCitationIndex = new Map();

    // 一个 ChatGPT citation 标记可能合并多个 URL；按原编号保留整组来源再展开到正文。
    for (const source of sources) {
      for (const citationIndex of source.citationIndexes) {
        const group = sourcesByCitationIndex.get(citationIndex) || [];
        group.push(source);
        sourcesByCitationIndex.set(citationIndex, group);
      }
    }

    const markdownBody = renumberCitationLinks(
      renderChildren(root, { sourcesByCitationIndex, skipTitleElement: titleElement }),
    );
    const markdown = finalizeMarkdown(markdownBody, sources, title, sourceUrl);
    const citationMatches = markdownBody.match(/\[\d+\]\(https?:\/\/[^)]+\)/g) || [];

    const warnings = [];
    if (sources.length === 0) {
      warnings.push('没有提取到来源链接；如果页面里有 Sources / 来源 面板，请先展开后重试。');
    }
    if (citationMatches.length === 0) {
      warnings.push('没有识别到文内 citation；如果当前页面不是 Deep Research 报告正文，导出结果可能不完整。');
    }

    const result = {
      title,
      filename: title,
      markdown,
      sourceCount: sources.length,
      citationCount: citationMatches.length,
      warnings,
    };

    if (includeDiagnostics) {
      const inlineCitationIds = Array.from(root.querySelectorAll([
        'sup',
        '[data-citation-index]',
        '[data-citation-id]',
        '[data-source-id]',
      ].join(', ')))
        .filter((element) => isVisible(element) && isCitationElement(element))
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          text: normalizeText(element.textContent || ''),
          ids: parseCitationIds(element),
          citationIndex: element.getAttribute('data-citation-index'),
          citationId: element.getAttribute('data-citation-id'),
          sourceId: element.getAttribute('data-source-id'),
          ariaLabel: element.getAttribute('aria-label'),
        }));
      const rawCitationSources = collectCitationSources(collectCitationSections());

      // 诊断数据仅由内部诊断页请求，用于核对真实 DOM 的合并 citation 关系。
      result.diagnostics = {
        inlineCitationIds,
        rawCitationSources,
        normalizedSources: sources,
        citationGroups: Array.from(sourcesByCitationIndex.entries()).map(([citationIndex, group]) => ({
          citationIndex,
          sources: group.map((source) => ({ index: source.index, title: source.title, url: source.url })),
        })),
      };
    }

    return result;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === 'DEEP_RESEARCH_TOGGLE_DIAGNOSTIC_CITATION') {
      sendResponse(setDiagnosticCitationHover(
        message?.citationIndex || 1,
        message?.active !== false,
      ));
      return undefined;
    }
    if (message?.type === 'DEEP_RESEARCH_DIAGNOSE_CITATION_SLIDES') {
      diagnoseCitationSlides(message?.citationIndex || 1)
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }
    if (message?.type === 'DEEP_RESEARCH_SNAPSHOT_CITATION_UI') {
      sendResponse({ ok: true, ...snapshotVisibleCitationUi() });
      return undefined;
    }
    if (message?.type === 'DEEP_RESEARCH_DIAGNOSE_CITATION_UI') {
      diagnoseCitationUi()
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ ok: false, error: String(error) }));
      return true;
    }
    if (message?.type === 'DEEP_RESEARCH_EXPORT_STRUCTURED_REPORT') {
      const result = extractStructuredReport(
        message?.titlePrefix || 'gpt-',
        message?.sourceUrl || location.href,
      );
      sendResponse({ ok: Boolean(result), result });
      return undefined;
    }
    if (message?.type === 'DEEP_RESEARCH_OPEN_SOURCES') {
      sendResponse({ ok: true, openedSources: maybeOpenSourcesPanels() });
      return undefined;
    }
    if (message?.type !== 'DEEP_RESEARCH_EXPORT_MARKDOWN') return undefined;

    (async () => {
      const result = await exportMarkdown(
        message?.titlePrefix || 'gpt-',
        message?.sourceUrl || location.href,
        message?.diagnostics === true,
      );
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
