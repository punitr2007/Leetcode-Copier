(() => {
  'use strict';

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

  // ── State ────────────────────────────────────────────────────────────
  let fab = null;
  let toast = null;
  let toastTimer = null;
  let lastUrl = '';

  // ── SVG Icon Factories (safe DOM creation, no innerHTML) ────────────
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
    return el;
  }

  function createCopyIcon() {
    const svg = svgEl('svg', { viewBox: '0 0 24 24' });
    svg.appendChild(svgEl('rect', { x: '9', y: '9', width: '13', height: '13', rx: '2' }));
    svg.appendChild(svgEl('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }));
    return svg;
  }

  function createCheckIcon() {
    const svg = svgEl('svg', { viewBox: '0 0 24 24' });
    svg.appendChild(svgEl('polyline', { points: '20 6 9 17 4 12' }));
    return svg;
  }

  function createErrorIcon() {
    const svg = svgEl('svg', { viewBox: '0 0 24 24' });
    svg.appendChild(svgEl('circle', { cx: '12', cy: '12', r: '10' }));
    svg.appendChild(svgEl('line', { x1: '15', y1: '9', x2: '9', y2: '15' }));
    svg.appendChild(svgEl('line', { x1: '9', y1: '9', x2: '15', y2: '15' }));
    return svg;
  }

  // ── UI Creation ──────────────────────────────────────────────────────
  function createUI() {
    if (fab) return;

    // Floating Action Button
    fab = document.createElement('button');
    fab.id = 'lc-copier-fab';
    fab.title = 'Copy problem to clipboard';

    const iconSpan = document.createElement('span');
    iconSpan.className = 'lc-copier-icon';
    iconSpan.appendChild(createCopyIcon());

    const labelSpan = document.createElement('span');
    labelSpan.className = 'lc-copier-label';
    labelSpan.textContent = 'Copy Problem';

    fab.appendChild(iconSpan);
    fab.appendChild(labelSpan);
    fab.addEventListener('click', handleCopy);
    document.body.appendChild(fab);

    // Pulse animation to draw attention on first load
    fab.classList.add('lc-copier-pulse');
    fab.addEventListener('animationend', () => {
      fab.classList.remove('lc-copier-pulse');
    });

    // Toast container
    toast = document.createElement('div');
    toast.id = 'lc-copier-toast';
    document.body.appendChild(toast);
  }

  function removeUI() {
    if (fab) { fab.remove(); fab = null; }
    if (toast) { toast.remove(); toast = null; }
  }

  function showToast(message, type = 'success', lang = '') {
    if (!toast) return;
    clearTimeout(toastTimer);

    // Clear previous content safely
    toast.textContent = '';
    toast.className = 'lc-copier-toast'; // reset
    toast.classList.add(type === 'success' ? 'lc-toast-success' : 'lc-toast-error');

    // Icon
    const iconSpan = document.createElement('span');
    iconSpan.className = 'lc-toast-icon';
    iconSpan.appendChild(type === 'success' ? createCheckIcon() : createErrorIcon());
    toast.appendChild(iconSpan);

    // Message
    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    toast.appendChild(msgSpan);

    // Language badge (optional)
    if (lang) {
      const langSpan = document.createElement('span');
      langSpan.className = 'lc-toast-lang';
      langSpan.textContent = lang;
      toast.appendChild(langSpan);
    }

    // Trigger reflow then show
    void toast.offsetWidth;
    toast.classList.add('lc-toast-visible');

    toastTimer = setTimeout(() => {
      toast.classList.remove('lc-toast-visible');
    }, 2500);
  }

  // ── Extraction Helpers ───────────────────────────────────────────────

  /**
   * Extract the problem title from the page.
   */
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
    // Fallback: try to get from <title> tag
    const titleMatch = document.title.match(/^(.+?)\s*[-–|]/);
    if (titleMatch) return titleMatch[1].trim();
    return '';
  }

  /**
   * Extract the problem description text (includes examples & constraints).
   */
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

    // Use a TreeWalker for better text extraction
    return cleanDescription(descEl);
  }

  /**
   * Walk the description DOM and produce clean text.
   */
  function cleanDescription(root) {
    // innerText already handles visibility and layout, giving us
    // a reasonable plain-text representation.
    let text = root.innerText || '';

    // Clean up excessive blank lines (3+ → 2)
    text = text.replace(/\n{3,}/g, '\n\n');

    // Trim each line's trailing whitespace
    text = text.split('\n').map(l => l.trimEnd()).join('\n');

    return text.trim();
  }

  /**
   * Detect the currently selected language in LeetCode's editor.
   */
  function getLanguage() {
    // Method 1: look for the language selector button text
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

    // Method 2: search for a visible language label near the editor
    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      const txt = btn.textContent.trim().toLowerCase();
      if (COMMENT_PREFIX[txt] !== undefined && btn.offsetParent !== null) {
        return txt;
      }
    }

    // Method 3: check Monaco editor's data-mode-id
    const editorEl = document.querySelector('[data-mode-id]');
    if (editorEl) {
      const mode = editorEl.getAttribute('data-mode-id').toLowerCase();
      if (COMMENT_PREFIX[mode] !== undefined) return mode;
    }

    // Default to python3
    return 'python3';
  }

  /**
   * Extract the starter code from Monaco editor by injecting into page context.
   */
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

      // Inject script into page context to access Monaco API
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

      // Timeout fallback — try DOM-based extraction
      setTimeout(() => {
        window.removeEventListener('message', handler);
        // Fallback: read from visible editor lines
        const lines = document.querySelectorAll('.view-line');
        if (lines.length > 0) {
          const code = Array.from(lines)
            .map(l => {
              // Preserve indentation: convert &nbsp; and spaces
              let text = l.textContent;
              // Monaco uses non-breaking spaces for indentation
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

  // ── Formatting ───────────────────────────────────────────────────────

  /**
   * Section-aware formatter:
   *  - Title line, then blank # separator
   *  - Description body: compact, no blank lines within
   *  - Blank # separator before each "Example N:" block
   *  - Blank # separator after each example block (before next section)
   *  - Blank # separator before "Constraints:"
   *  - Code follows after a blank line
   */
  function formatOutput(title, description, code, language) {
    const prefix = COMMENT_PREFIX[language] || '#';
    const result = [];

    // ── Title ──
    if (title) {
      result.push(`${prefix} ${title}`);
      result.push(prefix); // blank separator after title
    }

    // ── Description, Examples, Constraints ──
    const rawLines = description.split('\n');
    // Track whether we're inside an example block to add trailing separator
    let insideExample = false;

    for (let i = 0; i < rawLines.length; i++) {
      const trimmed = rawLines[i].trim();

      // Skip blank lines — we control spacing ourselves
      if (trimmed === '') continue;

      const isExampleHeader = /^Example\s+\d+/i.test(trimmed);
      const isConstraintsHeader = /^Constraints/i.test(trimmed);
      const isSectionStart = isExampleHeader || isConstraintsHeader;

      if (isSectionStart && result.length > 0) {
        // Close previous section with a blank comment separator
        // (but avoid double-blank if the last line is already a bare prefix)
        if (result[result.length - 1] !== prefix) {
          result.push(prefix);
        }
      }

      if (isExampleHeader) insideExample = true;
      if (isConstraintsHeader) insideExample = false;

      // Preserve original indentation (important for constraints)
      result.push(`${prefix} ${rawLines[i].trimEnd()}`);
    }

    // ── Blank line then code ──
    result.push('');
    if (code.trim()) {
      result.push(code);
    }

    return result.join('\n');
  }

  // ── Copy to Clipboard ───────────────────────────────────────────────

  async function copyToClipboard(text) {
    // Try modern Clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        // Fall through to fallback
      }
    }

    // Fallback: textarea + execCommand
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
    if (!fab) return;

    // Visual feedback — show loading state
    fab.style.pointerEvents = 'none';

    try {
      const title = getTitle();
      const description = getDescription();
      const language = getLanguage();
      const code = await getCode();

      if (!description && !code) {
        showToast('Could not extract problem data', 'error');
        fab.style.pointerEvents = '';
        return;
      }

      // Pass title and description separately — formatOutput handles spacing
      const output = formatOutput(title, description, code, language);
      const success = await copyToClipboard(output);

      if (success) {
        // Success feedback
        fab.classList.add('lc-copier-success');
        const iconEl = fab.querySelector('.lc-copier-icon');
        iconEl.textContent = '';
        iconEl.appendChild(createCheckIcon());

        const displayLang = language.charAt(0).toUpperCase() + language.slice(1);
        showToast('Copied to clipboard!', 'success', displayLang);

        setTimeout(() => {
          fab.classList.remove('lc-copier-success');
          const restoreEl = fab.querySelector('.lc-copier-icon');
          restoreEl.textContent = '';
          restoreEl.appendChild(createCopyIcon());
        }, 2000);
      } else {
        showToast('Failed to copy — check permissions', 'error');
      }
    } catch (err) {
      console.error('[LeetCode Copier]', err);
      showToast('Error: ' + err.message, 'error');
    }

    fab.style.pointerEvents = '';
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
      // Small delay to let the page render
      setTimeout(createUI, 800);
    } else {
      removeUI();
    }
  }

  // Override pushState/replaceState to detect SPA navigation
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
