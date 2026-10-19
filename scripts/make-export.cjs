// Builds the self-contained grid HTML outside the extension, for the accessibility check (axe on
// Pythia) and for measuring the browser render time of the full Twitch sample. Mirrors what the
// panel's initPayload and exportHtml do. NOT shipped.
//
//   node scripts/make-export.cjs <csv> <out.html>

const fs = require('fs');
const path = require('path');
const { loadCsvFile } = require('../out/src/dataSource');
const { standaloneHtml } = require('../out/src/gridHtml');

const csv = process.argv[2];
const out = process.argv[3] || path.join(__dirname, '..', 'twitch-grid.html');
const maxRows = process.argv[4] ? parseInt(process.argv[4], 10) : 0;
const data = loadCsvFile(csv);
if (maxRows > 0) data.rows = data.rows.slice(0, maxRows);

const codingColumns = [
  { name: 'tone', kind: 'list', values: ['positive', 'neutral', 'negative'] },
  { name: 'topic', kind: 'free' },
];
const codes = { '1': { tone: 'positive' }, '2': { topic: 'gameplay' }, '5': { tone: 'negative', topic: 'chat, banter' } };

const init = {
  title: `${data.name} (${data.rows.length.toLocaleString()} rows)`,
  columns: data.columns,
  rows: data.rows,
  rowIdField: data.rowIdField,
  codingColumns,
  codes,
};

const media = path.join(__dirname, '..', 'media', 'grid');
const read = (p) => fs.readFileSync(path.join(media, p), 'utf8');
const html = standaloneHtml({
  agGridJs: read('ag-grid-community.min.js'),
  agGridCss: read('ag-grid.min.css'),
  themeCss: read('ag-theme-quartz.min.css'),
  gridCss: read('grid.css'),
  gridJs: read('grid.js'),
  init,
  title: init.title,
});
fs.writeFileSync(out, html);
console.log(`wrote ${out} (${(html.length / 1024 / 1024).toFixed(1)} MB, ${data.rows.length} rows)`);
