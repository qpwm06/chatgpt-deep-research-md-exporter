const statusNode = document.getElementById('status');
const params = new URLSearchParams(location.search);

function setStatus(message) {
  statusNode.textContent = message;
  document.title = message;
}

function isChatGptConversation(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'chatgpt.com' && /(?:^|\/)c\/[a-z0-9-]+(?:\/|$)/i.test(parsed.pathname);
  } catch {
    return false;
  }
}

async function reloadExtensionOnce() {
  const key = 'chatgpt-exporter-last-diagnostic-reload';
  const lastReload = Number(localStorage.getItem(key) || 0);
  if (Date.now() - lastReload < 15000) {
    localStorage.removeItem(key);
    setStatus('Extension reloaded');
    return;
  }
  localStorage.setItem(key, String(Date.now()));
  setStatus('Reloading extension');
  chrome.runtime.reload();
}

async function sendExportMessage(tab) {
  const frames = await chrome.webNavigation.getAllFrames({ tabId: tab.id }) || [];
  const deepResearchHost = 'connector-openai-deep-research.web-sandbox.oaiusercontent.com';
  const orderedFrames = frames.sort((left, right) => {
    const leftReport = String(left.url || '').includes(deepResearchHost) ? 1 : 0;
    const rightReport = String(right.url || '').includes(deepResearchHost) ? 1 : 0;
    if (leftReport !== rightReport) return rightReport - leftReport;
    if (left.frameId === 0) return 1;
    if (right.frameId === 0) return -1;
    return left.frameId - right.frameId;
  });

  const attempts = [];
  const structuredAttempts = [];
  for (const frame of orderedFrames) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'DEEP_RESEARCH_EXPORT_STRUCTURED_REPORT',
        titlePrefix: 'gpt-',
        sourceUrl: tab.url,
      }, { frameId: frame.frameId });
      structuredAttempts.push({
        frameId: frame.frameId,
        frameUrl: frame.url,
        ok: Boolean(response?.ok),
        title: response?.result?.title || '',
        sourceCount: response?.result?.sourceCount || 0,
      });
    } catch (error) {
      structuredAttempts.push({ frameId: frame.frameId, frameUrl: frame.url, ok: false, error: String(error) });
    }
  }

  if (params.get('structuredOnly') === '1') {
    return {
      response: {
        result: {
          title: 'Structured payload probe',
          markdown: '',
          sourceCount: 0,
          citationCount: 0,
          warnings: [],
          diagnostics: { structuredAttempts },
        },
      },
      frame: null,
      attempts,
      structuredAttempts,
    };
  }

  if (params.get('citationUiOnly') === '1') {
    const citationUiAttempts = [];
    for (const frame of orderedFrames) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'DEEP_RESEARCH_DIAGNOSE_CITATION_UI',
        }, { frameId: frame.frameId });
        citationUiAttempts.push({ frameId: frame.frameId, frameUrl: frame.url, response });
      } catch (error) {
        citationUiAttempts.push({ frameId: frame.frameId, frameUrl: frame.url, error: String(error) });
      }
    }
    return {
      response: {
        result: {
          title: 'Citation UI probe',
          markdown: '',
          sourceCount: 0,
          citationCount: 0,
          warnings: [],
          diagnostics: { citationUiAttempts },
        },
      },
      frame: null,
      attempts,
      structuredAttempts,
    };
  }

  if (params.get('citationCrossFrameOnly') === '1') {
    const toggles = [];
    let reportFrame = null;
    for (const frame of orderedFrames) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'DEEP_RESEARCH_TOGGLE_DIAGNOSTIC_CITATION',
          citationIndex: 1,
          active: true,
        }, { frameId: frame.frameId });
        toggles.push({ frameId: frame.frameId, frameUrl: frame.url, response });
        if (response?.ok) {
          reportFrame = frame;
          break;
        }
      } catch (error) {
        toggles.push({ frameId: frame.frameId, frameUrl: frame.url, error: String(error) });
      }
    }
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    const snapshots = [];
    for (const frame of orderedFrames) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'DEEP_RESEARCH_SNAPSHOT_CITATION_UI',
        }, { frameId: frame.frameId });
        snapshots.push({ frameId: frame.frameId, frameUrl: frame.url, response });
      } catch (error) {
        snapshots.push({ frameId: frame.frameId, frameUrl: frame.url, error: String(error) });
      }
    }
    if (reportFrame) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'DEEP_RESEARCH_TOGGLE_DIAGNOSTIC_CITATION',
          citationIndex: 1,
          active: false,
        }, { frameId: reportFrame.frameId });
      } catch {}
    }
    return {
      response: {
        result: {
          title: 'Cross-frame citation UI probe',
          markdown: '',
          sourceCount: 0,
          citationCount: 0,
          warnings: [],
          diagnostics: { toggles, snapshots },
        },
      },
      frame: reportFrame,
      attempts,
      structuredAttempts,
    };
  }

  if (params.get('citationSlidesOnly') === '1') {
    const slideAttempts = [];
    for (const frame of orderedFrames) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, {
          type: 'DEEP_RESEARCH_DIAGNOSE_CITATION_SLIDES',
          citationIndex: 1,
        }, { frameId: frame.frameId });
        slideAttempts.push({ frameId: frame.frameId, frameUrl: frame.url, response });
      } catch (error) {
        slideAttempts.push({ frameId: frame.frameId, frameUrl: frame.url, error: String(error) });
      }
    }
    return {
      response: {
        result: {
          title: 'Citation slides probe',
          markdown: '',
          sourceCount: 0,
          citationCount: 0,
          warnings: [],
          diagnostics: { slideAttempts },
        },
      },
      frame: null,
      attempts,
      structuredAttempts,
    };
  }

  let openedSources = false;
  for (const frame of orderedFrames) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'DEEP_RESEARCH_OPEN_SOURCES',
      }, { frameId: frame.frameId });
      openedSources ||= response?.openedSources === true;
    } catch {}
  }
  if (openedSources) {
    await new Promise((resolve) => window.setTimeout(resolve, 1000));
  }

  for (const frame of orderedFrames) {
    try {
      const response = await chrome.tabs.sendMessage(tab.id, {
        type: 'DEEP_RESEARCH_EXPORT_MARKDOWN',
        titlePrefix: 'gpt-',
        sourceUrl: tab.url,
        diagnostics: true,
      }, { frameId: frame.frameId });
      attempts.push({ frameId: frame.frameId, frameUrl: frame.url, ok: Boolean(response?.ok), error: response?.error });
      if (response?.ok) return { response, frame, attempts, structuredAttempts };
    } catch (error) {
      attempts.push({ frameId: frame.frameId, frameUrl: frame.url, ok: false, error: String(error) });
    }
  }

  throw new Error(`所有 frame 均导出失败：${JSON.stringify(attempts)}`);
}

