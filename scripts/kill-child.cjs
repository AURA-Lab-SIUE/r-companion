// A stand-in for the viewer's coding session, using the exact autosave mechanism the panel uses:
// a 250 ms debounced atomic CodeStore.save. The parent (kill-test.cjs) hard-kills this process to
// prove saved coding survives a crash. NOT shipped.
//
//   node scripts/kill-child.cjs <codes-path>

const { CodeStore } = require('../out/src/codesStore');
const codesPath = process.argv[2];
const store = new CodeStore(codesPath);

let timer;
function scheduleSave() {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    store.save();
    process.stdout.write('SAVED\n');
  }, 250);
}

// Type three cells quickly (each resets the debounce), so one save covers all three.
store.set('1', 'tone', 'positive', '2026-10-19T00:00:00Z');
scheduleSave();
setTimeout(() => { store.set('2', 'tone', 'negative', '2026-10-19T00:00:01Z'); scheduleSave(); }, 40);
setTimeout(() => { store.set('3', 'topic', 'gameplay', '2026-10-19T00:00:02Z'); scheduleSave(); }, 80);

// After the first save lands, start one more cell but do NOT let its debounce finish before the
// kill: this is the only change the guarantee does not cover (a change younger than one tick).
setTimeout(() => { store.set('4', 'tone', 'MID-ENTRY', '2026-10-19T00:00:03Z'); scheduleSave(); }, 360);

// Stay alive so the parent must kill us.
setInterval(() => {}, 1000);
