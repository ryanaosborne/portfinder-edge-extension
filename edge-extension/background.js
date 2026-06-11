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
    const { apiToken } = await chrome.storage.local.get({ apiToken: '' });

    try {
      const url = apiBaseUrl.replace(/\/$/, '') + '/api/search';
      const headers = { 'Content-Type': 'application/json' };
      if (apiToken) headers['Authorization'] = `Bearer ${apiToken}`;
      const resp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ terms: [term] }),
        signal: AbortSignal.timeout(8000),
      });

      if (resp.status === 401 || resp.status === 403) {
        sendResponse({ error: 'Authentication failed. Check the API token in extension Options.' });
        return;
      }
      if (!resp.ok) {
        sendResponse({ error: `API returned ${resp.status}` });
        return;
      }

      const results = await resp.json();
      await attachHostnames(results, apiBaseUrl, apiToken);
      cache.set(term, { results, ts: Date.now() });
      sendResponse({ results });
    } catch (err) {
      sendResponse({ error: err.name === 'TimeoutError' ? 'Request timed out.' : err.message });
    }
  })();

  return true; // keep message channel open for async response
});

// Resolve each result's IP to a hostname via GET /api/rdns and set r.hostname.
// Lookup failures are non-fatal; hostname is simply left null.
async function attachHostnames(results, apiBaseUrl, apiToken) {
  const ips = [...new Set(results.map((r) => r.ip_address).filter(Boolean))];
  if (!ips.length) return;

  const base = apiBaseUrl.replace(/\/$/, '');
  const headers = apiToken ? { 'Authorization': `Bearer ${apiToken}` } : {};
  const hostnames = new Map();

  await Promise.all(ips.map(async (ip) => {
    try {
      const resp = await fetch(`${base}/api/rdns?ip=${encodeURIComponent(ip)}`, {
        headers,
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return;
      const { hostname } = await resp.json();
      hostnames.set(ip, hostname);
    } catch {
      // ignore — hostname stays null
    }
  }));

  for (const r of results) {
    r.hostname = hostnames.get(r.ip_address) ?? null;
  }
}
