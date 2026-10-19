// The reliability grid: the one webview in the MVP (scope memo section 3).
//
// Design decisions in force:
//   U6 (q-20261018-0036 = A): pass 1 is hidden while pass 2 is entered, the date of each pass is
//     recorded, and the grid is hidden in MC 427.
//   Columns pass_1 and pass_2 (s20 L104, w10 L245). Default kappa, alpha selectable (s20/w10).
//
// Accessibility (WCAG 2.1 AA, scope memo): every control is a native form control reachable by
// Tab with a visible focus ring; every field has a <label>; colors come from the --vscode-* theme
// variables (so the grid follows the theme and high contrast); no state is shown by color alone.
// buildGridHtml is pure so a standalone copy can be written to disk and run through axe on Pythia
// (tools/web_qa.py), which is Brain's job.

export type ReliabilityMethod = 'kappa' | 'alpha';

export interface GridConfig {
  /** The variable being coded, for the title and the generated sentence. */
  variable: string;
  /** The code labels a coder picks from (the pilot's categories). */
  codes: string[];
  /** How many items the grid starts with. */
  rows: number;
  /** Default statistic. */
  method: ReliabilityMethod;
}

export const DEFAULT_GRID: GridConfig = {
  variable: 'tone',
  codes: ['calm', 'high-energy'],
  rows: 20,
  method: 'kappa',
};

/** One coded item the webview posts back. */
export interface GridRow {
  pass_1: string;
  pass_2: string;
}

export interface GridResult {
  rows: GridRow[];
  method: ReliabilityMethod;
  pass_1_date: string;
  pass_2_date: string;
}

/**
 * The pilot CSV the grid saves (read by the generated reliability() call). pass_1 and pass_2 hold
 * the two codings; pass_1_date and pass_2_date record when each pass was coded (U6), the same date
 * down the column. Only rows coded in both passes are written.
 */
export function gridCsv(result: GridResult): string {
  const header = 'pass_1,pass_2,pass_1_date,pass_2_date';
  const q = (s: string) => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s);
  const body = result.rows
    .filter((r) => r.pass_1 && r.pass_2)
    .map((r) => [r.pass_1, r.pass_2, result.pass_1_date, result.pass_2_date].map(q).join(','));
  return [header, ...body].join('\n') + '\n';
}

export interface GridHtmlOptions {
  /** webview.cspSource for the Content-Security-Policy; omitted for the standalone axe copy. */
  cspSource?: string;
  /** A per-load nonce for the inline script; omitted for the standalone axe copy. */
  nonce?: string;
  /**
   * True for the static file written to disk for axe. It fills the --vscode-* variables with
   * readable fallbacks (axe runs outside VS Code, which would otherwise leave them empty) and
   * drops the CSP that needs a live cspSource.
   */
  standalone?: boolean;
}