async function runDiagnostic() {
  setStatus('Finding ChatGPT tab');
  const requestedUrl = params.get('target') || '';
  const tabs = (await chrome.tabs.query({})).filter((tab) => (
    isChatGptConversation(tab.url || '')
    && (!requestedUrl || tab.url === requestedUrl)
  ));
  // 同一会话可能打开两次；标题不是“ChatGPT - ...”的标签通常是当前全屏报告。
  const target = tabs.find((tab) => !/^ChatGPT\s*-/i.test(tab.title || '')) || tabs[0];
  if (!target?.id) throw new Error('Target ChatGPT tab not found');

  setStatus('Running real-page diagnostic');
  const diagnostic = await sendExportMessage(target);
  const payload = JSON.stringify({
    testedAt: new Date().toISOString(),
    tab: { id: target.id, title: target.title, url: target.url },
    frame: diagnostic.frame,
    attempts: diagnostic.attempts,
    structuredAttempts: diagnostic.structuredAttempts,
    result: diagnostic.response.result,
  }, null, 2);
  const url = URL.createObjectURL(new Blob([payload], { type: 'application/json;charset=utf-8' }));
  await chrome.downloads.download({
    url,
    filename: 'chatgpt-exporter-diagnostic.json',
    conflictAction: 'uniquify',
    saveAs: false,
  });
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
  setStatus('Diagnostic downloaded');
}

if (params.get('reload') === '1') {
  reloadExtensionOnce().catch((error) => setStatus(String(error)));
} else {
  runDiagnostic().catch((error) => setStatus(error instanceof Error ? error.message : String(error)));
}
