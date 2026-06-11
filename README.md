# PortFinder Hover

A Chromium browser extension that lets you hover over any IP or MAC address on a web page to instantly see where that device is connected on the network — switch, port, VLANs, and hostname — powered by your PortFinder backend. Works in Edge, Chrome, and other Chromium-based browsers.

## How it works

The extension scans every page you visit for things that look like network addresses and underlines them. Hover over one for a moment and a tooltip appears with the device's location on the network.

**Recognized formats:**

| Type | Examples |
|------|----------|
| IPv4 address | `10.0.0.203` |
| MAC (colon) | `aa:bb:cc:dd:ee:ff` |
| MAC (hyphen) | `aa-bb-cc-dd-ee-ff` |
| MAC (Cisco dot) | `aabb.ccdd.eeff` |

When you hover a recognized term, the extension queries the PortFinder API (`POST /api/search`) and shows every matching telemetry record:

- **Switch** — the device (node) that sees the address
- **MAC / IP** — the addresses from the MAC and ARP tables
- **Hostname** — resolved from the IP via the API's reverse-DNS endpoint (`GET /api/rdns`)
- **Interface** — the switch port (e.g. `GigabitEthernet1/0/4`) and its configured description
- **Data VLAN** — the access VLAN, with its name when available (e.g. `100 (USERS)`)
- **Voice VLAN** — the voice VLAN, when one is configured on the port

Rows with no data are omitted from the tooltip. Results are cached for 30 seconds, so re-hovering the same address doesn't re-query the API.

## Installation

The extension is unpacked (not from the store), so it loads in developer mode. It works identically in Edge and Chrome — it's built on the shared Chromium extension platform (Manifest V3, `chrome.*` APIs).

### Edge

1. Open Edge and go to `edge://extensions`.
2. Enable **Developer mode** (toggle in the left sidebar).
3. Click **Load unpacked** and select the `chromium-extension/` folder from this repository.

### Chrome

1. Open Chrome and go to `chrome://extensions`.
2. Enable **Developer mode** (toggle in the top-right corner).
3. Click **Load unpacked** and select the `chromium-extension/` folder from this repository.

Other Chromium-based browsers (Brave, Opera, Vivaldi) load it the same way from their extensions page.

## Updating an existing installation

Because the extension is loaded unpacked, the browser does not auto-update it — it keeps running whatever code was in the folder when it was last loaded. After pulling new code:

1. Get the latest files (e.g. `git pull`, or replace the `chromium-extension/` folder with the new version in the same location).
2. Go to your browser's extensions page (`edge://extensions` or `chrome://extensions`).
3. Find **PortFinder Hover** and click its **Reload** button (circular arrow icon). This restarts the service worker and picks up all changed files.
4. Refresh any tabs where you want to use the extension — content scripts on already-open pages keep running the old code until the page is reloaded.

Your saved settings (API base URL and token) are kept across reloads; they are only lost if you **Remove** the extension instead of reloading it. If you moved the folder to a different path, the browser can't find it — remove the extension and use **Load unpacked** again with the new location, then re-enter your settings.

## Setup

The extension needs to know where your PortFinder backend lives, and (unless your server relies on a SAML browser session) an API token to authenticate with.

### 1. Generate an API token

1. Open your PortFinder server in the browser and go to the **API Tokens** page (`/tokens`).
2. Generate a personal access token. It will look like `pfk_...`.
3. Copy it — you'll paste it into the extension in the next step.

### 2. Configure the extension

1. Go to your browser's extensions page (`edge://extensions` or `chrome://extensions`), find **PortFinder Hover**, and click **Details → Extension options** (or right-click the extension icon → **Options**).
2. **PortFinder API base URL** — enter the scheme, host, and port of your backend with no trailing slash or path, e.g. `http://portfinder.local:5000`.
3. **API token** — paste the `pfk_...` token. Pasting it with a leading `Bearer ` prefix is fine; the prefix is stripped automatically. Leave this blank only if your server authenticates requests another way.
4. Click **Test connection** to verify the URL and token, then **Save**.

The token is sent as an `Authorization: Bearer <token>` header on every API call. It is stored in the browser's local extension storage and never syncs off the machine; the base URL syncs across your browser profile.

### 3. Try it

Open any page containing an IP or MAC address (a monitoring dashboard, a ticket, a log viewer) and hover over one of the underlined addresses. After a short delay, the tooltip appears with the lookup results.

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| "PortFinder API URL not set" | Open the extension Options and set the base URL. |
| "Authentication failed. Check the API token..." | The token is missing, expired, or revoked. Generate a new one on the server's `/tokens` page and re-save it in Options. |
| "Request timed out." | The server didn't respond within 8 seconds — check that the base URL is reachable from your machine. |
| "No results for ..." | The API responded, but the address isn't in the telemetry database. |
| Hostname row missing | The IP has no reverse-DNS (PTR) record, or the lookup timed out — the rest of the data still displays. |
| Addresses aren't underlined on a page | Reload the page after installing or updating the extension; content scripts only attach on load. |

## Project layout

```
chromium-extension/
├── manifest.json    # MV3 manifest (permissions, scripts, options page)
├── content.js       # Page scanning, term highlighting, tooltip rendering
├── tooltip.css      # Tooltip and highlight styles
├── background.js    # Service worker: API calls, rDNS lookups, result caching
├── options.html     # Settings page UI
└── options.js       # Settings persistence and connection test
```