/** Build the grid's HTML. Pure: the same config and options always give the same string. */
export function buildGridHtml(cfg: GridConfig, opts: GridHtmlOptions = {}): string {
  const nonce = opts.nonce ?? 'standalone';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const codeOptions = (id: string) =>
    ['<option value="">(not coded)</option>', ...cfg.codes.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`)].join('');

  // Fallback theme variables for the standalone (axe) copy. In VS Code these are injected and win.
  // The pairs below sit at or above the 5:1 house contrast floor on both the light and dark values.
  const fallbackVars = opts.standalone
    ? `
      --vscode-font-family: -apple-system, system-ui, sans-serif;
      --vscode-foreground: #1f1f1f;
      --vscode-editor-background: #ffffff;
      --vscode-editor-foreground: #1f1f1f;
      --vscode-input-background: #ffffff;
      --vscode-input-foreground: #1f1f1f;
      --vscode-input-border: #767676;
      --vscode-focusBorder: #005fcc;
      --vscode-button-background: #005fcc;
      --vscode-button-foreground: #ffffff;
      --vscode-button-hoverBackground: #004a9f;
      --vscode-panel-border: #767676;
      --vscode-descriptionForeground: #3b3b3b;`
    : '';

  const csp =
    opts.cspSource && !opts.standalone
      ? `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';">`
      : '';

  const rowsHtml = Array.from({ length: cfg.rows }, (_, i) => {
    const n = i + 1;
    return `        <tr>
          <th scope="row" class="num">${n}</th>
          <td><label class="sr-only" for="p1-${n}">Pass 1 code for item ${n}</label>
            <select id="p1-${n}" class="pass1" data-row="${i}">${codeOptions(`p1-${n}`)}</select></td>
          <td><label class="sr-only" for="p2-${n}">Pass 2 code for item ${n}</label>
            <select id="p2-${n}" class="pass2" data-row="${i}" disabled>${codeOptions(`p2-${n}`)}</select></td>
        </tr>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${csp}
<title>Reliability grid: code ${esc(cfg.variable)} twice</title>
<style nonce="${nonce}">
  :root {${fallbackVars}
  }
  * { box-sizing: border-box; }
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 1rem 1.25rem 2rem;
    line-height: 1.5;
  }
  h1 { font-size: 1.25rem; margin: 0 0 0.25rem; }
  p.lead { color: var(--vscode-descriptionForeground); margin: 0 0 1rem; max-width: 60ch; }
  fieldset { border: 1px solid var(--vscode-panel-border); border-radius: 4px; margin: 0 0 1rem; padding: 0.75rem 1rem; }
  legend { padding: 0 0.4rem; font-weight: 600; }
  .controls { display: flex; flex-wrap: wrap; gap: 1.25rem; align-items: end; }
  .field { display: flex; flex-direction: column; gap: 0.25rem; }
  label { font-weight: 600; }
  select, input, button {
    font: inherit;
    color: var(--vscode-input-foreground);
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border);
    border-radius: 3px;
    padding: 0.3rem 0.4rem;
  }
  button {
    color: var(--vscode-button-foreground);
    background: var(--vscode-button-background);
    border-color: var(--vscode-button-background);
    cursor: pointer;
    font-weight: 600;
    padding: 0.45rem 0.9rem;
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  /* Dark themes: Dark Modern's button blue under white text is 4.53:1, below the 5:1 house
     floor; a 15% darker shade of the theme's own color clears it */
  body.vscode-dark button { background: color-mix(in srgb, var(--vscode-button-background) 85%, black); }
  body.vscode-dark button:hover { background: color-mix(in srgb, var(--vscode-button-hoverBackground) 85%, black); }
  :focus-visible { outline: 2px solid var(--vscode-focusBorder); outline-offset: 2px; }
  table { border-collapse: collapse; width: auto; margin-top: 0.5rem; }
  caption { text-align: left; font-weight: 600; margin-bottom: 0.4rem; }
  th, td { border: 1px solid var(--vscode-panel-border); padding: 0.3rem 0.5rem; text-align: left; }
  th.num { text-align: right; width: 3rem; }
  thead th { background: var(--vscode-input-background); }
  td.hidden-pass select { visibility: hidden; }
  .step { font-weight: 600; margin: 1rem 0 0.25rem; }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;
  }
  .status { margin-top: 0.75rem; min-height: 1.5rem; }
</style>
</head>
<body>
  <h1>Reliability grid: code ${esc(cfg.variable)} twice</h1>
  <p class="lead">
    Code each item once in Pass 1. When you start Pass 2, your Pass 1 codes are hidden, so the
    second pass is independent. The date of each pass is recorded. Then generate the R that reads
    your codes and computes the statistic.
  </p>

  <fieldset>
    <legend>Settings</legend>
    <div class="controls">
      <div class="field">
        <label for="method">Statistic</label>
        <select id="method">
          <option value="kappa"${cfg.method === 'kappa' ? ' selected' : ''}>Cohen's kappa</option>
          <option value="alpha"${cfg.method === 'alpha' ? ' selected' : ''}>Krippendorff's alpha</option>
        </select>
      </div>
      <div class="field">
        <label for="pass1date">Pass 1 date</label>
        <input type="date" id="pass1date">
      </div>
      <div class="field">
        <label for="pass2date">Pass 2 date</label>
        <input type="date" id="pass2date" disabled>
      </div>
    </div>
  </fieldset>

  <p class="step" id="stepLabel">Step 1 of 2: Pass 1. Code every item.</p>

  <table>
    <caption>Codes for ${esc(cfg.variable)}</caption>
    <thead>
      <tr><th scope="col" class="num">Item</th><th scope="col">Pass 1</th><th scope="col">Pass 2</th></tr>
    </thead>
    <tbody>
${rowsHtml}
    </tbody>
  </table>

  <div class="controls" style="margin-top:1rem">
    <button id="startPass2" type="button">Start Pass 2 (hide Pass 1)</button>
    <button id="generate" type="button" disabled>Save codes and generate R</button>
  </div>
  <p class="status" id="status" role="status" aria-live="polite"></p>

<script nonce="${nonce}">
  (function () {
    var vscode = (typeof acquireVsCodeApi === 'function') ? acquireVsCodeApi() : null;
    var pass = 1;
    var pass1 = Array.prototype.slice.call(document.querySelectorAll('.pass1'));
    var pass2 = Array.prototype.slice.call(document.querySelectorAll('.pass2'));
    var status = document.getElementById('status');
    var generate = document.getElementById('generate');
    var startPass2 = document.getElementById('startPass2');
    var stepLabel = document.getElementById('stepLabel');
    var pass2date = document.getElementById('pass2date');

    function today() { var d = new Date(); return d.toISOString().slice(0, 10); }
    document.getElementById('pass1date').value = today();

    startPass2.addEventListener('click', function () {
      if (pass === 1) {
        // Hide every Pass 1 code so the second pass is independent (U6).
        pass1.forEach(function (s) { s.parentElement.classList.add('hidden-pass'); s.setAttribute('aria-hidden', 'true'); s.tabIndex = -1; });
        pass2.forEach(function (s) { s.disabled = false; });
        pass2date.disabled = false; pass2date.value = today();
        pass = 2;
        stepLabel.textContent = 'Step 2 of 2: Pass 2. Pass 1 is hidden. Code every item again.';
        startPass2.disabled = true;
        generate.disabled = false;
        status.textContent = 'Pass 1 hidden. Enter Pass 2.';
      }
    });

    generate.addEventListener('click', function () {
      var rows = pass1.map(function (s, i) { return { pass_1: s.value, pass_2: pass2[i].value }; });
      var coded = rows.filter(function (r) { return r.pass_1 && r.pass_2; });
      if (coded.length === 0) { status.textContent = 'Code at least one item in both passes first.'; return; }
      status.textContent = 'Saving ' + coded.length + ' coded item(s) and generating R.';
      if (vscode) vscode.postMessage({
        type: 'generate',
        rows: rows,
        method: document.getElementById('method').value,
        pass_1_date: document.getElementById('pass1date').value,
        pass_2_date: pass2date.value
      });
    });
  })();
</script>
</body>
</html>
`;
}
