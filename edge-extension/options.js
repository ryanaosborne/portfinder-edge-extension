const urlInput = document.getElementById('url');
const form     = document.getElementById('form');
const statusEl = document.getElementById('status');
const btnTest  = document.getElementById('btn-test');

function showStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = type;
  statusEl.style.display = 'block';
}

// Load saved URL on open
chrome.storage.sync.get({ apiBaseUrl: '' }, ({ apiBaseUrl }) => {
  urlInput.value = apiBaseUrl;
});

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const raw = urlInput.value.trim().replace(/\/$/, '');
  if (!raw) {
    showStatus('Please enter a URL.', 'err');
    return;
  }
  chrome.storage.sync.set({ apiBaseUrl: raw }, () => {
    showStatus('Saved.', 'ok');
    setTimeout(() => { statusEl.style.display = 'none'; }, 2500);
  });
});

btnTest.addEventListener('click', async () => {
  const raw = urlInput.value.trim().replace(/\/$/, '');
  if (!raw) { showStatus('Enter a URL first.', 'err'); return; }

  showStatus('Testing…', 'info');
  try {
    const resp = await fetch(`${raw}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terms: ['0.0.0.0'] }),
      signal: AbortSignal.timeout(6000),
    });
    if (resp.ok) {
      showStatus(`Connected — API returned ${resp.status}.`, 'ok');
    } else {
      showStatus(`Reached server but got HTTP ${resp.status}.`, 'err');
    }
  } catch (err) {
    showStatus(`Connection failed: ${err.message}`, 'err');
  }
});
