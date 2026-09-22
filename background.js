(() => {
  'use strict';

  const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

  // Track in-flight request abort controllers by requestId
  const activeRequests = new Map();

  const DEFAULT_CONFIG = {
    baseUrl: 'http://127.0.0.1:1234',
    model: '',
    timeoutMs: 60000,
    includeComplexityInCopy: false,
  };

  /**
   * Universal storage getter compatible with Firefox Promise and Chrome callback
   */
  async function getConfig() {
    try {
      if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        const res = await browser.storage.local.get(DEFAULT_CONFIG);
        return { ...DEFAULT_CONFIG, ...res };
      }
    } catch (e) {}

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        const res = await chrome.storage.local.get(DEFAULT_CONFIG);
        return { ...DEFAULT_CONFIG, ...res };
      } catch (e) {}
      return new Promise((resolve) => {
        chrome.storage.local.get(DEFAULT_CONFIG, (items) => {
          resolve({ ...DEFAULT_CONFIG, ...(items || {}) });
        });
      });
    }

    return DEFAULT_CONFIG;
  }

  /**
   * Universal storage setter
   */
  async function saveConfig(items) {
    try {
      if (typeof browser !== 'undefined' && browser.storage && browser.storage.local) {
        await browser.storage.local.set(items || {});
        return { success: true };
      }
    } catch (e) {}

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      try {
        await chrome.storage.local.set(items || {});
        return { success: true };
      } catch (e) {}
      return new Promise((resolve) => {
        chrome.storage.local.set(items || {}, () => {
          resolve({ success: true });
        });
      });
    }

    return { success: true };
  }

  /**
   * Sanitize base URL (remove trailing slash)
   */
  function sanitizeBaseUrl(url) {
    let clean = (url || 'http://127.0.0.1:1234').trim();
    return clean.replace(/\/+$/, '');
  }

  /**
   * Auto-detect loaded model in LM Studio via /v1/models
   */
  async function detectActiveModel(baseUrl, signal) {
    try {
      const response = await fetch(`${baseUrl}/v1/models`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
        signal,
      });

      if (!response.ok) return null;
      const data = await response.json();
      if (data && Array.isArray(data.data) && data.data.length > 0) {
        const chatModel = data.data.find((m) => !m.id.toLowerCase().includes('embed'));
        return chatModel ? chatModel.id : data.data[0].id;
      }
      return null;
    } catch (err) {
      return null;
    }
  }

  /**
   * Test connection to LM Studio server
   */
  async function handleTestConnection(baseUrl) {
    const cleanUrl = sanitizeBaseUrl(baseUrl);
    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

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
          error: `Connection timed out after 8s connecting to ${cleanUrl}`,
        };
      }
      return {
        success: false,
        error: `Could not connect to LM Studio at ${cleanUrl}. Ensure LM Studio local server is running AND 'Enable CORS' is toggled ON in LM Studio settings. (${err.message})`,
      };
    }
  }

  /**
   * Robust JSON extraction from LLM response
   */
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

  /**
   * Analyze code complexity via LM Studio chat completions
   */
  async function handleAnalyzeComplexity(payload, requestId) {
    const config = await getConfig();
    const baseUrl = sanitizeBaseUrl(config.baseUrl);
    const timeoutMs = Number(config.timeoutMs) || 60000;

    const controller = new AbortController();
    if (requestId) {
      activeRequests.set(requestId, controller);
    }

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeoutMs);

    try {
      let model = (config.model || '').trim();
      if (!model) {
        const detected = await detectActiveModel(baseUrl, controller.signal);
        model = detected || 'local-model';
      }

      const systemPrompt = `You are a precise algorithmic complexity analyzer. Return ONLY valid JSON matching this schema:
{
  "time_complexity": "O(...)",
  "space_complexity": "O(...)",
  "summary": "1-sentence summary",
  "time_breakdown": ["Explanation point 1", "Explanation point 2"],
  "space_breakdown": ["Explanation point 1", "Explanation point 2"],
  "optimizations": "Brief note on optimality"
}
IMPORTANT: Do NOT generate thinking, chain-of-thought, or <think> tags. Start directly with { and output the raw JSON object immediately.`;

      // Clean code: extract class Solution onward, strip all comments and blank lines
      const rawCode = payload.code || '';
      let lines = rawCode.split('\n');
      const classIdx = lines.findIndex(l => /^(class\s+Solution|function\s+|const\s+|var\s+|def\s+|impl\s+|pub\s+fn|func\s+)/i.test(l.trim()));
      if (classIdx !== -1) lines = lines.slice(classIdx);

      let inBlockComment = false;
      const clean = [];
      for (let line of lines) {
        const trimmed = line.trim();
        if (trimmed === '') continue;
        if (trimmed.startsWith('/*') || trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
          if (!trimmed.endsWith('*/') && !trimmed.endsWith('"""') && !trimmed.endsWith("'''")) inBlockComment = true;
          continue;
        }
        if (inBlockComment) {
          if (trimmed.endsWith('*/') || trimmed.endsWith('"""') || trimmed.endsWith("'''")) inBlockComment = false;
          continue;
        }
        if (trimmed.startsWith('#') || trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
        const commentIdx = line.indexOf('#') !== -1 ? line.indexOf('#') : line.indexOf('//');
        if (commentIdx !== -1) line = line.slice(0, commentIdx);
        if (line.trim() !== '') clean.push(line.trimEnd());
      }
      const cleanCode = (clean.length > 0 ? clean.join('\n') : rawCode).trim();

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
        temperature: 0.0,
        max_tokens: 500,
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
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
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
    } catch (err) {
      if (err.name === 'AbortError') {
        return {
          success: false,
          error: `Request was cancelled or timed out after ${Math.round(timeoutMs / 1000)}s.`,
          isAborted: true,
        };
      }
      return {
        success: false,
        error: `Could not connect to LM Studio at ${baseUrl}. Ensure LM Studio local server is started AND 'Enable CORS' is toggled ON in LM Studio settings. (${err.message})`,
      };
    } finally {
      if (requestId) {
        activeRequests.delete(requestId);
      }
    }
  }

  // ── Universal Promise-based Message Listener ────────────────────────
  browserAPI.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const { action, payload, requestId, baseUrl } = message || {};

    if (action === 'testConnection') {
      return handleTestConnection(baseUrl);
    }

    if (action === 'analyzeComplexity') {
      return handleAnalyzeComplexity(payload, requestId);
    }

    if (action === 'cancelAnalysis') {
      if (requestId && activeRequests.has(requestId)) {
        const ctrl = activeRequests.get(requestId);
        ctrl.abort();
        activeRequests.delete(requestId);
        return Promise.resolve({ success: true, message: 'Cancelled' });
      }
      return Promise.resolve({ success: false, message: 'Request ID not found' });
    }

    if (action === 'getConfig') {
      return getConfig();
    }

    if (action === 'saveConfig') {
      return saveConfig(payload);
    }

    return false;
  });
})();
