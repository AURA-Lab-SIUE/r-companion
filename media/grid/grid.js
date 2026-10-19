// AG Grid Community client for the AURA Lab data viewer and coding sheet.
//
// Two ways to boot:
//   - In the VS Code webview: acquire the API, tell the host we are ready, build on the 'init'
//     message, and post every coding change back so the host saves it.
//   - In the exported self-contained HTML: window.__AURA_INIT__ is set, so build at once. The
//     buttons do nothing there; the file exists only for the accessibility check.
//
// Data columns are read only. Coding columns are on the right and editable: a dropdown for a
// column with allowed values, a text box otherwise. Enter commits and moves down. AG Grid keeps
// undo/redo, and every value change (including an undo) is sent to the host, so the codes file
// always matches the grid.

(function () {
  'use strict';

  var vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
  var api = null;
  var state = null; // the last init payload
  var statusEl = document.getElementById('aura-status');

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function post(msg) {
    if (vscode) vscode.postMessage(msg);
  }

  // A numeric sort for number columns; blanks sort last. Text columns use the default.
  function numericComparator(a, b) {
    var na = a === '' || a == null ? null : Number(a);
    var nb = b === '' || b == null ? null : Number(b);
    if (na === null && nb === null) return 0;
    if (na === null) return 1;
    if (nb === null) return -1;
    return na - nb;
  }

  function dataColumnDef(col) {
    var def = {
      field: col.field,
      headerName: col.field,
      editable: false,
      filter: 'agTextColumnFilter',
      sortable: true,
      resizable: true,
      minWidth: 90,
    };
    if (col.type === 'number' || col.type === 'integer') {
      def.comparator = numericComparator;
      def.type = 'rightAligned';
      def.headerTooltip = col.field + ' (number)';
    } else {
      def.headerTooltip = col.field + ' (' + col.type + ')';
    }
    return def;
  }

  function codingColumnDef(coding) {
    var def = {
      field: coding.name,
      headerName: coding.name,
      editable: true,
      sortable: true,
      resizable: true,
      filter: 'agTextColumnFilter',
      minWidth: 120,
      headerClass: 'aura-coding-header',
      cellClass: 'aura-coding-cell',
      singleClickEdit: false,
    };
    if (coding.kind === 'list' && coding.values && coding.values.length) {
      def.cellEditor = 'agSelectCellEditor';
      // A blank choice lets a student clear a cell with the keyboard
      def.cellEditorParams = { values: [''].concat(coding.values) };
      def.headerTooltip = coding.name + ' (choose one of: ' + coding.values.join(', ') + ')';
    } else {
      def.cellEditor = 'agTextCellEditor';
      def.headerTooltip = coding.name + ' (free text)';
    }
    return def;
  }

  function buildColumnDefs(init) {
    var defs = init.columns.map(dataColumnDef);
    (init.codingColumns || []).forEach(function (c) {
      defs.push(codingColumnDef(c));
    });
    return defs;
  }

  function buildRowData(init) {
    var codes = init.codes || {};
    return init.rows.map(function (row) {
      var id = row[init.rowIdField];
      var coded = codes[id];
      if (coded) {
        var merged = Object.assign({}, row);
        Object.keys(coded).forEach(function (k) {
          merged[k] = coded[k];
        });
        return merged;
      }
      return row;
    });
  }

  function labelGrid(init) {
    var el = document.querySelector('#grid [role="grid"]');
    if (el) el.setAttribute('aria-label', init.title || 'Data');
  }

  function build(init) {
    state = init;
    var t0 = (performance && performance.now) ? performance.now() : Date.now();
    var gridDiv = document.getElementById('grid');
    var options = {
      theme: 'legacy',
      columnDefs: buildColumnDefs(init),
      rowData: buildRowData(init),
      defaultColDef: { sortable: true, filter: true, resizable: true },
      getRowId: function (p) { return String(p.data[init.rowIdField]); },
      enableCellTextSelection: true,
      ensureDomOrder: true,
      undoRedoCellEditing: true,
      undoRedoCellEditingLimit: 50,
      stopEditingWhenCellsLoseFocus: true,
      enterNavigatesVertically: true,
      enterNavigatesVerticallyAfterEdit: true,
      singleClickEdit: false,
      suppressDragLeaveHidesColumns: true,
      rowSelection: { mode: 'singleRow', checkboxes: false, enableClickSelection: false },
      onFirstDataRendered: function () {
        var t1 = (performance && performance.now) ? performance.now() : Date.now();
        var ms = Math.round(t1 - t0);
        var n = init.rows.length;
        setStatus(n.toLocaleString() + ' rows. Rendered in ' + ms + ' ms. Data is read only; code in the columns on the right.');
        labelGrid(init);
        var out = document.getElementById('aura-loadtime');
        if (out) out.textContent = String(ms);
        post({ type: 'rendered', rows: n, renderMs: ms });
      },
      onCellValueChanged: function (e) {
        var field = e.colDef.field;
        var isCoding = (init.codingColumns || []).some(function (c) { return c.name === field; });
        if (!isCoding) return;
        var value = e.newValue == null ? '' : String(e.newValue);
        setStatus('Saving ' + field + '...');
        post({ type: 'codeChange', rowId: String(e.data[init.rowIdField]), column: field, value: value });
      },
    };
    api = agGrid.createGrid(gridDiv, options);
    window.__auraApi = api; // a test hook; the extension never relies on it
  }

  function wireButtons() {
    var map = { 'btn-refresh': 'refresh', 'btn-add': 'addColumn', 'btn-rebuild': 'insertRebuild', 'btn-export': 'exportHtml' };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function () { post({ type: map[id] }); });
    });
  }

  // Add one coding column live (host validated it), then move focus to its first cell.
  function addCodingColumn(coding) {
    if (!state) return;
    state.codingColumns = (state.codingColumns || []).concat([coding]);
    api.setGridOption('columnDefs', buildColumnDefs(state));
    setStatus('Added the coding column "' + coding.name + '". Click its first cell and start typing.');
    api.ensureColumnVisible(coding.name);
    api.setFocusedCell(0, coding.name);
  }

  window.addEventListener('message', function (ev) {
    var msg = ev.data || {};
    if (msg.type === 'init') build(msg.init);
    else if (msg.type === 'columnAdded') addCodingColumn(msg.column);
    else if (msg.type === 'saved') setStatus('Saved ' + (msg.at || '') + '. ' + (msg.count || 0) + ' coded cell(s).');
    else if (msg.type === 'status') setStatus(msg.text);
  });

  if (window.__AURA_INIT__) {
    // Export mode: no host, build straight from the embedded data.
    build(window.__AURA_INIT__);
  } else {
    wireButtons();
    post({ type: 'ready' });
  }
})();
