const urlInput   = document.getElementById('url');
const tokenInput = document.getElementById('token');
const form       = document.getElementById('form');
const statusEl   = document.getElementById('status');
const btnTest    = document.getElementById('btn-test');
const btnToggle  = document.getElementById('btn-toggle-token');

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = type;
  statusEl.style.display = 'block';
}

// Accept tokens pasted with a leading "Bearer " prefix
function normalizeToken(raw) {
  return raw.trim().replace(/^Bearer\s+/i, '');
}

function authHeaders(token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

// Load saved settings on open. URL syncs across devices; the token is
// kept in local storage so the secret never leaves this machine.
chrome.storage.sync.get({ apiBaseUrl: '' }, ({ apiBaseUrl }) => {
  urlInput.value = apiBaseUrl;
});
chrome.storage.local.get({ apiToken: '' }, ({ apiToken }) => {
  tokenInput.value = apiToken;
});

btnToggle.addEventListener('click', () => {
  const hidden = tokenInput.type === 'password';
  tokenInput.type = hidden ? 'text' : 'password';
  btnToggle.textContent = hidden ? 'Hide' : 'Show';
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const raw = urlInput.value.trim().replace(/\/$/, '');
  if (!raw) {
    showStatus('Please enter a URL.', 'err');
    return;
  }
  const token = normalizeToken(tokenInput.value);
  tokenInput.value = token;
  chrome.storage.sync.set({ apiBaseUrl: raw }, () => {
    chrome.storage.local.set({ apiToken: token }, () => {
      showStatus('Saved.', 'ok');
      setTimeout(() => { statusEl.style.display = 'none'; }, 2500);
    });
  });
});

btnTest.addEventListener('click', async () => {
  const raw = urlInput.value.trim().replace(/\/$/, '');
  if (!raw) { showStatus('Enter a URL first.', 'err'); return; }

  showStatus('Testing…', 'info');
  try {
    const resp = await fetch(`${raw}/api/search`, {
      method: 'POST',
      headers: authHeaders(normalizeToken(tokenInput.value)),
      body: JSON.stringify({ terms: ['0.0.0.0'] }),
      signal: AbortSignal.timeout(6000),
    });
    if (resp.ok) {
      showStatus(`Connected — API returned ${resp.status}.`, 'ok');
    } else if (resp.status === 401 || resp.status === 403) {
      showStatus(`Reached server but authentication failed (HTTP ${resp.status}). Check the API token.`, 'err');
    } else {
      showStatus(`Reached server but got HTTP ${resp.status}.`, 'err');
    }
  } catch (err) {
    showStatus(`Connection failed: ${err.message}`, 'err');
  }
});
