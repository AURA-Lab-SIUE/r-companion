// AG Grid Community client for the AURA Lab data viewer and coding sheet.
//
// Two ways to boot:
//   - In the VS Code webview: acquire the API, tell the host we are ready, build on the 'init'
//     message, and post every coding change back so the host saves it.
//   - In the exported self-contained HTML: window.__AURA_INIT__ is set, so build at once. The
//     buttons do nothing there; the file exists only for the accessibility check.
//
// Data columns are read only. Coding columns are on the right and editable, with spreadsheet keys:
// in a column with allowed values, typing picks the first code that starts with the typed letters
// (CodeListEditor); in a free-text column, typing starts the edit. Enter commits and moves down,
// Tab commits and moves right, Escape cancels, F2 or a double-click opens the whole list, and
// Delete clears the cell. AG Grid keeps
// undo/redo, and every value change (including an undo) is sent to the host, so the codes file
// always matches the grid.

(function () {
  'use strict';

  var vscode = typeof acquireVsCodeApi === 'function' ? acquireVsCodeApi() : null;
  var api = null;
  var state = null; // the last init payload
  var lastChange = ''; // the last coded cell, in words, for the status line
  var statusEl = document.getElementById('aura-status');

  function setStatus(text) {
    if (statusEl) statusEl.textContent = text;
  }

  function post(msg) {
    if (vscode) vscode.postMessage(msg);
  }

  // Sorting puts blank cells last in both directions, as R's arrange() puts NA last, so "Write
  // this view as R" sorts the same way (code parity, 2026-10-28). AG Grid flips a comparator's
  // answer for a descending sort, so a blank's answer is flipped back here.
  function isBlankCell(v) {
    return v == null || String(v).trim() === '';
  }
  function blanksLast(a, b, isDescending) {
    var ba = isBlankCell(a);
    var bb = isBlankCell(b);
    if (ba && bb) return 0;
    if (ba) return isDescending ? -1 : 1;
    if (bb) return isDescending ? 1 : -1;
    return null;
  }
  // Numbers sort as numbers
  function numericComparator(a, b, nodeA, nodeB, isDescending) {
    var blank = blanksLast(a, b, isDescending);
    if (blank !== null) return blank;
    return Number(a) - Number(b);
  }
  // Text sorts letter by letter (character codes), as arrange() does in its "C" locale
  function textComparator(a, b, nodeA, nodeB, isDescending) {
    var blank = blanksLast(a, b, isDescending);
    if (blank !== null) return blank;
    var sa = String(a);
    var sb = String(b);
    return sa < sb ? -1 : sa > sb ? 1 : 0;
  }
  // A number column filters as numbers, so "more than 20" means 20 and not the text "20"
  function numberFilterValue(p) {
    var v = p.data ? p.data[p.colDef.field] : null;
    return isBlankCell(v) ? null : Number(v);
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
      def.filter = 'agNumberColumnFilter';
      def.filterValueGetter = numberFilterValue;
      def.type = 'rightAligned';
      def.headerTooltip = col.field + ' (number)';
    } else {
      def.comparator = textComparator;
      def.headerTooltip = col.field + ' (' + col.type + ')';
    }
    return def;
  }

  // ---------- The code list editor (a typeahead combobox) ----------
  //
  // A coding column with allowed values edits like a spreadsheet cell with a validation list:
  // typing a letter on the cell opens this editor already filtered to the codes that start with
  // the typed letters (case-insensitive), the first match chosen. Backspace takes letters back off;
  // with none left the choice is a blank, which clears the cell. Up and Down move the choice. The
  // grid commits on Enter (then moves down) and cancels on Escape; Tab is handled in
  // codingKeyboard below. F2 or a double-click opens it with no letters: the whole list, on the
  // cell's current code. It is a popup so the list can hang below the cell.
  //
  // For screen readers the input is an ARIA combobox whose aria-activedescendant follows the
  // chosen option, and a polite live region inside the popup says the choice in words.

  var editorSeq = 0;

  function CodeListEditor() {}

  CodeListEditor.prototype.init = function (params) {
    var self = this;
    this.params = params;
    this.codes = params.codes || [];
    this.original = params.value == null ? '' : String(params.value);
    this.columnName = params.colDef.headerName || params.colDef.field;
    var key = params.eventKey;
    var typedKey = typeof key === 'string' && key.length === 1 ? key : '';
    // Opened by F2, Enter, or a double-click: the whole list, on the current code
    this.browse = !typedKey && key !== 'Backspace' && key !== 'Delete';
    this.options = [];
    this.active = -1;
    this.noMatch = false;

    var id = 'aura-code-' + (++editorSeq);
    this.gui = document.createElement('div');
    this.gui.className = 'aura-code-editor';
    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.className = 'aura-code-input';
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-autocomplete', 'list');
    this.input.setAttribute('aria-expanded', 'true');
    this.input.setAttribute('aria-controls', id + '-list');
    this.input.setAttribute('autocomplete', 'off');
    this.input.setAttribute('spellcheck', 'false');
    this.input.setAttribute('aria-label', this.columnName + ', row ' + (params.rowIndex + 1) +
      ': type the first letters of a code');
    this.input.value = typedKey;
    this.list = document.createElement('ul');
    this.list.id = id + '-list';
    this.list.className = 'aura-code-list';
    this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', this.columnName + ' codes');
    this.live = document.createElement('div');
    this.live.className = 'aura-sr-only';
    this.live.setAttribute('aria-live', 'polite');
    this.idBase = id;
    this.gui.appendChild(this.input);
    this.gui.appendChild(this.list);
    this.gui.appendChild(this.live);

    this.input.addEventListener('input', function () {
      self.browse = false;
      self.refresh();
    });
    this.input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        self.move(e.key === 'ArrowDown' ? 1 : -1);
      }
    });
    // A click on an option chooses it and commits; mousedown keeps focus in the input
    this.list.addEventListener('mousedown', function (e) {
      e.preventDefault();
      var li = e.target.closest ? e.target.closest('[role="option"]') : null;
      if (!li || li.getAttribute('aria-disabled') === 'true') return;
      self.active = Number(li.getAttribute('data-index'));
      params.stopEditing();
    });
    this.refresh();
  };

  // Rebuild the option list from the typed letters
  CodeListEditor.prototype.refresh = function () {
    var typed = this.input.value.trim().toLowerCase();
    var blank = { value: '', label: '(blank: clear the cell)' };
    if (this.browse) {
      this.options = [blank].concat(this.codes.map(function (c) { return { value: c, label: c }; }));
      var at = this.codes.indexOf(this.original);
      this.active = at >= 0 ? at + 1 : 0;
      this.noMatch = false;
    } else if (!typed) {
      this.options = [blank].concat(this.codes.map(function (c) { return { value: c, label: c }; }));
      this.active = 0;
      this.noMatch = false;
    } else {
      this.options = this.codes
        .filter(function (c) { return c.toLowerCase().indexOf(typed) === 0; })
        .map(function (c) { return { value: c, label: c }; });
      this.active = this.options.length ? 0 : -1;
      this.noMatch = !this.options.length;
    }
    this.render();
  };

  CodeListEditor.prototype.move = function (step) {
    if (!this.options.length) return;
    this.active = Math.max(0, Math.min(this.options.length - 1, this.active + step));
    this.render();
  };

  CodeListEditor.prototype.render = function () {
    var self = this;
    this.list.textContent = '';
    if (this.noMatch) {
      var none = document.createElement('li');
      none.setAttribute('role', 'option');
      none.setAttribute('aria-disabled', 'true');
      none.className = 'aura-code-none';
      none.id = this.idBase + '-none';
      none.textContent = 'No code starts with "' + this.input.value.trim() + '"';
      this.list.appendChild(none);
      this.input.removeAttribute('aria-activedescendant');
      this.say(none.textContent + '. Press Backspace to change the letters, or Escape to keep the cell as it was.');
      return;
    }
    this.options.forEach(function (o, i) {
      var li = document.createElement('li');
      li.setAttribute('role', 'option');
      li.id = self.idBase + '-opt-' + i;
      li.setAttribute('data-index', String(i));
      li.setAttribute('aria-selected', i === self.active ? 'true' : 'false');
      li.className = 'aura-code-option' + (i === self.active ? ' aura-code-active' : '') + (o.value === '' ? ' aura-code-blank' : '');
      li.textContent = o.label;
      self.list.appendChild(li);
    });
    var act = this.list.children[this.active];
    if (act) {
      this.input.setAttribute('aria-activedescendant', act.id);
      if (act.scrollIntoView) act.scrollIntoView({ block: 'nearest' });
      var o = this.options[this.active];
      this.say((o.value === '' ? 'blank' : o.value) + ', ' + (this.active + 1) + ' of ' + this.options.length +
        '. Enter saves it.');
    }
  };

  CodeListEditor.prototype.say = function (text) {
    this.live.textContent = text;
  };

  CodeListEditor.prototype.getGui = function () { return this.gui; };
  CodeListEditor.prototype.isPopup = function () { return true; };
  CodeListEditor.prototype.getPopupPosition = function () { return 'over'; };

  CodeListEditor.prototype.afterGuiAttached = function () {
    var w = this.params.eGridCell ? this.params.eGridCell.offsetWidth : 0;
    if (w) this.gui.style.minWidth = w + 'px';
    this.input.focus();
    var n = this.input.value.length;
    this.input.setSelectionRange(n, n);
  };

  CodeListEditor.prototype.focusIn = function () { this.input.focus(); };

  CodeListEditor.prototype.getValue = function () {
    var o = this.options[this.active];
    return o ? o.value : this.original;
  };

  // Typed letters that match no code leave the cell as it was
  CodeListEditor.prototype.isCancelAfterEnd = function () {
    return this.noMatch || this.getValue() === this.original;
  };

  // ---------- Keys the grid handles differently in coding columns ----------
  //
  // Tab commits the edit and moves one cell right, as in a spreadsheet; AG Grid's own Tab would
  // open the editor of the next editable cell instead. Delete clears a coding cell that is not
  // being edited. Everything else (typing, Enter, F2, Escape, arrows) is the grid's own.
  function codingKeyboard(p) {
    var e = p.event;
    if (e.type !== 'keydown') return false;
    if (p.editing && (e.key === 'Enter' || e.key === 'Tab')) {
      // Letters that match no code: stay in the editor rather than move on with nothing saved
      var eds = p.api.getCellEditorInstances({ rowNodes: [p.node], columns: [p.column] });
      var ed = eds && eds[0];
      if (ed && ed.noMatch) {
        e.preventDefault();
        var why = 'No code starts with "' + ed.input.value.trim() + '". Press Backspace to change the letters, or Escape to keep the cell as it was.';
        // Emptied first and refilled a moment later, so a screen reader hears a repeat too
        ed.say('');
        setTimeout(function () { ed.say(why); }, 60);
        return true;
      }
    }
    if (p.editing && e.key === 'Tab') {
      e.preventDefault();
      p.api.stopEditing();
      if (e.shiftKey) p.api.tabToPreviousCell(); else p.api.tabToNextCell();
      return true;
    }
    if (!p.editing && e.key === 'Delete' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      clearCell(p.api, p.node, p.column);
      return true;
    }
    return false;
  }

  // Clear through the editor so the change lands on the undo stack like any edit: an editor
  // opened by Backspace starts empty (a blank choice in a code list)
  function clearCell(api, node, column) {
    var field = column.getColDef().field;
    if (node.data[field] == null || node.data[field] === '') return;
    api.startEditingCell({ rowIndex: node.rowIndex, colKey: column, key: 'Backspace' });
    api.stopEditing();
    api.setFocusedCell(node.rowIndex, column);
  }

  function codingColumnDef(coding) {
    var def = {
      field: coding.name,
      headerName: coding.name,
      editable: true,
      sortable: true,
      resizable: true,
      filter: 'agTextColumnFilter',
      comparator: textComparator,
      minWidth: 120,
      headerClass: 'aura-coding-header',
      cellClass: 'aura-coding-cell',
      singleClickEdit: false,
      suppressKeyboardEvent: codingKeyboard,
    };
    if (coding.kind === 'list' && coding.values && coding.values.length) {
      def.cellEditor = CodeListEditor;
      def.cellEditorParams = { codes: coding.values.slice() };
      def.headerTooltip = coding.name + ' (type the first letters of: ' + coding.values.join(', ') + ')';
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
        // The status line is a polite live region: it names the code just entered, so a screen
        // reader hears it after Enter moves the focus down
        lastChange = field + ', row ' + (e.rowIndex + 1) + ': ' + (value === '' ? 'blank' : value) + '.';
        setStatus(lastChange + ' Saving...');
        post({ type: 'codeChange', rowId: String(e.data[init.rowIdField]), column: field, value: value });
      },
    };
    api = agGrid.createGrid(gridDiv, options);
    window.__auraApi = api; // a test hook; the extension never relies on it
  }

  function wireButtons() {
    var map = { 'btn-refresh': 'refresh', 'btn-add': 'addColumn', 'btn-rebuild': 'insertRebuild' };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('click', function () { post({ type: map[id] }); });
    });
    var hide = document.getElementById('btn-hide-p1');
    if (hide) hide.addEventListener('click', togglePass1);
    var view = document.getElementById('btn-view-code');
    if (view) view.addEventListener('click', postView);
  }

  // Write this view as R: the filters and sorts go to the host, which writes them as dplyr
  function postView() {
    if (!api) return;
    var sort = api.getColumnState()
      .filter(function (c) { return c.sort; })
      .sort(function (a, b) { return (a.sortIndex || 0) - (b.sortIndex || 0); })
      .map(function (c) { return { colId: c.colId, sort: c.sort }; });
    post({ type: 'viewCode', filterModel: api.getFilterModel() || {}, sort: sort, shown: api.getDisplayedRowCount() });
  }

  // Hide pass 1 (owner decision U6): the _p1 coding columns leave the screen while pass 2 is coded,
  // so the second pass is independent. Only the view changes; no code is touched.
  var pass1Hidden = false;
  function togglePass1() {
    if (!api || !state) return;
    var p1 = (state.codingColumns || []).map(function (c) { return c.name; }).filter(function (n) { return /_p1$/.test(n); });
    if (!p1.length) {
      setStatus('No pass 1 columns yet. Add a coding column and choose Code it twice.');
      return;
    }
    pass1Hidden = !pass1Hidden;
    api.setColumnsVisible(p1, !pass1Hidden);
    var btn = document.getElementById('btn-hide-p1');
    btn.textContent = pass1Hidden ? 'Show pass 1' : 'Hide pass 1';
    btn.setAttribute('aria-pressed', pass1Hidden ? 'true' : 'false');
    setStatus(pass1Hidden ? 'Pass 1 is hidden: ' + p1.join(', ') + '. Code pass 2 now.' : 'Pass 1 is showing again.');
  }

  // Add one coding column live (host validated it), then move focus to its first cell.
  function addCodingColumn(coding) {
    if (!state) return;
    state.codingColumns = (state.codingColumns || []).concat([coding]);
    api.setGridOption('columnDefs', buildColumnDefs(state));
    setStatus('Added the coding column "' + coding.name + '". Its first cell is selected: ' +
      (coding.kind === 'list' ? 'type the first letters of a code, then press Enter.' : 'type, then press Enter.'));
    api.ensureColumnVisible(coding.name);
    api.setFocusedCell(0, coding.name);
  }

  window.addEventListener('message', function (ev) {
    var msg = ev.data || {};
    if (msg.type === 'init') build(msg.init);
    else if (msg.type === 'columnAdded') addCodingColumn(msg.column);
    else if (msg.type === 'saved') setStatus((lastChange ? lastChange + ' ' : '') + 'Saved ' + (msg.at || '') + '. ' + (msg.count || 0) + ' coded cell(s).');
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
