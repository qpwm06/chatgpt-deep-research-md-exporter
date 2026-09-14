(() => {
  if (window.__deepResearchExporterPageBridgeLoaded) return;
  window.__deepResearchExporterPageBridgeLoaded = true;

  const REQUEST_EVENT = 'deep-research-exporter:bridge-request';
  const RESPONSE_EVENT = 'deep-research-exporter:bridge-response';
  const REQUEST_ATTR = 'data-deep-research-exporter-request';
  const ACTION_ATTR = 'data-deep-research-exporter-action';
  const RESULT_ATTR = 'data-deep-research-exporter-result';

  function reactHandlerProps(element) {
    const values = [];
    for (const key of Object.keys(element)) {
      if (key.startsWith('__reactProps$')) values.push(element[key]);
      if (key.startsWith('__reactFiber$')) {
        values.push(element[key]?.memoizedProps, element[key]?.pendingProps);
      }
    }
    return values.filter(Boolean);
  }

  function collectUrls(root) {
    const urls = new Set();
    const seen = new Set();
    const queue = reactHandlerProps(root);
    for (const child of root.querySelectorAll('*')) queue.push(...reactHandlerProps(child));

    let visited = 0;
    while (queue.length > 0 && visited < 12000) {
      const value = queue.shift();
      if (value === null || value === undefined) continue;
      if (typeof value === 'string') {
        for (const match of value.matchAll(/https?:\/\/[^\s"'<>]+/g)) urls.add(match[0]);
        continue;
      }
      if (typeof value !== 'object' && typeof value !== 'function') continue;
      if (seen.has(value)) continue;
      seen.add(value);
      visited += 1;

      let keys = [];
      try {
        keys = Object.keys(value);
      } catch {}
      for (const key of keys) {
        if (['_owner', 'stateNode', 'ownerDocument', 'return', 'child', 'sibling', 'alternate'].includes(key)) continue;
        try {
          queue.push(value[key]);
        } catch {}
      }
    }
    return Array.from(urls);
  }

  function invokeReactClick(element) {
    const props = reactHandlerProps(element).find((value) => typeof value?.onClick === 'function');
    if (!props) return false;
    props.onClick({
      type: 'click',
      target: element,
      currentTarget: element,
      button: 0,
      buttons: 0,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {},
      persist() {},
      nativeEvent: {},
    });
    return true;
  }

  function invokeReactHandlers(element, names) {
    let invoked = false;
    const event = {
      target: element,
      currentTarget: element,
      pointerType: 'mouse',
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() {},
      persist() {},
      nativeEvent: {},
    };
    for (const candidate of [element, element.parentElement].filter(Boolean)) {
      for (const props of reactHandlerProps(candidate)) {
        for (const name of names) {
          if (typeof props?.[name] !== 'function') continue;
          props[name]({ ...event, currentTarget: candidate });
          invoked = true;
        }
      }
    }
    return invoked;
  }

  window.addEventListener(REQUEST_EVENT, () => {
    for (const element of document.querySelectorAll(`[${REQUEST_ATTR}]`)) {
      const action = element.getAttribute(ACTION_ATTR);
      let result;
      try {
        if (action === 'click') {
          result = { ok: invokeReactClick(element) };
        } else if (action === 'hover') {
          result = { ok: invokeReactHandlers(element, ['onPointerMove', 'onPointerEnter', 'onMouseEnter', 'onFocus']) };
        } else if (action === 'unhover') {
          result = { ok: invokeReactHandlers(element, ['onPointerLeave', 'onMouseLeave', 'onBlur']) };
        } else {
          result = { ok: true, urls: collectUrls(element) };
        }
      } catch (error) {
        result = { ok: false, error: String(error) };
      }
      element.setAttribute(RESULT_ATTR, JSON.stringify(result));
    }
    window.dispatchEvent(new Event(RESPONSE_EVENT));
  });
})();
