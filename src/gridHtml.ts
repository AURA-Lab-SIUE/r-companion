// Builds the two HTML surfaces that show the grid:
//   1. the webview, which loads AG Grid and grid.js as local resources with a CSP nonce, and
//   2. a self-contained export, which inlines the same CSS and JS plus the data, so Brain can run
//      axe over it with tools/web_qa.py on Pythia.
// Both share one body, so the accessibility checked on the export is the accessibility shipped.

export interface WebviewUris {
  nonce: string;
  cspSource: string;
  agGridJs: string;
  agGridCss: string;
  themeCss: string;
  gridCss: string;
  gridJs: string;
  title: string;
}

export interface StandaloneAssets {
  agGridJs: string;
  agGridCss: string;
  themeCss: string;
  gridCss: string;
  gridJs: string;
  init: unknown;
  title: string;
}

function body(title: string): string {
  // The grid region is labelled; AG Grid supplies role="grid" and the cell/row roles underneath.
  return `
  <header class="aura-toolbar">
    <h1 class="aura-title">${escapeHtml(title)}</h1>
    <div class="aura-actions" role="toolbar" aria-label="Data viewer actions">
      <button type="button" id="btn-refresh" class="aura-btn" title="Re-read the data file from disk">Refresh</button>
      <button type="button" id="btn-add" class="aura-btn">Add coding column</button>
      <button type="button" id="btn-rebuild" class="aura-btn">Insert rebuild code</button>
    </div>
  </header>
  <p id="aura-status" class="aura-status" role="status" aria-live="polite"></p>
  <div id="grid" class="ag-theme-quartz aura-grid" aria-label="${escapeHtml(title)}"></div>
  <p id="aura-help" class="aura-help">
    Data values are read only. Coding columns are on the right. In a column with a list of codes, type
    the first letters of a code and press Enter to save it and move down, or Tab to save it and move right.
    Escape cancels, F2 or a double-click shows the whole list, and Delete clears a cell. In a free-text
    column, type and press Enter. Your work saves by itself to the codes file. Press Ctrl+Z (Cmd+Z on a
    Mac) to undo.
  </p>
  <span id="aura-loadtime" aria-hidden="true" hidden></span>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

export function webviewHtml(u: WebviewUris): string {
  const csp = [
    `default-src 'none'`,
    `img-src ${u.cspSource} data:`,
    `style-src ${u.cspSource} 'unsafe-inline'`,
    // AG Grid's quartz theme embeds its icon font as a data: URI; without it the header icons
    // drew as empty boxes
    `font-src ${u.cspSource} data:`,
    `script-src 'nonce-${u.nonce}'`,
  ].join('; ');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="${u.agGridCss}">
<link rel="stylesheet" href="${u.themeCss}">
<link rel="stylesheet" href="${u.gridCss}">
<title>${escapeHtml(u.title)}</title>
</head>
<body>
${body(u.title)}
<script nonce="${u.nonce}" src="${u.agGridJs}"></script>
<script nonce="${u.nonce}" src="${u.gridJs}"></script>
</body>
</html>`;
}

export function standaloneHtml(a: StandaloneAssets): string {
  // Self-contained: no external host is reachable, so everything is inlined. This is the file axe
  // runs against; it boots from embedded data instead of waiting for a webview message.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>${a.agGridCss}</style>
<style>${a.themeCss}</style>
<style>${a.gridCss}</style>
<title>${escapeHtml(a.title)}</title>
</head>
<body>
${body(a.title)}
<script>${a.agGridJs}</script>
<script>window.__AURA_INIT__ = ${JSON.stringify(a.init)};</script>
<script>${a.gridJs}</script>
</body>
</html>`;
}
