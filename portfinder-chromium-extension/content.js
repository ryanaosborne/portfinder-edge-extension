// Matches IPv4 addresses and MAC addresses in colon, hyphen, and Cisco dot formats.
const TERM_PATTERN = new RegExp(
  '\\b(?:(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\.){3}(?:25[0-5]|2[0-4]\\d|[01]?\\d\\d?)\\b' + // IPv4
  '|(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}' +                                                 // MAC colon
  '|(?:[0-9a-fA-F]{2}-){5}[0-9a-fA-F]{2}' +                                                 // MAC hyphen
  '|\\b[0-9a-fA-F]{4}\\.[0-9a-fA-F]{4}\\.[0-9a-fA-F]{4}\\b',                               // Cisco dot
  'g'
);

const SKIP_SELECTOR = 'script, style, textarea, input, select, noscript, svg, math, .pf-term, #pf-tooltip';

const IPV4_RE = /^(?:\d{1,3}\.){3}\d{1,3}$/;

// RFC1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
function isRfc1918(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

// IPs are only actionable when private; MAC formats are always actionable.
function shouldWrap(term) {
  return IPV4_RE.test(term) ? isRfc1918(term) : true;
}

// --- Tooltip ---

let tooltip = null;
let hoverTimeout = null;
let activeTerm = null;
let lastX = 0;
let lastY = 0;

function ensureTooltip() {
  if (tooltip) return tooltip;
  tooltip = document.createElement('div');
  tooltip.id = 'pf-tooltip';
  document.body.appendChild(tooltip);
  return tooltip;
}

function positionTooltip(x, y) {
  const t = ensureTooltip();
  lastX = x;
  lastY = y;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 8;
  const tw = t.offsetWidth || 320;
  const th = t.offsetHeight || 120;

  // Prefer below-right of the cursor; flip to the other side when it
  // would overflow, then clamp so the box always stays in the viewport.
  let left = x + 14;
  if (left + tw > vw - margin) left = x - tw - 14;
  left = Math.max(margin, Math.min(left, vw - tw - margin));

  let top = y + 14;
  if (top + th > vh - margin) top = y - th - 14;
  top = Math.max(margin, Math.min(top, vh - th - margin));

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
    } else if (response.error) {
      renderError(t, response.error);
    } else if (!response.results.length) {
      t.className = 'pf-empty';
      t.textContent = `No results for ${term}`;
    } else {
      t.className = '';
      t.innerHTML = renderResults(response.results);
    }
    // The box just changed size — re-fit it to the viewport.
    positionTooltip(lastX, lastY);
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

// Nodes created by this extension. The MutationObserver and scanner skip
// them, so our own DOM edits can never feed back into another scan cycle.
const createdNodes = new WeakSet();

function processTextNode(node) {
  if (!node.isConnected || createdNodes.has(node)) return;

  const text = node.nodeValue;
  TERM_PATTERN.lastIndex = 0;
  const matches = [];
  let m;
  while ((m = TERM_PATTERN.exec(text)) !== null) {
    if (shouldWrap(m[0])) matches.push({ index: m.index, term: m[0] });
  }
  if (!matches.length) return;

  const frag = document.createDocumentFragment();
  let last = 0;

  for (const { index, term } of matches) {
    if (index > last) frag.appendChild(document.createTextNode(text.slice(last, index)));
    const span = document.createElement('span');
    span.className = 'pf-term';
    span.dataset.pfTerm = term;
    span.textContent = term;
    frag.appendChild(span);
    last = index + term.length;
  }

  if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
  for (const child of frag.childNodes) createdNodes.add(child);
  node.parentNode.replaceChild(frag, node);
}

function collectTextNodes(root, out) {
  if (root.nodeType === Node.TEXT_NODE) {
    if (!root.parentElement?.closest(SKIP_SELECTOR)) out.push(root);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  if (root.closest?.(SKIP_SELECTOR)) return;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) =>
      n.parentElement?.closest(SKIP_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  let n;
  while ((n = walker.nextNode())) out.push(n);
}

// Text nodes awaiting processing, worked through in idle-time slices so a
// large or rapidly mutating page never blocks rendering.
const pendingTextNodes = [];
let scanScheduled = false;

const scheduleIdle =
  typeof requestIdleCallback === 'function'
    ? requestIdleCallback
    : (cb) => setTimeout(() => cb({ timeRemaining: () => 8 }), 0);

function queueScan(root) {
  collectTextNodes(root, pendingTextNodes);
  if (pendingTextNodes.length && !scanScheduled) {
    scanScheduled = true;
    scheduleIdle(processQueue);
  }
}

function processQueue(deadline) {
  while (pendingTextNodes.length) {
    if (deadline.timeRemaining() <= 1) {
      scheduleIdle(processQueue);
      return;
    }
    processTextNode(pendingTextNodes.shift());
  }
  scanScheduled = false;
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

if (document.body) queueScan(document.body);

const observer = new MutationObserver((mutations) => {
  for (const mut of mutations) {
    for (const node of mut.addedNodes) {
      if (createdNodes.has(node)) continue;
      if (node.id === 'pf-tooltip') continue;
      queueScan(node);
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });
