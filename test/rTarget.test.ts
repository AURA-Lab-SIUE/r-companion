// Which terminal an R run key uses (src/rTarget.ts). Never a shell; prefer the R that Run it uses.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { activateR, ActivateDeps, alreadyShown, EditorSnapshot, InFlight, pickRTarget, RClosedError, RNotActiveError, RNotFoundError, runKey, RunKeyDeps, sameEditor, waitForR } from '../src/rTarget';

test('no terminal at all: open R (AURA)', () => {
  assert.deepEqual(pickRTarget([], -1), { kind: 'open' });
});

test('only a PowerShell terminal, and it is active: open R (AURA), never the shell', () => {
  assert.deepEqual(pickRTarget(['powershell'], 0), { kind: 'open' });
});

test('R (AURA) open but a shell is active: switch to R (AURA)', () => {
  assert.deepEqual(pickRTarget(['R (AURA)', 'pwsh', 'bash'], 2), { kind: 'existing', index: 0 });
});

test('the active terminal is already an R terminal: keep it', () => {
  assert.deepEqual(pickRTarget(['R (AURA)', 'R Interactive'], 0), { kind: 'existing', index: 0 });
  assert.deepEqual(pickRTarget(['R (AURA)', 'R Interactive'], 1), { kind: 'existing', index: 1 });
});

test("a shell is active and both kinds of R are open: vscode-R's, where Run it sends blocks", () => {
  assert.deepEqual(pickRTarget(['R (AURA)', 'R Interactive', 'cmd'], 2), { kind: 'existing', index: 1 });
  assert.deepEqual(pickRTarget(['R', 'R Interactive', 'pwsh'], 2), { kind: 'existing', index: 1 });
});

test('a terminal merely containing R in its name is not R', () => {
  assert.deepEqual(pickRTarget(['Run Task', 'Rscript build'], 0), { kind: 'open' });
});

// ---- Copilot review of #5: shared start, abort unless R is active, editor unchanged ----

type T = { name: string; live: boolean };

function deps(over: Partial<ActivateDeps<T>> & { terms: T[]; activeT?: T }): ActivateDeps<T> & { log: string[] } {
  const log: string[] = [];
  let active = over.activeT;
  const d: ActivateDeps<T> & { log: string[] } = {
    log,
    live: () => over.terms.filter((t) => t.live),
    active: () => active,
    name: (t: T) => t.name,
    isStarting: () => false,
    start: async () => {
      const t = { name: 'R (AURA)', live: true };
      over.terms.push(t);
      log.push('start');
      return t;
    },
    show: (t: T) => {
      log.push(`show ${t.name}`);
      active = t;
    },
    waitActive: async (t: T) => active === t,
    isLive: (t: T) => t.live,
  };
  const { terms: _t, activeT: _a, ...rest } = over;
  return Object.assign(d, rest);
}

test('InFlight: a second call while the first is starting shares it and starts nothing new', async () => {
  const gate = new InFlight<number>();
  let starts = 0;
  let release!: () => void;
  const f = () => {
    starts++;
    return new Promise<number>((r) => {
      release = () => r(7);
    });
  };
  const a = gate.run(f);
  const b = gate.run(f);
  assert.equal(gate.running, true);
  release();
  assert.deepEqual(await Promise.all([a, b]), [7, 7]);
  assert.equal(starts, 1);
  assert.equal(gate.running, false);
});

test('activateR: R (AURA) still starting from another key press: wait for that start before showing it', async () => {
  const aura = { name: 'R (AURA)', live: true };
  const d = deps({ terms: [aura], isStarting: (t) => t === aura });
  d.start = async () => {
    d.log.push('joined');
    return aura;
  };
  const t = await activateR(d);
  assert.equal(t, aura);
  assert.deepEqual(d.log, ['joined', 'show R (AURA)']);
});

test('activateR: R is not the active terminal after the wait: throw, so nothing is run', async () => {
  const shell = { name: 'powershell', live: true };
  const d = deps({ terms: [shell], activeT: shell, waitActive: async () => false });
  await assert.rejects(activateR(d), RNotActiveError);
});

test('activateR: the student switched to a shell during the wait: throw even if the wait said yes', async () => {
  const shell = { name: 'powershell', live: true };
  const aura = { name: 'R (AURA)', live: true };
  let active: T = shell;
  const d = deps({
    terms: [aura, shell],
    active: () => active,
    show: () => {
      active = aura;
    },
    waitActive: async () => {
      active = shell;
      return true;
    },
  });
  await assert.rejects(activateR(d), RNotActiveError);
});

test('activateR: R exited during the wait: throw', async () => {
  const aura = { name: 'R (AURA)', live: true };
  const d = deps({
    terms: [aura],
    activeT: aura,
    waitActive: async (t) => {
      t.live = false;
      return true;
    },
  });
  await assert.rejects(activateR(d), RNotActiveError);
});

test('activateR: no R terminal and R not found: undefined, nothing shown', async () => {
  const d = deps({ terms: [], start: async () => undefined });
  assert.equal(await activateR(d), undefined);
  assert.deepEqual(d.log, []);
});

test('activateR: a shell is active and no R is open: start R (AURA), show it, return it', async () => {
  const shell = { name: 'powershell', live: true };
  const d = deps({ terms: [shell], activeT: shell });
  const t = await activateR(d);
  assert.equal(t?.name, 'R (AURA)');
  assert.deepEqual(d.log, ['start', 'show R (AURA)']);
});

test('sameEditor: the same document, version, and selections only', () => {
  const a = { uri: 'file:///w/s.R', version: 3, selections: [[1, 0, 1, 0]] };
  assert.equal(sameEditor(a, { ...a, selections: [[1, 0, 1, 0]] }), true);
  assert.equal(sameEditor(a, { ...a, uri: 'file:///w/t.R' }), false);
  assert.equal(sameEditor(a, { ...a, version: 4 }), false);
  assert.equal(sameEditor(a, { ...a, selections: [[2, 0, 2, 0]] }), false);
  assert.equal(sameEditor(a, { ...a, selections: [[1, 0, 1, 0], [3, 0, 3, 4]] }), false);
  assert.equal(sameEditor(a, undefined), false);
  assert.equal(sameEditor(undefined, undefined), true);
});

// ---- Copilot review of #6: a start that outlives its terminal, and the trust wait ----

function fakeTerminal(noProcess = false) {
  const closers: Array<() => void> = [];
  const t = {
    closed: false,
    processId: Promise.resolve(noProcess ? undefined : 1),
    exited: () => t.closed,
    onClose: (cb: () => void) => {
      closers.push(cb);
      return { dispose: () => closers.splice(closers.indexOf(cb), 1) };
    },
    close: () => {
      t.closed = true;
      for (const cb of [...closers]) cb();
    },
  };
  return t;
}

/** A delay the test releases by hand. */
function manualDelay() {
  let release!: () => void;
  const delay = () =>
    new Promise<void>((r) => {
      release = r;
    });
  return { delay, release: () => release() };
}

test('waitForR: resolves once R has its process and the banner wait has passed', async () => {
  const t = fakeTerminal();
  const d = manualDelay();
  const p = waitForR(t, 4000, d.delay);
  await new Promise((r) => setImmediate(r));
  d.release();
  await p;
});

test('waitForR: R closes during the banner wait: rejects with RClosedError at once', async () => {
  const t = fakeTerminal();
  const d = manualDelay();
  const p = waitForR(t, 4000, d.delay);
  await new Promise((r) => setImmediate(r));
  t.close();
  await assert.rejects(p, RClosedError);
});

test('waitForR: R never got a process, or had already closed: rejects', async () => {
  await assert.rejects(waitForR(fakeTerminal(true), 10, async () => {}), RClosedError);
  const gone = fakeTerminal();
  gone.close();
  await assert.rejects(waitForR(gone, 10, async () => {}), RClosedError);
});

