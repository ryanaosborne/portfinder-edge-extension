// Simple TTL cache: term -> { results, ts }
const cache = new Map();
const CACHE_TTL_MS = 30_000;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action !== 'search') return false;

  const term = message.term;
  const cached = cache.get(term);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    sendResponse({ results: cached.results });
    return false;
  }

  (async () => {
    const { apiBaseUrl } = await chrome.storage.sync.get({ apiBaseUrl: '' });
    if (!apiBaseUrl) {
      sendResponse({ error: 'PortFinder API URL not set. Right-click the extension → Options.' });
      return;
    }

    try {
      const url = apiBaseUrl.replace(/\/$/, '') + '/api/search';
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ terms: [term] }),
        signal: AbortSignal.timeout(8000),
      });

      if (!resp.ok) {
        sendResponse({ error: `API returned ${resp.status}` });
        return;
      }

      const results = await resp.json();
      cache.set(term, { results, ts: Date.now() });
      sendResponse({ results });
    } catch (err) {
      sendResponse({ error: err.name === 'TimeoutError' ? 'Request timed out.' : err.message });
    }
  })();

  return true; // keep message channel open for async response
});
