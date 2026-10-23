// Proves the coding sheet loses no saved work when its process is killed (VS Code closes or
// crashes mid-entry). Spawns kill-child.cjs, waits for its first autosave, hard-kills it with
// SIGKILL (no graceful shutdown), then reopens the codes file and checks what survived. NOT shipped.

const cp = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { CodeStore } = require('../../out/src/codesStore');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aura-kill-'));
const codesPath = path.join(dir, 'data', 'derived', 'x-codes.csv');
const child = cp.spawn('node', [path.join(__dirname, 'kill-child.cjs'), codesPath], { stdio: ['ignore', 'pipe', 'inherit'] });

let buf = '';
child.stdout.on('data', (d) => {
  buf += d.toString();
  if (buf.includes('SAVED')) {
    // The first autosave has landed. Kill hard, 60 ms later, before the MID-ENTRY cell's debounce.
    setTimeout(() => child.kill('SIGKILL'), 60);
  }
});

child.on('exit', (code, signal) => {
  const store = CodeStore.load(codesPath);
  const survived = store.rowValues('1').tone === 'positive' && store.rowValues('2').tone === 'negative' && store.rowValues('3').topic === 'gameplay';
  const midLost = store.rowValues('4').tone === undefined;
  console.log(`CHILD killed by ${signal || 'exit ' + code}`);
  console.log(`CODES FILE after kill: ${fs.existsSync(codesPath) ? 'exists' : 'MISSING'}`);
  console.log(`rows 1-3 (saved before kill) survived: ${survived ? 'PASS' : 'FAIL'}`);
  console.log(`row 4 (typed <250ms before kill, never autosaved) absent: ${midLost ? 'as expected' : 'UNEXPECTED (it saved)'}`);
  console.log(`FILE IS VALID (atomic, no half write): ${store.toRecords().length} records parse cleanly`);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(survived && midLost ? 0 : 1);
});