test('a second Run it that joins a start whose R then closes is refused too, not sent to the closed terminal', async () => {
  const gate = new InFlight<string>();
  const t = fakeTerminal();
  const d = manualDelay();
  const start = () => waitForR(t, 4000, d.delay).then(() => 'R (AURA)');
  const first = gate.run(start);
  const second = gate.run(start);
  await new Promise((r) => setImmediate(r));
  t.close();
  await assert.rejects(first, RClosedError);
  await assert.rejects(second, RClosedError);
  assert.equal(gate.running, false);
});

test('RClosedError is an RNotActiveError, so every caller that stops on one stops on both', () => {
  assert.ok(new RClosedError() instanceof RNotActiveError);
  assert.match(new RClosedError().message, /closed/);
});

function keyDeps(snaps: Array<EditorSnapshot | undefined>, trusted: boolean) {
  const log: string[] = [];
  let rerun: (() => unknown) | undefined;
  let i = 0;
  const d: RunKeyDeps = {
    snapshot: () => snaps[Math.min(i++, snaps.length - 1)],
    requireTrust: async (r) => {
      if (trusted) return true;
      rerun = r;
      return false;
    },
    activate: async () => {
      log.push('activate');
      return 'R';
    },
    execute: async () => {
      log.push('execute');
    },
    warn: (m) => log.push(`warn ${m}`),
  };
  return { d, log, rerun: () => rerun?.(), trust: () => (trusted = true) };
}

const S1 = { uri: 'file:///w/s.R', version: 1, selections: [[0, 0, 0, 0]] };
const S2 = { uri: 'file:///w/s.R', version: 1, selections: [[5, 0, 5, 0]] };

test('runKey: trusted and the editor unchanged: activate R, then run', async () => {
  const k = keyDeps([S1, S1], true);
  assert.equal(await runKey(k.d), 'ran');
  assert.deepEqual(k.log, ['activate', 'execute']);
});

test('runKey: the selection changed during the trust wait: the resumed run stops with a message', async () => {
  // snapshot at the key press = S1; the student moves the cursor while the trust question is open
  const k = keyDeps([S1, S2], false);
  assert.equal(await runKey(k.d), 'waiting-for-trust');
  assert.equal(k.log.length, 0);
  k.trust();
  assert.equal(await k.rerun(), 'changed');
  assert.ok(!k.log.includes('execute'));
  assert.ok(k.log.some((l) => l.startsWith('warn ')));
});

test('runKey: unchanged through the trust wait: the resumed run runs once', async () => {
  const k = keyDeps([S1, S1], false);
  await runKey(k.d);
  k.trust();
  assert.equal(await k.rerun(), 'ran');
  assert.deepEqual(k.log, ['activate', 'execute']);
});

test('runKey: R closed while starting: stop with its message, run nothing', async () => {
  const k = keyDeps([S1, S1], true);
  k.d.activate = async () => {
    throw new RClosedError();
  };
  assert.equal(await runKey(k.d), 'not-active');
  assert.deepEqual(k.log, [`warn ${new RClosedError().message}`]);
});

test('runKey: R not found: run nothing', async () => {
  const k = keyDeps([S1, S1], true);
  k.d.activate = async () => undefined;
  assert.equal(await runKey(k.d), 'no-r');
  assert.ok(!k.log.includes('execute'));
});

// ---- One message per stopped run (testbench 2026-10-31, 728000e) ----

test('alreadyShown: the errors the Companion has already explained in its own message', () => {
  assert.equal(alreadyShown(new RNotActiveError()), true);
  assert.equal(alreadyShown(new RClosedError()), true);
  assert.equal(alreadyShown(new RNotFoundError()), true);
  assert.equal(alreadyShown(new Error('something else')), false);
  assert.equal(alreadyShown('a string'), false);
});
