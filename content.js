(() => {
  'use strict';

  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  // ── Comment prefix per language ──────────────────────────────────────
  const COMMENT_PREFIX = {
    python: '#', python3: '#',
    java: '//', cpp: '//', 'c++': '//', c: '//',
    csharp: '//', 'c#': '//',
    javascript: '//', typescript: '//',
    go: '//', rust: '//', swift: '//', kotlin: '//',
    ruby: '#', scala: '//', php: '//',
    dart: '//', racket: ';', erlang: '%', elixir: '#',
  };

  const HISTORY_STORAGE_KEY = 'lc_complexity_history';
  const MAX_HISTORY_ITEMS = 50;

  // ── State ────────────────────────────────────────────────────────────
  let toolbar = null;
  let toast = null;
  let toastTimer = null;
  let lastUrl = '';
  let complexityCard = null;
  let settingsModal = null;
  let historyModal = null;
  let currentAbortController = null;
  let timerInterval = null;

  // In-memory cache for complexity analysis
  const complexityCache = new Map();

  // ── SVG Icon Factories (safe DOM creation, no innerHTML) ────────────
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
  }

  function createCopyIcon() {
    const svg = svgEl('svg', { viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    svg.appendChild(svgEl('rect', { x: '9', y: '9', width: '13', height: '13', rx: '2' }));
    svg.appendChild(svgEl('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }));
    return svg;
  }

  function createZapIcon() {
    const svg = svgEl('svg', { viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    svg.appendChild(svgEl('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' }));
    return svg;
  }

  function createHistoryIcon() {
    const svg = svgEl('svg', { viewBox: '0 0 24 24', width: '15', height: '15', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    svg.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '10' }));
    svg.appendChild(svgEl('polyline', { points: '12 6 12 12 16 14' }));
    return svg;
  }

  function createGearIcon() {
    const svg = svgEl('svg', { viewBox: '0 0 24 24', width: '15', height: '15', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    svg.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '3' }));
    svg.appendChild(svgEl('path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' }));
    return svg;
  }

  function createTrashIcon() {
    const svg = svgEl('svg', { viewBox: '0 0 24 24', width: '14', height: '14', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    svg.appendChild(svgEl('polyline', { points: '3 6 5 6 21 6' }));
    svg.appendChild(svgEl('path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }));
    return svg;
  }

  function createCheckIcon() {
    const svg = svgEl('svg', { viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    svg.appendChild(svgEl('polyline', { points: '20 6 9 17 4 12' }));
    return svg;
  }

  function createCloseIcon() {
    const svg = svgEl('svg', { viewBox: '0 0 24 24', width: '14', height: '14', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    svg.appendChild(svgEl('line', { x1: '18', y1: '6', x2: '6', y2: '18' }));
    svg.appendChild(svgEl('line', { x1: '6', y1: '6', x2: '18', y2: '18' }));
    return svg;
  }

  function createErrorIcon() {
    const svg = svgEl('svg', { viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    svg.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '10' }));
    svg.appendChild(svgEl('line', { x1: '15', y1: '9', x2: '9', y2: '15' }));
    svg.appendChild(svgEl('line', { x1: '9', y1: '9', x2: '15', y2: '15' }));
    return svg;
  }

  // ── UI Creation ──────────────────────────────────────────────────────
  function createUI() {
    if (toolbar) return;

    toolbar = document.createElement('div');
    toolbar.id = 'lc-copier-toolbar';
    toolbar.className = 'lc-copier-toolbar lc-copier-pulse';

    // 1. Copy Problem Button
    const copyBtn = document.createElement('button');
    copyBtn.id = 'lc-copier-copy-btn';
    copyBtn.className = 'lc-toolbar-btn lc-btn-primary';
    copyBtn.title = 'Copy problem description and code to clipboard';

    const copyIconSpan = document.createElement('span');
    copyIconSpan.className = 'lc-btn-icon';
    copyIconSpan.appendChild(createCopyIcon());

    const copyLabelSpan = document.createElement('span');
    copyLabelSpan.className = 'lc-btn-label';
    copyLabelSpan.textContent = 'Copy Problem';

    copyBtn.appendChild(copyIconSpan);
    copyBtn.appendChild(copyLabelSpan);
    copyBtn.addEventListener('click', handleCopy);

    // 2. Complexity Analysis Button
    const complexityBtn = document.createElement('button');
    complexityBtn.id = 'lc-copier-complexity-btn';
    complexityBtn.className = 'lc-toolbar-btn lc-btn-secondary';
    complexityBtn.title = 'Analyze Time & Space complexity using local LM Studio';

    const zapIconSpan = document.createElement('span');
    zapIconSpan.className = 'lc-btn-icon';
    zapIconSpan.appendChild(createZapIcon());

    const zapLabelSpan = document.createElement('span');
    zapLabelSpan.className = 'lc-btn-label';
    zapLabelSpan.textContent = 'Complexity';

    complexityBtn.appendChild(zapIconSpan);
    complexityBtn.appendChild(zapLabelSpan);
    complexityBtn.addEventListener('click', () => handleComplexityClick(false));

    // 3. History Button
    const historyBtn = document.createElement('button');
    historyBtn.id = 'lc-copier-history-btn';
    historyBtn.className = 'lc-toolbar-btn lc-btn-icon-only';
    historyBtn.title = 'Complexity History';
    historyBtn.appendChild(createHistoryIcon());
    historyBtn.addEventListener('click', openHistoryModal);

    // 4. Settings Button
    const settingsBtn = document.createElement('button');
    settingsBtn.id = 'lc-copier-settings-btn';
    settingsBtn.className = 'lc-toolbar-btn lc-btn-icon-only';
    settingsBtn.title = 'LM Studio Settings';
    settingsBtn.appendChild(createGearIcon());
    settingsBtn.addEventListener('click', openSettingsModal);

    toolbar.appendChild(copyBtn);
    toolbar.appendChild(complexityBtn);
    toolbar.appendChild(historyBtn);
    toolbar.appendChild(settingsBtn);

    document.body.appendChild(toolbar);

    toolbar.addEventListener('animationend', () => {
      toolbar.classList.remove('lc-copier-pulse');
    });

    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'lc-copier-toast';
      document.body.appendChild(toast);
    }
  }

  function removeUI() {
    if (toolbar) { toolbar.remove(); toolbar = null; }
    if (complexityCard) { complexityCard.remove(); complexityCard = null; }
    if (settingsModal) { settingsModal.remove(); settingsModal = null; }
    if (historyModal) { historyModal.remove(); historyModal = null; }
    if (toast) { toast.remove(); toast = null; }
  }

  function showToast(message, type = 'success', lang = '') {
    if (!toast) return;
    clearTimeout(toastTimer);

    toast.textContent = '';
    toast.className = 'lc-copier-toast';
    toast.classList.add(type === 'success' ? 'lc-toast-success' : 'lc-toast-error');

    const iconSpan = document.createElement('span');
    iconSpan.className = 'lc-toast-icon';
    iconSpan.appendChild(type === 'success' ? createCheckIcon() : createErrorIcon());
    toast.appendChild(iconSpan);

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    toast.appendChild(msgSpan);

    if (lang) {
      const langSpan = document.createElement('span');
      langSpan.className = 'lc-toast-lang';
      langSpan.textContent = lang;
      toast.appendChild(langSpan);
    }

    void toast.offsetWidth;
    toast.classList.add('lc-toast-visible');

    toastTimer = setTimeout(() => {
      toast.classList.remove('lc-toast-visible');
    }, 2500);
  }

  // ── Extraction Helpers (v1.1.0 with Table Support) ───────────────────

  function getTitle() {
    const selectors = [
      'div.text-title-large a',
      'div[data-cy="question-title"]',
      'a.mr-2.text-label-1',
      'div.text-title-large',
      'span.text-title-large',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim()) {
        return el.textContent.trim();
      }
    }
    const titleMatch = document.title.match(/^(.+?)\s*[-–|]/);
    if (titleMatch) return titleMatch[1].trim();
    return '';
  }

  function getDescription() {
    const selectors = [
      'div[data-track-load="description_content"]',
      'div.elfjS',
      'div[class*="question-content"]',
      'div._1l1MA',
    ];

    let descEl = null;
    for (const sel of selectors) {
      descEl = document.querySelector(sel);
      if (descEl) break;
    }

    if (!descEl) return '';
    return cleanDescription(descEl);
  }

  function cleanDescription(root) {
    return domToText(root).replace(/\n{3,}/g, '\n\n').trim();
  }

  function domToText(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();

    if (tag === 'table') {
      return '\n' + buildAsciiTable(node) + '\n';
    }

    if (['script', 'style', 'svg', 'img'].includes(tag)) return '';

    const block = ['p', 'div', 'li', 'tr', 'br', 'h1', 'h2', 'h3',
                   'h4', 'h5', 'h6', 'pre', 'ul', 'ol'].includes(tag);

    let text = '';
    for (const child of node.childNodes) {
      text += domToText(child);
    }

    if (tag === 'br') return '\n';
    if (block) return '\n' + text.trim() + '\n';
    return text;
  }

  function buildAsciiTable(tableEl) {
    const rows = [];
    const rowEls = tableEl.querySelectorAll('tr');
    for (const tr of rowEls) {
      const cells = [];
      for (const cell of tr.querySelectorAll('th, td')) {
        cells.push(cell.innerText.replace(/\s+/g, ' ').trim());
      }
      if (cells.length > 0) rows.push(cells);
    }

    if (rows.length === 0) return '';

    const colCount = Math.max(...rows.map(r => r.length));
    const colWidths = Array(colCount).fill(0);
    for (const row of rows) {
      for (let c = 0; c < colCount; c++) {
        const cellLen = (row[c] || '').length;
        if (cellLen > colWidths[c]) colWidths[c] = cellLen;
      }
    }

    const separator = '+' + colWidths.map(w => '-'.repeat(w + 2)).join('+') + '+';
    const lines = [];
    lines.push(separator);
    for (let r = 0; r < rows.length; r++) {
      const cells = rows[r];
      const rowLine = '| ' + colWidths
        .map((w, c) => (cells[c] || '').padEnd(w))
        .join(' | ') + ' |';
      lines.push(rowLine);
      lines.push(separator);
    }

    return lines.join('\n');
  }

  function getLanguage() {
    const langBtnSelectors = [
      'button[id*="lang"] .ant-select-selection-item',
      'div.flex.items-center button',
      'button[class*="rounded"][class*="items-center"]',
    ];

    for (const sel of langBtnSelectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const txt = el.textContent.trim().toLowerCase();
        if (COMMENT_PREFIX[txt] !== undefined) return txt;
      }
    }

    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      const txt = btn.textContent.trim().toLowerCase();
      if (COMMENT_PREFIX[txt] !== undefined && btn.offsetParent !== null) {
        return txt;
      }
    }

    const editorEl = document.querySelector('[data-mode-id]');
    if (editorEl) {
      const mode = editorEl.getAttribute('data-mode-id').toLowerCase();
      if (COMMENT_PREFIX[mode] !== undefined) return mode;
    }

    return 'python3';
  }

  function getCode() {
    return new Promise((resolve) => {
      const msgId = 'lc-copier-' + Date.now();

      const handler = (event) => {
        if (event.data && event.data.type === msgId) {
          window.removeEventListener('message', handler);
          resolve(event.data.code || '');
        }
      };
      window.addEventListener('message', handler);

      const script = document.createElement('script');
      script.textContent = `
        (function() {
          try {
            var models = monaco.editor.getModels();
            var code = models.length > 0 ? models[0].getValue() : '';
            window.postMessage({ type: '${msgId}', code: code }, '*');
          } catch(e) {
            window.postMessage({ type: '${msgId}', code: '' }, '*');
          }
        })();
      `;
      document.documentElement.appendChild(script);
      script.remove();

      setTimeout(() => {
        window.removeEventListener('message', handler);
        const lines = document.querySelectorAll('.view-line');
        if (lines.length > 0) {
          const code = Array.from(lines)
            .map(l => {
              let text = l.textContent;
              text = text.replace(/\u00a0/g, ' ');
              return text;
            })
            .join('\n');
          resolve(code);
        } else {
          resolve('');
        }
      }, 1500);
    });
  }

  function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return String(hash);
  }

  function sanitizeBaseUrl(url) {
    let clean = (url || 'http://127.0.0.1:1234').trim();
    return clean.replace(/\/+$/, '');
  }

  function extractJson(text) {
    if (!text || typeof text !== 'string') return null;

    try {
      return JSON.parse(text.trim());
    } catch (e) {}

    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (codeBlockMatch && codeBlockMatch[1]) {
      try {
        return JSON.parse(codeBlockMatch[1].trim());
      } catch (e) {}
    }

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const jsonCandidate = text.substring(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(jsonCandidate);
      } catch (e) {}
    }

    return null;
  }

  // ── Universal Storage Helpers ────────────────────────────────────────
  async function getStorageConfig(defaults) {
    try {
      if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        const res = await browser.storage.local.get(defaults);
        return { ...defaults, ...res };
      }
    } catch (e) {}

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        const res = await chrome.storage.local.get(defaults);
        return { ...defaults, ...res };
      } catch (e) {}
      return new Promise((resolve) => {
        chrome.storage.local.get(defaults, (items) => {
          resolve({ ...defaults, ...(items || {}) });
        });
      });
    }

    return defaults;
  }

  async function saveStorageConfig(items) {
    try {
      if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        await browser.storage.local.set(items || {});
        return true;
      }
    } catch (e) {}

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        await chrome.storage.local.set(items || {});
        return true;
      } catch (e) {}
      return new Promise((resolve) => {
        chrome.storage.local.set(items || {}, () => resolve(true));
      });
    }

    return false;
  }

  // ── History Storage Operations ───────────────────────────────────────
  async function getHistory() {
    const data = await getStorageConfig({ [HISTORY_STORAGE_KEY]: [] });
    return Array.isArray(data[HISTORY_STORAGE_KEY]) ? data[HISTORY_STORAGE_KEY] : [];
  }

  async function saveAnalysisToHistory(item) {
    const history = await getHistory();
    const filtered = history.filter(h => !(h.problemTitle === item.problemTitle && h.codeHash === item.codeHash));
    filtered.unshift(item);
    if (filtered.length > MAX_HISTORY_ITEMS) {
      filtered.pop();
    }
    await saveStorageConfig({ [HISTORY_STORAGE_KEY]: filtered });
  }

  async function deleteHistoryItem(id) {
    const history = await getHistory();
    const filtered = history.filter(h => h.id !== id);
    await saveStorageConfig({ [HISTORY_STORAGE_KEY]: filtered });
  }

  async function clearAllHistory() {
    await saveStorageConfig({ [HISTORY_STORAGE_KEY]: [] });
  }

  // ── Code Cleaning (Strip All Comments & Non-Code Lines) ──────────────

  function cleanCodeForAnalysis(rawCode, language) {
    if (!rawCode || !rawCode.trim()) return '';
    const prefix = COMMENT_PREFIX[language] || '#';
    const lines = rawCode.split('\n');

    let inBlockComment = false;
    const clean = [];

    for (let line of lines) {
      const trimmed = line.trim();
      if (trimmed === '') continue;

      // Handle multi-line block comments / docstrings
      if (trimmed.startsWith('/*') || trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
        if (!trimmed.endsWith('*/') && !trimmed.endsWith('"""') && !trimmed.endsWith("'''")) {
          inBlockComment = true;
        }
        continue;
      }
      if (inBlockComment) {
        if (trimmed.endsWith('*/') || trimmed.endsWith('"""') || trimmed.endsWith("'''")) {
          inBlockComment = false;
        }
        continue;
      }

      // Skip full comment lines
      if (trimmed.startsWith(prefix) || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith(';') || trimmed.startsWith('--')) {
        continue;
      }

      // Strip trailing inline comment
      const commentIdx = line.indexOf(prefix);
      if (commentIdx !== -1) {
        line = line.slice(0, commentIdx);
      }

      if (line.trim() !== '') {
        clean.push(line.trimEnd());
      }
    }

    return (clean.length > 0 ? clean.join('\n') : rawCode).trim();
  }

  // ── Direct In-Tab LM Studio Client ───────────────────────────────────

  async function directTestConnection(baseUrl) {
    const cleanUrl = sanitizeBaseUrl(baseUrl);
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${cleanUrl}/v1/models`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latencyMs = Date.now() - startTime;

      if (!response.ok) {
        return {
          success: false,
          error: `Server responded with HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json();
      const models = Array.isArray(data.data) ? data.data.map((m) => m.id) : [];
      const activeModel = models.find((m) => !m.toLowerCase().includes('embed')) || models[0] || 'No model loaded';

      return {
        success: true,
        latencyMs,
        models,
        activeModel,
      };
    } catch (err) {
      if (err.name === 'AbortError') {
        return {
          success: false,
          error: `Connection timed out after 10s connecting to ${cleanUrl}`,
        };
      }
      return {
        success: false,
        error: `Could not connect to LM Studio at ${cleanUrl}. Ensure LM Studio local server is running AND 'Enable CORS' is toggled ON in LM Studio settings. (${err.message})`,
      };
    }
  }

  async function directAnalyzeComplexity(payload, abortSignal) {
    const config = await getStorageConfig({
      baseUrl: 'http://127.0.0.1:1234',
      model: '',
      timeoutMs: 180000,
    });

    const baseUrl = sanitizeBaseUrl(config.baseUrl);

    let model = (config.model || '').trim();
    if (!model) {
      try {
        const modelsRes = await fetch(`${baseUrl}/v1/models`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: abortSignal,
        });
        if (modelsRes.ok) {
          const modelsData = await modelsRes.json();
          if (modelsData && Array.isArray(modelsData.data) && modelsData.data.length > 0) {
            const chatModel = modelsData.data.find((m) => !m.id.toLowerCase().includes('embed'));
            model = chatModel ? chatModel.id : modelsData.data[0].id;
          }
        }
      } catch (e) {}
      model = model || 'local-model';
    }

    const systemPrompt = `You are an expert algorithmic complexity analyzer.
Analyze the provided code carefully and determine its asymptotic Time and Space Complexity in standard Big-O notation.

Follow these rules:
1. Identify all operations, helper functions, loops, recursion, and data structures.
2. Formulate step-by-step reasoning first, then determine the dominant terms.
3. Return ONLY a valid JSON object matching this schema:
{
  "reasoning": "Step-by-step mathematical derivation of time and space complexity.",
  "time_breakdown": [
    "Step/Operation 1: O(...)",
    "Step/Operation 2: O(...)"
  ],
  "space_breakdown": [
    "Auxiliary storage / recursion stack: O(...)"
  ],
  "time_complexity": "O(...)",
  "space_complexity": "O(...)",
  "summary": "1-2 sentence concise summary explaining the complexity.",
  "optimizations": "Brief note on optimality or potential optimization techniques."
}
IMPORTANT: Output valid JSON directly starting with { . Do not output thinking tags or markdown fences outside the JSON.`;

    const cleanCode = cleanCodeForAnalysis(payload.code, payload.language);

    const userPrompt = `Problem: ${payload.title || 'LeetCode Problem'}
Language: ${payload.language || 'Python'}

Code to analyze:
\`\`\`${payload.language || ''}
${cleanCode}
\`\`\``;

    const requestBody = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 1000,
      stream: false,
    };

    const startTime = Date.now();
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: abortSignal,
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      let errBody = '';
      try { errBody = await response.text(); } catch (e) {}
      return {
        success: false,
        error: `LM Studio error (HTTP ${response.status}): ${errBody || response.statusText}`,
      };
    }

    const data = await response.json();
    const choiceMsg = data.choices?.[0]?.message || {};
    const rawContent = (choiceMsg.content || choiceMsg.reasoning_content || '').trim();
    const parsed = extractJson(rawContent);

    if (parsed && (parsed.time_complexity || parsed.space_complexity)) {
      return {
        success: true,
        data: {
          timeComplexity: parsed.time_complexity || 'O(?)',
          spaceComplexity: parsed.space_complexity || 'O(?)',
          summary: parsed.summary || '',
          timeBreakdown: Array.isArray(parsed.time_breakdown)
            ? parsed.time_breakdown
            : (parsed.time_breakdown ? [String(parsed.time_breakdown)] : []),
          spaceBreakdown: Array.isArray(parsed.space_breakdown)
            ? parsed.space_breakdown
            : (parsed.space_breakdown ? [String(parsed.space_breakdown)] : []),
          optimizations: parsed.optimizations || '',
          modelUsed: model,
          latencyMs,
        },
      };
    }

    return {
      success: true,
      data: {
        timeComplexity: 'AI Estimate',
        spaceComplexity: 'AI Estimate',
        summary: rawContent.slice(0, 300),
        timeBreakdown: [rawContent],
        spaceBreakdown: [],
        optimizations: '',
        modelUsed: model,
        latencyMs,
        isUnstructured: true,
      },
    };
  }

  // ── Formatting ───────────────────────────────────────────────────────

  function formatOutput(title, description, code, language, complexityData = null) {
    const prefix = COMMENT_PREFIX[language] || '#';
    const result = [];

    if (title) {
      result.push(`${prefix} ${title}`);
      result.push(`${prefix} ${window.location.href.split('?')[0]}`);
      result.push(prefix);
    }

    if (complexityData) {
      result.push(`${prefix} ── Complexity Analysis (LM Studio AI Estimate) ──`);
      result.push(`${prefix} Time Complexity:  ${complexityData.timeComplexity}`);
      result.push(`${prefix} Space Complexity: ${complexityData.spaceComplexity}`);
      if (complexityData.summary) {
        result.push(`${prefix} Note: ${complexityData.summary}`);
      }
      result.push(prefix);
    }

    const rawLines = description.split('\n');
    let insideExample = false;

    for (let i = 0; i < rawLines.length; i++) {
      const trimmed = rawLines[i].trim();
      if (trimmed === '') continue;

      const isExampleHeader = /^Example\s+\d+/i.test(trimmed);
      const isConstraintsHeader = /^Constraints/i.test(trimmed);
      const isSectionStart = isExampleHeader || isConstraintsHeader;

      if (isSectionStart && result.length > 0) {
        if (result[result.length - 1] !== prefix) {
          result.push(prefix);
        }
      }

      if (isExampleHeader) insideExample = true;
      if (isConstraintsHeader) insideExample = false;

      if (trimmed.startsWith('|') || trimmed.startsWith('+')) {
        result.push(`${prefix} ${rawLines[i]}`);
        continue;
      }

      result.push(`${prefix} ${rawLines[i].trimEnd()}`);
    }

    result.push('');
    if (code.trim()) {
      result.push(code);
    }

    return result.join('\n');
  }

  async function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {}
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok;
    } catch (e) {
      return false;
    }
  }

  // ── Main Copy Handler ───────────────────────────────────────────────

  async function handleCopy() {
    const copyBtn = document.getElementById('lc-copier-copy-btn');
    if (!copyBtn) return;
    copyBtn.disabled = true;

    try {
      const title = getTitle();
      const description = getDescription();
      const language = getLanguage();
      const code = await getCode();

      if (!description && !code) {
        showToast('Could not extract problem data', 'error');
        copyBtn.disabled = false;
        return;
      }

      const config = await getStorageConfig({ includeComplexityInCopy: false });
      let complexityData = null;
      if (config.includeComplexityInCopy && code) {
        const cacheKey = `${title}__${language}__${hashString(code)}`;
        complexityData = complexityCache.get(cacheKey) || null;
      }

      const output = formatOutput(title, description, code, language, complexityData);
      const success = await copyToClipboard(output);

      if (success) {
        copyBtn.classList.add('lc-btn-success');
        const iconEl = copyBtn.querySelector('.lc-btn-icon');
        iconEl.textContent = '';
        iconEl.appendChild(createCheckIcon());

        const displayLang = language.charAt(0).toUpperCase() + language.slice(1);
        showToast('Copied to clipboard!', 'success', displayLang);

        setTimeout(() => {
          copyBtn.classList.remove('lc-btn-success');
          iconEl.textContent = '';
          iconEl.appendChild(createCopyIcon());
        }, 2000);
      } else {
        showToast('Failed to copy — check permissions', 'error');
      }
    } catch (err) {
      console.error('[LeetCode Copier]', err);
      showToast('Error: ' + err.message, 'error');
    }

    copyBtn.disabled = false;
  }

  // ── Complexity Feature Handlers & UI ────────────────────────────────

  function closeComplexityCard() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
    if (currentAbortController) {
      currentAbortController.abort();
      currentAbortController = null;
    }
    if (complexityCard) {
      complexityCard.remove();
      complexityCard = null;
    }
  }

  async function handleComplexityClick(forceRefresh = false) {
    const title = getTitle();
    const description = getDescription();
    const language = getLanguage();
    const code = await getCode();

    if (!code || !code.trim()) {
      showToast('No solution code found in editor to analyze', 'error');
      return;
    }

    const cacheKey = `${title}__${language}__${hashString(code)}`;

    if (!forceRefresh && complexityCache.has(cacheKey)) {
      renderComplexityModal(complexityCache.get(cacheKey), { title, description, language, code }, true);
      return;
    }

    renderComplexityLoading();

    currentAbortController = new AbortController();
    const payload = { title, description, language, code };

    try {
      const response = await directAnalyzeComplexity(payload, currentAbortController.signal);

      if (response && response.success && response.data) {
        complexityCache.set(cacheKey, response.data);

        // Save to Persistent History
        const historyItem = {
          id: 'hist-' + Date.now(),
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' · ' + new Date().toLocaleDateString([], { month: 'short', day: 'numeric' }),
          createdMs: Date.now(),
          problemTitle: title || 'LeetCode Problem',
          problemUrl: window.location.href.split('?')[0],
          language,
          codeHash: cacheKey,
          codeSnippet: cleanCodeForAnalysis(code, language),
          timeComplexity: response.data.timeComplexity,
          spaceComplexity: response.data.spaceComplexity,
          summary: response.data.summary,
          timeBreakdown: response.data.timeBreakdown,
          spaceBreakdown: response.data.spaceBreakdown,
          optimizations: response.data.optimizations,
          modelUsed: response.data.modelUsed,
          latencyMs: response.data.latencyMs,
          fullDescription: description,
          fullCode: code,
        };
        await saveAnalysisToHistory(historyItem);

        renderComplexityModal(response.data, payload, false);
      } else {
        renderComplexityError(response?.error || 'Failed to analyze complexity.');
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        closeComplexityCard();
        showToast('Analysis cancelled', 'error');
      } else {
        renderComplexityError(err.message || 'Connection error.');
      }
    }
  }

  function createComplexityBadge(type, value, isSmall = false) {
    const badge = document.createElement('div');
    badge.className = `lc-badge lc-badge-${type.toLowerCase()}${isSmall ? ' lc-badge-sm' : ''}`;
    const label = document.createElement('span');
    label.className = 'lc-badge-label';
    label.textContent = type;
    const val = document.createElement('span');
    val.className = 'lc-badge-val';
    val.textContent = value || 'N/A';
    badge.appendChild(label);
    badge.appendChild(val);
    return badge;
  }

  function renderComplexityLoading() {
    closeComplexityCard();

    complexityCard = document.createElement('div');
    complexityCard.id = 'lc-complexity-card';
    complexityCard.className = 'lc-card lc-card-loading';

    let seconds = 0;
    const updateTime = () => {
      seconds++;
      const timeEl = complexityCard ? complexityCard.querySelector('.lc-loading-time') : null;
      if (timeEl) timeEl.textContent = `${seconds}s elapsed`;
    };
    timerInterval = setInterval(updateTime, 1000);

    const header = document.createElement('div');
    header.className = 'lc-card-header';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'lc-card-title';
    const dot = document.createElement('span');
    dot.className = 'lc-pulse-dot';
    titleDiv.appendChild(dot);
    titleDiv.appendChild(document.createTextNode(' Analyzing with LM Studio...'));

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lc-close-btn';
    closeBtn.appendChild(createCloseIcon());
    closeBtn.addEventListener('click', closeComplexityCard);

    header.appendChild(titleDiv);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'lc-card-body';

    const skBadge = document.createElement('div');
    skBadge.className = 'lc-skeleton lc-skeleton-badge';
    body.appendChild(skBadge);

    [80, 95, 60].forEach((w) => {
      const line = document.createElement('div');
      line.className = 'lc-skeleton lc-skeleton-line';
      line.style.width = `${w}%`;
      body.appendChild(line);
    });

    const statusDiv = document.createElement('div');
    statusDiv.className = 'lc-loading-status';
    const timeSpan = document.createElement('span');
    timeSpan.className = 'lc-loading-time';
    timeSpan.textContent = '0s elapsed';
    const hintSpan = document.createElement('span');
    hintSpan.className = 'lc-loading-hint';
    hintSpan.textContent = 'Running local inference on your GPU/CPU';
    statusDiv.appendChild(timeSpan);
    statusDiv.appendChild(hintSpan);
    body.appendChild(statusDiv);

    const footer = document.createElement('div');
    footer.className = 'lc-card-footer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'lc-btn-cancel';
    cancelBtn.textContent = 'Cancel Request';
    cancelBtn.addEventListener('click', closeComplexityCard);

    footer.appendChild(cancelBtn);

    complexityCard.appendChild(header);
    complexityCard.appendChild(body);
    complexityCard.appendChild(footer);

    document.body.appendChild(complexityCard);
  }

  function renderComplexityError(errorMessage) {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (!complexityCard) return;

    complexityCard.className = 'lc-card lc-card-error';
    complexityCard.textContent = '';

    const header = document.createElement('div');
    header.className = 'lc-card-header';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'lc-card-title lc-error-title';
    titleDiv.textContent = '⚠️ LM Studio Connection Error';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lc-close-btn';
    closeBtn.appendChild(createCloseIcon());
    closeBtn.addEventListener('click', closeComplexityCard);

    header.appendChild(titleDiv);
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'lc-card-body';

    const errDesc = document.createElement('p');
    errDesc.className = 'lc-error-msg';
    errDesc.textContent = errorMessage;

    const helpBox = document.createElement('div');
    helpBox.className = 'lc-help-box';
    const fixTitle = document.createElement('strong');
    fixTitle.textContent = 'How to fix:';
    helpBox.appendChild(fixTitle);

    const ol = document.createElement('ol');

    const li1 = document.createElement('li');
    li1.appendChild(document.createTextNode('Open '));
    const strong1 = document.createElement('strong');
    strong1.textContent = 'LM Studio';
    li1.appendChild(strong1);
    li1.appendChild(document.createTextNode('.'));
    ol.appendChild(li1);

    const li2 = document.createElement('li');
    li2.appendChild(document.createTextNode('Go to the '));
    const strong2 = document.createElement('strong');
    strong2.textContent = 'Local Server';
    li2.appendChild(strong2);
    li2.appendChild(document.createTextNode(' (<->) tab.'));
    ol.appendChild(li2);

    const li3 = document.createElement('li');
    li3.appendChild(document.createTextNode('In the right-hand '));
    const strong3a = document.createElement('strong');
    strong3a.textContent = 'Server Settings';
    li3.appendChild(strong3a);
    li3.appendChild(document.createTextNode(' sidebar, toggle '));
    const strong3b = document.createElement('strong');
    strong3b.textContent = '"Enable CORS"';
    li3.appendChild(strong3b);
    li3.appendChild(document.createTextNode(' to '));
    const strong3c = document.createElement('strong');
    strong3c.textContent = 'ON';
    li3.appendChild(strong3c);
    li3.appendChild(document.createTextNode(' (required for browser extensions).'));
    ol.appendChild(li3);

    const li4 = document.createElement('li');
    li4.appendChild(document.createTextNode('Ensure your model (e.g. Qwen2.5-Coder-3B) is loaded and server is running on '));
    const strong4 = document.createElement('strong');
    strong4.textContent = 'Port 1234';
    li4.appendChild(strong4);
    li4.appendChild(document.createTextNode('.'));
    ol.appendChild(li4);

    helpBox.appendChild(ol);

    body.appendChild(errDesc);
    body.appendChild(helpBox);

    const footer = document.createElement('div');
    footer.className = 'lc-card-footer lc-footer-split';

    const retryBtn = document.createElement('button');
    retryBtn.className = 'lc-btn-primary lc-btn-sm';
    retryBtn.textContent = '🔄 Retry';
    retryBtn.addEventListener('click', () => handleComplexityClick(true));

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'lc-btn-secondary lc-btn-sm';
    settingsBtn.textContent = '⚙️ Settings';
    settingsBtn.addEventListener('click', openSettingsModal);

    footer.appendChild(settingsBtn);
    footer.appendChild(retryBtn);

    complexityCard.appendChild(header);
    complexityCard.appendChild(body);
    complexityCard.appendChild(footer);
  }

  function renderComplexityModal(data, payload, isCached = false) {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
    if (!complexityCard) {
      complexityCard = document.createElement('div');
      complexityCard.id = 'lc-complexity-card';
      document.body.appendChild(complexityCard);
    }

    complexityCard.className = 'lc-card lc-card-result';
    complexityCard.textContent = '';

    const header = document.createElement('div');
    header.className = 'lc-card-header';

    const titleDiv = document.createElement('div');
    titleDiv.className = 'lc-card-title';
    titleDiv.appendChild(document.createTextNode('⚡ Complexity Analysis '));
    if (isCached) {
      const cachedTag = document.createElement('span');
      cachedTag.className = 'lc-cached-tag';
      cachedTag.textContent = 'Cached';
      titleDiv.appendChild(cachedTag);
    }

    const headerActions = document.createElement('div');
    headerActions.className = 'lc-header-actions';

    const histBtn = document.createElement('button');
    histBtn.className = 'lc-icon-btn';
    histBtn.title = 'View History';
    histBtn.appendChild(createHistoryIcon());
    histBtn.addEventListener('click', openHistoryModal);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lc-close-btn';
    closeBtn.appendChild(createCloseIcon());
    closeBtn.addEventListener('click', closeComplexityCard);

    headerActions.appendChild(histBtn);
    headerActions.appendChild(closeBtn);

    header.appendChild(titleDiv);
    header.appendChild(headerActions);

    const disclaimer = document.createElement('div');
    disclaimer.className = 'lc-disclaimer-banner';
    disclaimer.appendChild(document.createTextNode('✨ '));
    const strongEl = document.createElement('strong');
    strongEl.textContent = 'Local AI Estimate (LM Studio)';
    disclaimer.appendChild(strongEl);
    disclaimer.appendChild(document.createTextNode(' • Always verify mathematical bounds'));

    const body = document.createElement('div');
    body.className = 'lc-card-body';

    const badgeRow = document.createElement('div');
    badgeRow.className = 'lc-badge-row';
    badgeRow.appendChild(createComplexityBadge('Time', data.timeComplexity));
    badgeRow.appendChild(createComplexityBadge('Space', data.spaceComplexity));

    const modelTag = document.createElement('div');
    modelTag.className = 'lc-model-tag';
    const latencySec = data.latencyMs ? ` (${(data.latencyMs / 1000).toFixed(1)}s)` : '';
    modelTag.textContent = `Model: ${data.modelUsed || 'local'}${latencySec}`;

    body.appendChild(badgeRow);
    body.appendChild(modelTag);

    if (data.summary) {
      const summaryP = document.createElement('p');
      summaryP.className = 'lc-summary-text';
      summaryP.textContent = data.summary;
      body.appendChild(summaryP);
    }

    if (data.timeBreakdown && data.timeBreakdown.length > 0) {
      const timeSec = document.createElement('div');
      timeSec.className = 'lc-breakdown-sec';
      const timeSecTitle = document.createElement('span');
      timeSecTitle.className = 'lc-breakdown-title';
      timeSecTitle.textContent = '⏱️ Time Breakdown:';
      timeSec.appendChild(timeSecTitle);

      const ul = document.createElement('ul');
      data.timeBreakdown.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
      });
      timeSec.appendChild(ul);
      body.appendChild(timeSec);
    }

    if (data.spaceBreakdown && data.spaceBreakdown.length > 0) {
      const spaceSec = document.createElement('div');
      spaceSec.className = 'lc-breakdown-sec';
      const spaceSecTitle = document.createElement('span');
      spaceSecTitle.className = 'lc-breakdown-title';
      spaceSecTitle.textContent = '💾 Space Breakdown:';
      spaceSec.appendChild(spaceSecTitle);

      const ul = document.createElement('ul');
      data.spaceBreakdown.forEach((item) => {
        const li = document.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
      });
      spaceSec.appendChild(ul);
      body.appendChild(spaceSec);
    }

    if (data.optimizations) {
      const optSec = document.createElement('div');
      optSec.className = 'lc-opt-sec';
      optSec.appendChild(document.createTextNode('💡 '));
      const noteStrong = document.createElement('strong');
      noteStrong.textContent = 'Note:';
      optSec.appendChild(noteStrong);
      optSec.appendChild(document.createTextNode(` ${data.optimizations}`));
      body.appendChild(optSec);
    }

    const footer = document.createElement('div');
    footer.className = 'lc-card-footer lc-footer-stacked';

    const copyAllBtn = document.createElement('button');
    copyAllBtn.className = 'lc-btn-primary lc-btn-block';
    copyAllBtn.textContent = '📋 Copy Problem + Complexity to Code';
    copyAllBtn.addEventListener('click', async () => {
      const output = formatOutput(payload.title, payload.description, payload.code, payload.language, data);
      const ok = await copyToClipboard(output);
      if (ok) {
        showToast('Copied problem + complexity to clipboard!', 'success');
        copyAllBtn.textContent = '✅ Copied!';
        setTimeout(() => { copyAllBtn.textContent = '📋 Copy Problem + Complexity to Code'; }, 1800);
      }
    });

    const subActionRow = document.createElement('div');
    subActionRow.className = 'lc-subaction-row';

    const copyCompOnlyBtn = document.createElement('button');
    copyCompOnlyBtn.className = 'lc-btn-secondary lc-btn-sm';
    copyCompOnlyBtn.textContent = 'Copy Big-O Only';
    copyCompOnlyBtn.addEventListener('click', async () => {
      const prefix = COMMENT_PREFIX[payload.language] || '#';
      const snippet = [
        `${prefix} Time Complexity:  ${data.timeComplexity}`,
        `${prefix} Space Complexity: ${data.spaceComplexity}`,
        data.summary ? `${prefix} ${data.summary}` : '',
      ].filter(Boolean).join('\n');
      const ok = await copyToClipboard(snippet);
      if (ok) showToast('Copied Big-O summary!', 'success');
    });

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'lc-btn-secondary lc-btn-sm';
    refreshBtn.textContent = '🔄 Re-analyze';
    refreshBtn.title = 'Bypass cache and run fresh inference in LM Studio';
    refreshBtn.addEventListener('click', () => handleComplexityClick(true));

    subActionRow.appendChild(copyCompOnlyBtn);
    subActionRow.appendChild(refreshBtn);

    footer.appendChild(copyAllBtn);
    footer.appendChild(subActionRow);

    complexityCard.appendChild(header);
    complexityCard.appendChild(disclaimer);
    complexityCard.appendChild(body);
    complexityCard.appendChild(footer);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── History Modal ────────────────────────────────────────────────────

  async function openHistoryModal() {
    if (historyModal) {
      historyModal.remove();
      historyModal = null;
    }

    const historyItems = await getHistory();

    historyModal = document.createElement('div');
    historyModal.id = 'lc-history-modal';
    historyModal.className = 'lc-modal-backdrop';

    const modalBox = document.createElement('div');
    modalBox.className = 'lc-modal-box lc-modal-lg';

    // Header
    const header = document.createElement('div');
    header.className = 'lc-card-header';

    const cardTitle = document.createElement('div');
    cardTitle.className = 'lc-card-title';
    const titleSpan = document.createElement('span');
    titleSpan.textContent = '📜 Analysis History';
    const countBadge = document.createElement('span');
    countBadge.className = 'lc-count-badge';
    countBadge.textContent = String(historyItems.length);
    cardTitle.appendChild(titleSpan);
    cardTitle.appendChild(countBadge);
    header.appendChild(cardTitle);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lc-close-btn';
    closeBtn.appendChild(createCloseIcon());
    closeBtn.addEventListener('click', () => { historyModal.remove(); historyModal = null; });
    header.appendChild(closeBtn);

    // Filter toolbar
    const filterToolbar = document.createElement('div');
    filterToolbar.className = 'lc-history-filter-bar';

    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'lc-input lc-search-input';
    searchInput.placeholder = 'Search by problem name or complexity...';

    const clearAllBtn = document.createElement('button');
    clearAllBtn.className = 'lc-btn-secondary lc-btn-sm lc-btn-danger-hover';
    clearAllBtn.textContent = 'Clear All';
    clearAllBtn.title = 'Clear all saved analyses';
    clearAllBtn.addEventListener('click', async () => {
      if (confirm('Are you sure you want to clear your complexity analysis history?')) {
        await clearAllHistory();
        renderList([]);
      }
    });

    filterToolbar.appendChild(searchInput);
    if (historyItems.length > 0) {
      filterToolbar.appendChild(clearAllBtn);
    }

    // Body container
    const body = document.createElement('div');
    body.className = 'lc-modal-body lc-history-body';

    const listContainer = document.createElement('div');
    listContainer.className = 'lc-history-list';
    body.appendChild(listContainer);

    function renderList(items) {
      listContainer.textContent = '';

      if (items.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'lc-history-empty';
        const emptyIcon = document.createElement('div');
        emptyIcon.className = 'lc-empty-icon';
        emptyIcon.textContent = '📜';
        const emptyTitle = document.createElement('div');
        emptyTitle.className = 'lc-empty-title';
        emptyTitle.textContent = 'No analysis history yet';
        const emptySub = document.createElement('div');
        emptySub.className = 'lc-empty-sub';
        emptySub.textContent = 'Analyses run on LeetCode problems will automatically appear here.';
        emptyDiv.appendChild(emptyIcon);
        emptyDiv.appendChild(emptyTitle);
        emptyDiv.appendChild(emptySub);
        listContainer.appendChild(emptyDiv);
        return;
      }

      items.forEach((item) => {
        const itemCard = document.createElement('div');
        itemCard.className = 'lc-history-card';

        const itemHeader = document.createElement('div');
        itemHeader.className = 'lc-hist-item-header';

        const titleSpan = document.createElement('div');
        titleSpan.className = 'lc-hist-title';
        titleSpan.textContent = item.problemTitle;

        const metaRight = document.createElement('div');
        metaRight.className = 'lc-hist-meta-right';

        const langBadge = document.createElement('span');
        langBadge.className = 'lc-lang-badge';
        langBadge.textContent = item.language;

        const timeSpan = document.createElement('span');
        timeSpan.className = 'lc-hist-time';
        timeSpan.textContent = item.timestamp;

        const delBtn = document.createElement('button');
        delBtn.className = 'lc-del-btn';
        delBtn.title = 'Delete item';
        delBtn.appendChild(createTrashIcon());
        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await deleteHistoryItem(item.id);
          const updated = await getHistory();
          renderList(updated);
        });

        metaRight.appendChild(langBadge);
        metaRight.appendChild(timeSpan);
        metaRight.appendChild(delBtn);

        itemHeader.appendChild(titleSpan);
        itemHeader.appendChild(metaRight);

        // Badges row
        const badgeRow = document.createElement('div');
        badgeRow.className = 'lc-badge-row lc-badge-row-sm';
        badgeRow.appendChild(createComplexityBadge('Time', item.timeComplexity, true));
        badgeRow.appendChild(createComplexityBadge('Space', item.spaceComplexity, true));

        // Summary
        const summaryDiv = document.createElement('div');
        summaryDiv.className = 'lc-hist-summary';
        summaryDiv.textContent = item.summary || 'No summary available.';

        // Card footer actions
        const cardFooter = document.createElement('div');
        cardFooter.className = 'lc-hist-footer';

        const copyCodeBtn = document.createElement('button');
        copyCodeBtn.className = 'lc-btn-primary lc-btn-sm';
        copyCodeBtn.textContent = '📋 Copy Problem + Big-O';
        copyCodeBtn.addEventListener('click', async () => {
          const output = formatOutput(item.problemTitle, item.fullDescription || '', item.fullCode || item.codeSnippet || '', item.language, item);
          const ok = await copyToClipboard(output);
          if (ok) showToast('Copied to clipboard!', 'success');
        });

        const copyBigOOnlyBtn = document.createElement('button');
        copyBigOOnlyBtn.className = 'lc-btn-secondary lc-btn-sm';
        copyBigOOnlyBtn.textContent = 'Copy Big-O Only';
        copyBigOOnlyBtn.addEventListener('click', async () => {
          const prefix = COMMENT_PREFIX[item.language] || '#';
          const snippet = [
            `${prefix} Time Complexity:  ${item.timeComplexity}`,
            `${prefix} Space Complexity: ${item.spaceComplexity}`,
            item.summary ? `${prefix} ${item.summary}` : '',
          ].filter(Boolean).join('\n');
          const ok = await copyToClipboard(snippet);
          if (ok) showToast('Copied Big-O summary!', 'success');
        });

        cardFooter.appendChild(copyCodeBtn);
        cardFooter.appendChild(copyBigOOnlyBtn);

        itemCard.appendChild(itemHeader);
        itemCard.appendChild(badgeRow);
        itemCard.appendChild(summaryDiv);
        itemCard.appendChild(cardFooter);

        listContainer.appendChild(itemCard);
      });
    }

    renderList(historyItems);

    // Live search filter
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase().trim();
      if (!q) {
        renderList(historyItems);
      } else {
        const filtered = historyItems.filter(h => 
          (h.problemTitle && h.problemTitle.toLowerCase().includes(q)) ||
          (h.timeComplexity && h.timeComplexity.toLowerCase().includes(q)) ||
          (h.spaceComplexity && h.spaceComplexity.toLowerCase().includes(q)) ||
          (h.summary && h.summary.toLowerCase().includes(q))
        );
        renderList(filtered);
      }
    });

    modalBox.appendChild(header);
    modalBox.appendChild(filterToolbar);
    modalBox.appendChild(body);
    historyModal.appendChild(modalBox);
    document.body.appendChild(historyModal);
  }

  // ── Settings Modal ───────────────────────────────────────────────────

  async function openSettingsModal() {
    if (settingsModal) {
      settingsModal.remove();
      settingsModal = null;
    }

    const config = await getStorageConfig({
      baseUrl: 'http://127.0.0.1:1234',
      model: '',
      timeoutMs: 60000,
      includeComplexityInCopy: false,
    });

    settingsModal = document.createElement('div');
    settingsModal.id = 'lc-settings-modal';
    settingsModal.className = 'lc-modal-backdrop';

    const modalBox = document.createElement('div');
    modalBox.className = 'lc-modal-box';

    const header = document.createElement('div');
    header.className = 'lc-card-header';
    const modalTitle = document.createElement('div');
    modalTitle.className = 'lc-card-title';
    modalTitle.textContent = '⚙️ LM Studio Configuration';
    header.appendChild(modalTitle);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lc-close-btn';
    closeBtn.appendChild(createCloseIcon());
    closeBtn.addEventListener('click', () => { settingsModal.remove(); settingsModal = null; });
    header.appendChild(closeBtn);

    const body = document.createElement('div');
    body.className = 'lc-modal-body';

    // Form Group 1: Base URL
    const fg1 = document.createElement('div');
    fg1.className = 'lc-form-group';
    const lbl1 = document.createElement('label');
    lbl1.htmlFor = 'lc-base-url';
    lbl1.textContent = 'LM Studio Server URL';
    const input1 = document.createElement('input');
    input1.type = 'text';
    input1.id = 'lc-base-url';
    input1.className = 'lc-input';
    input1.value = config.baseUrl || 'http://127.0.0.1:1234';
    input1.placeholder = 'http://127.0.0.1:1234';
    const hint1 = document.createElement('span');
    hint1.className = 'lc-field-hint';
    hint1.appendChild(document.createTextNode('Default local server port in LM Studio is '));
    const strongPort = document.createElement('strong');
    strongPort.textContent = '1234';
    hint1.appendChild(strongPort);
    fg1.appendChild(lbl1);
    fg1.appendChild(input1);
    fg1.appendChild(hint1);
    body.appendChild(fg1);

    // Form Group 2: Model ID Override
    const fg2 = document.createElement('div');
    fg2.className = 'lc-form-group';
    const lbl2 = document.createElement('label');
    lbl2.htmlFor = 'lc-model-name';
    lbl2.appendChild(document.createTextNode('Model ID Override '));
    const optTag = document.createElement('span');
    optTag.className = 'lc-opt-tag';
    optTag.textContent = '(Optional)';
    lbl2.appendChild(optTag);
    const input2 = document.createElement('input');
    input2.type = 'text';
    input2.id = 'lc-model-name';
    input2.className = 'lc-input';
    input2.value = config.model || '';
    input2.placeholder = 'Leave blank to auto-detect loaded model';
    const hint2 = document.createElement('span');
    hint2.className = 'lc-field-hint';
    hint2.appendChild(document.createTextNode('Tip: '));
    const strongModel = document.createElement('strong');
    strongModel.textContent = 'qwen2.5-coder-3b-instruct';
    hint2.appendChild(strongModel);
    hint2.appendChild(document.createTextNode(' or '));
    const strongModel2 = document.createElement('strong');
    strongModel2.textContent = '1.5b';
    hint2.appendChild(strongModel2);
    hint2.appendChild(document.createTextNode(' provides ~3s instantaneous inference.'));
    fg2.appendChild(lbl2);
    fg2.appendChild(input2);
    fg2.appendChild(hint2);
    body.appendChild(fg2);

    // Form Group 3: Checkbox
    const fg3 = document.createElement('div');
    fg3.className = 'lc-form-group';
    const chkLabel = document.createElement('label');
    chkLabel.className = 'lc-checkbox-label';
    const chkInput = document.createElement('input');
    chkInput.type = 'checkbox';
    chkInput.id = 'lc-auto-include';
    chkInput.checked = !!config.includeComplexityInCopy;
    const chkSpan = document.createElement('span');
    chkSpan.textContent = 'Auto-include Big-O in standard "Copy Problem" button (when cached)';
    chkLabel.appendChild(chkInput);
    chkLabel.appendChild(chkSpan);
    fg3.appendChild(chkLabel);
    body.appendChild(fg3);

    // Test connection box
    const testBox = document.createElement('div');
    testBox.className = 'lc-test-connection-box';
    const testBtn = document.createElement('button');
    testBtn.id = 'lc-test-conn-btn';
    testBtn.className = 'lc-btn-secondary lc-btn-sm';
    testBtn.textContent = '🔌 Test LM Studio Connection';
    const statusSpan = document.createElement('span');
    statusSpan.id = 'lc-test-status';
    statusSpan.className = 'lc-test-status';
    testBox.appendChild(testBtn);
    testBox.appendChild(statusSpan);
    body.appendChild(testBox);

    const footer = document.createElement('div');
    footer.className = 'lc-card-footer lc-footer-split';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'lc-btn-secondary lc-btn-sm';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => { settingsModal.remove(); settingsModal = null; });

    const saveBtn = document.createElement('button');
    saveBtn.className = 'lc-btn-primary lc-btn-sm';
    saveBtn.textContent = 'Save Settings';
    saveBtn.addEventListener('click', async () => {
      const baseUrl = input1.value.trim() || 'http://127.0.0.1:1234';
      const model = input2.value.trim();
      const includeComplexityInCopy = chkInput.checked;

      await saveStorageConfig({ baseUrl, model, includeComplexityInCopy });
      showToast('Settings saved!', 'success');
      settingsModal.remove();
      settingsModal = null;
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);

    modalBox.appendChild(header);
    modalBox.appendChild(body);
    modalBox.appendChild(footer);
    settingsModal.appendChild(modalBox);
    document.body.appendChild(settingsModal);

    // Direct In-Tab Test Connection Handler
    testBtn.addEventListener('click', async () => {
      const url = input1.value.trim() || 'http://127.0.0.1:1234';
      statusSpan.className = 'lc-test-status lc-test-loading';
      statusSpan.textContent = 'Testing connection...';
      testBtn.disabled = true;

      const res = await directTestConnection(url);
      testBtn.disabled = false;
      if (res && res.success) {
        statusSpan.className = 'lc-test-status lc-test-success';
        statusSpan.textContent = ` Connected! (${res.latencyMs}ms) Active Model: ${res.activeModel}`;
      } else {
        statusSpan.className = 'lc-test-status lc-test-error';
        statusSpan.textContent = `❌ ${res?.error || 'Connection failed'}`;
      }
    });
  }

  // ── SPA Navigation Detection ────────────────────────────────────────

  function isProblemPage() {
    return /^\/problems\/[^/]+/.test(window.location.pathname);
  }

  function checkPage() {
    const currentUrl = window.location.href;
    if (currentUrl === lastUrl) return;
    lastUrl = currentUrl;

    if (isProblemPage()) {
      setTimeout(createUI, 800);
    } else {
      removeUI();
    }
  }

  const origPushState = history.pushState;
  history.pushState = function () {
    origPushState.apply(this, arguments);
    setTimeout(checkPage, 100);
  };

  const origReplaceState = history.replaceState;
  history.replaceState = function () {
    origReplaceState.apply(this, arguments);
    setTimeout(checkPage, 100);
  };

  window.addEventListener('popstate', () => setTimeout(checkPage, 100));

  // ── Initialize ──────────────────────────────────────────────────────
  checkPage();
})();
