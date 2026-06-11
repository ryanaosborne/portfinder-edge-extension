// Matches IPv4 addresses and MAC addresses in colon, hyphen, and Cisco dot formats.
const TERM_PATTERN = new RegExp(
  '\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b' + // IPv4
  '|(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}' +                                                 // MAC colon
  '|(?:[0-9a-fA-F]{2}-){5}[0-9a-fA-F]{2}' +                                                 // MAC hyphen
  '|\\b[0-9a-fA-F]{4}\\.[0-9a-fA-F]{4}\\.[0-9a-fA-F]{4}\\b',                               // Cisco dot
  'g'
);

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'NOSCRIPT', 'SVG', 'MATH']);

// --- Tooltip ---

let tooltip = null;
let hoverTimeout = null;
let activeTerm = null;

function ensureTooltip() {
  if (tooltip) return tooltip;
  tooltip = document.createElement('div');
  tooltip.id = 'pf-tooltip';
  document.body.appendChild(tooltip);
  return tooltip;
}

function positionTooltip(x, y) {
  const t = ensureTooltip();
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const tw = t.offsetWidth || 320;
  const th = t.offsetHeight || 120;
  const left = x + 14 + tw > vw ? x - tw - 8 : x + 14;
  const top  = y + 14 + th > vh ? y - th - 8 : y + 14;
  t.style.left = left + 'px';
  t.style.top  = top  + 'px';
}

function showTooltip(term, x, y) {
  const t = ensureTooltip();
  activeTerm = term;
  t.className = 'pf-loading';
  t.innerHTML = `<span class="pf-spinner"></span> Looking up <code>${escHtml(term)}</code>…`;
  t.style.display = 'block';
  positionTooltip(x, y);

  chrome.runtime.sendMessage({ action: 'search', term }, (response) => {
    if (activeTerm !== term) return;
    if (!response) {
      renderError(t, 'Extension error — could not contact background worker.');
      return;
    }
    if (response.error) {
      renderError(t, response.error);
      return;
    }
    if (!response.results.length) {
      t.className = 'pf-empty';
      t.textContent = `No results for ${term}`;
      return;
    }
    t.className = '';
    t.innerHTML = renderResults(response.results);
  });
}

function hideTooltip() {
  activeTerm = null;
  if (tooltip) tooltip.style.display = 'none';
}

function renderError(t, msg) {
  t.className = 'pf-error-state';
  t.innerHTML = `<span class="pf-error-icon">⚠</span> ${escHtml(msg)}`;
}

function renderResults(results) {
  return results.map((r, i) => {
    const rows = [
      ['Switch',      r.node_id || 'Switch'],
      ['MAC',         r.mac_address],
      ['IP',          r.ip_address],
      ['Hostname',    r.hostname],
      ['Interface',   r.interface],
      ['Description', r.interface_description],
      ['Data VLAN',   formatVlan(r.access_vlan, r.access_vlan_name)],
      ['Voice VLAN',  formatVlan(r.voice_vlan, r.voice_vlan_name)],
    ]
      .filter(([, v]) => v != null && v !== '')
      .map(([k, v]) => `<tr><th>${escHtml(k)}</th><td>${escHtml(String(v))}</td></tr>`)
      .join('');
    return `
      <div class="pf-record">
        <table class="pf-table">${rows}</table>
      </div>
      ${i < results.length - 1 ? '<hr class="pf-divider">' : ''}
    `;
  }).join('');
}

function formatVlan(id, name) {
  if (id == null) return null;
  return name ? `${id} (${name})` : String(id);
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- DOM scanning ---

let mutating = false;

function processTextNode(node) {
  const text = node.nodeValue;
  TERM_PATTERN.lastIndex = 0;
  if (!TERM_PATTERN.test(text)) return;

  TERM_PATTERN.lastIndex = 0;
  const frag = document.createDocumentFragment();
  let last = 0;
  let m;

  while ((m = TERM_PATTERN.exec(text)) !== null) {
    if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
    const span = document.createElement('span');
    span.className = 'pf-term';
    span.dataset.pfTerm = m[0];
    span.textContent = m[0];
    frag.appendChild(span);
    last = m.index + m[0].length;
  }

  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  node.parentNode.replaceChild(frag, node);
}

function walkNode(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    processTextNode(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (SKIP_TAGS.has(root.tagName)) return;
  if (root.id === 'pf-tooltip') return;
  if (root.classList?.contains('pf-term')) return;

  for (const child of Array.from(root.childNodes)) {
    walkNode(child);
  }
}

// --- Event listeners ---

document.addEventListener('click', (e) => {
  const span = e.target.closest?.('.pf-term');
  if (!span) return;
  const link = span.closest('a[href]');
  if (!link) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  link.click();
}, true);

document.addEventListener('mouseover', (e) => {
  const span = e.target.closest?.('.pf-term');
  if (!span) { clearTimeout(hoverTimeout); return; }
  clearTimeout(hoverTimeout);
  hoverTimeout = setTimeout(() => showTooltip(span.dataset.pfTerm, e.clientX, e.clientY), 250);
});

document.addEventListener('mouseout', (e) => {
  if (!e.target.closest?.('.pf-term')) return;
  clearTimeout(hoverTimeout);
  hideTooltip();
});

document.addEventListener('mousemove', (e) => {
  if (tooltip?.style.display === 'block') positionTooltip(e.clientX, e.clientY);
});

document.addEventListener('scroll', hideTooltip, true);
document.addEventListener('keydown', hideTooltip, true);

// --- Initial scan + mutation observer ---

if (document.body) walkNode(document.body);

const observer = new MutationObserver((mutations) => {
  if (mutating) return;
  mutating = true;
  for (const mut of mutations) {
    for (const node of mut.addedNodes) {
      if (node.id === 'pf-tooltip') continue;
      walkNode(node);
    }
  }
  mutating = false;
});

observer.observe(document.body, { childList: true, subtree: true });
