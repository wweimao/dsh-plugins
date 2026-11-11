import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { EventEmitter, getEventListeners, once } from 'node:events';
import { realpath } from 'node:fs/promises';
import { PassThrough } from 'node:stream';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { createRunner, describeFailure } from '../runner.js';

const node = process.execPath;
const js = (source) => ['-e', source];
const failure = (kind, code = null) => ({ ok: false, stdout: '', kind, code });
const success = (stdout = '') => ({ ok: true, stdout, code: 0 });
const runnerFor = (t, options = {}) => {
  const runner = createRunner({ candidates: [node], ...options });
  t.after(() => runner.dispose());
  return runner;
};
const fakeChild = () => Object.assign(new EventEmitter(), {
  stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(),
  kill: () => true,
});

test('construction is lazy, candidates are deduplicated and probed sequentially', async (t) => {
  const calls = [];
  const runner = runnerFor(t, {
    candidates: ['missing-test-binary', 'missing-test-binary', node, node],
    spawn(file, args, options) {
      calls.push({ file, args, options });
      assert.equal(options.shell, false);
      assert.equal(calls.filter((call) => call.file === node && call.args[0] === '--version').length <= 1, true);
      if (file === 'missing-test-binary') {
        const child = fakeChild();
        queueMicrotask(() => child.emit('error', Object.assign(new Error('private path'), { code: 'ENOENT' })));
        return child;
      }
      return spawn(file, args, options);
    },
  });
  assert.equal(calls.length, 0);
  assert.deepEqual(await runner.run(js('process.stdout.write("ready")')), success('ready'));
  assert.deepEqual(calls.map(({ file }) => file), ['missing-test-binary', node, node]);
  assert.deepEqual(await runner.run(js('process.stdout.write("cached")')), success('cached'));
  assert.equal(calls.length, 4);
});

test('real children preserve cwd, stdin, UTF-8, and event-loop responsiveness', async (t) => {
  const runner = runnerFor(t);
  let completed = false;
  const work = runner.run(js(`
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => input += chunk);
    process.stdin.on('end', () => setTimeout(() => {
      process.stdout.write(JSON.stringify({ cwd: process.cwd(), input }));
    }, 80));
  `), { cwd: tmpdir(), input: 'private input / 你好' });
  work.then(() => { completed = true; });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(completed, false, 'the command must not block the event loop');
  const result = await work;
  assert.equal(result.ok, true);
  assert.deepEqual(JSON.parse(result.stdout), { cwd: await realpath(tmpdir()), input: 'private input / 你好' });
});

test('exit failures discard partial stdout, stderr, and unsafe diagnostics', async (t) => {
  const runner = runnerFor(t);
  const result = await runner.run(js('process.stdout.write("private partial"); process.stderr.write("private stderr"); process.exitCode = 7'));
  assert.deepEqual(result, failure('exit', 7));
  assert.equal(JSON.stringify(result).includes('private'), false);
  assert.equal(describeFailure(result).includes('private'), false);
  assert.match(describeFailure(result), /unavailable/);
});

test('missing and permission errors are retryable; error messages never escape', async (t) => {
  for (const [code, kind] of [['ENOENT', 'missing'], ['ENOTDIR', 'missing'], ['EACCES', 'permission'], ['EPERM', 'permission'], ['EIO', 'spawn']]) {
    let calls = 0;
    const runner = runnerFor(t, {
      candidates: ['private-executable'],
      spawn() {
        calls++;
        const child = fakeChild();
        queueMicrotask(() => child.emit('error', Object.assign(new Error('private raw error'), { code })));
        return child;
      },
    });
    assert.deepEqual(await runner.run([]), failure(kind, code));
    assert.deepEqual(await runner.run([]), failure(kind, code));
    assert.equal(calls, 2);
    assert.equal(describeFailure(failure(kind, code)).includes('private'), false);
  }
});

test('synchronous spawn errors and asynchronous run errors resolve safely', async (t) => {
  const throwing = runnerFor(t, { spawn() { throw new Error('private argument'); } });
  assert.deepEqual(await throwing.run([]), failure('spawn'));
  const asynchronous = runnerFor(t, {
    spawn(file, args, options) {
      if (args[0] === '--version') return spawn(file, args, options);
      const child = fakeChild();
      queueMicrotask(() => child.emit('error', Object.assign(new Error('private input'), { code: 'EAGAIN' })));
      return child;
    },
  });
  assert.deepEqual(await asynchronous.run([]), failure('spawn', 'EAGAIN'));
});

test('missing executable after readiness invalidates successful discovery', async (t) => {
  let probes = 0;
  const runner = runnerFor(t, {
    spawn(file, args, options) {
      if (args[0] === '--version') {
        probes++;
        return spawn(file, args, options);
      }
      const child = fakeChild();
      queueMicrotask(() => child.emit('error', Object.assign(new Error('gone'), { code: 'ENOENT' })));
      return child;
    },
  });
  assert.deepEqual(await runner.run([]), failure('missing', 'ENOENT'));
  assert.deepEqual(await runner.run([]), failure('missing', 'ENOENT'));
  assert.equal(probes, 2);
});

test('timeout bounds discovery as well as actual execution', async (t) => {
  const runner = runnerFor(t);
  assert.deepEqual(await runner.run(js('setInterval(() => {}, 1000)'), { timeoutMs: 100 }), failure('timeout'));
  const slowProbe = runnerFor(t, {
    spawn(file, args, options) {
      return spawn(file, args[0] === '--version' ? js('setInterval(() => {}, 1000)') : args, options);
    },
  });
  assert.deepEqual(await slowProbe.run([], { timeoutMs: 30 }), failure('timeout'));
});

test('stdout and stderr count toward bounded output, discarding all partial output', async (t) => {
  for (const stream of ['stdout', 'stderr']) {
    const runner = runnerFor(t, { maxBuffer: 100 });
    assert.deepEqual(await runner.run(js(`process.${stream}.write('x'.repeat(200)); setInterval(() => {}, 1000)`)), failure('overflow'));
  }
});

test('stdin EPIPE is harmless when the child successfully exits without reading', async (t) => {
  const runner = runnerFor(t);
  assert.deepEqual(await runner.run(js('process.exit(0)'), { input: 'x'.repeat(2 * 1024 * 1024) }), success());
});

test('abort-before-call and disposal-before-call never spawn', async () => {
  let calls = 0;
  const runner = createRunner({ candidates: [node], spawn() { calls++; throw new Error('unexpected'); } });
  assert.deepEqual(await runner.run([], { signal: AbortSignal.abort() }), failure('aborted'));
  runner.dispose();
  runner.dispose();
  assert.deepEqual(await runner.run([]), failure('aborted'));
  assert.equal(calls, 0);
});

test('concurrent callers share discovery; one abort cannot poison the other', async (t) => {
  let probes = 0;
  let probeChild;
  const runner = runnerFor(t, {
    spawn(file, args, options) {
      if (args[0] === '--version') {
        probes++;
        probeChild = spawn(file, js('setTimeout(() => process.stdout.write("v1"), 100)'), options);
        return probeChild;
      }
      return spawn(file, args, options);
    },
  });
  const controller = new AbortController();
  const first = runner.run(js('process.stdout.write("first")'), { signal: controller.signal });
  const second = runner.run(js('process.stdout.write("second")'));
  controller.abort();
  assert.deepEqual(await first, failure('aborted'));
  assert.equal(probeChild.killed, false);
  assert.deepEqual(await second, success('second'));
  assert.deepEqual(await runner.run(js('process.stdout.write("third")')), success('third'));
  assert.equal(probes, 1);
});

test('a caller timeout during shared discovery does not cancel a patient caller', async (t) => {
  let probes = 0;
  const runner = runnerFor(t, {
    spawn(file, args, options) {
      if (args[0] === '--version') {
        probes++;
        return spawn(file, js('setTimeout(() => process.stdout.write("v1"), 100)'), options);
      }
      return spawn(file, args, options);
    },
  });
  const impatient = runner.run([], { timeoutMs: 20 });
  const patient = runner.run(js('process.stdout.write("ok")'));
  assert.deepEqual(await impatient, failure('timeout'));
  assert.deepEqual(await patient, success('ok'));
  assert.equal(probes, 1);
});

test('abandoning all probe waiters terminates the probe and permits fresh discovery', async (t) => {
  const probes = [];
  const runner = runnerFor(t, {
    spawn(file, args, options) {
      if (args[0] === '--version') {
        const child = spawn(file, js('setTimeout(() => process.stdout.write("v1"), 100)'), options);
        probes.push(child);
        return child;
      }
      return spawn(file, args, options);
    },
  });
  const controller = new AbortController();
  const first = runner.run([], { signal: controller.signal });
  const closed = once(probes[0], 'close');
  controller.abort();
  assert.deepEqual(await first, failure('aborted'));
  assert.deepEqual(await runner.run(js('process.stdout.write("retry")')), success('retry'));
  await closed;
  assert.equal(probes.length, 2);
});

test('cancellation is prompt and escalates if an actual run ignores SIGTERM', { timeout: 3000 }, async (t) => {
  const controller = new AbortController();
  let childClosed;
  const kills = [];
  const runner = runnerFor(t, {
    killGraceMs: 25,
    spawn(file, args, options) {
      const child = spawn(file, args, options);
      if (args[0] !== '--version') {
        const kill = child.kill.bind(child);
        child.kill = (signal) => { kills.push(signal); return kill(signal); };
        childClosed = once(child, 'close');
        child.stdout.once('data', () => controller.abort());
      }
      return child;
    },
  });
  const result = await runner.run(js('process.on("SIGTERM", () => {}); process.stdout.write("ready"); setInterval(() => {}, 1000)'), { signal: controller.signal });
  assert.deepEqual(result, failure('aborted'));
  const [, signal] = await childClosed;
  // Windows forcibly terminates on SIGTERM; POSIX handlers can ignore it.
  assert.equal(signal, process.platform === 'win32' ? 'SIGTERM' : 'SIGKILL');
  assert.deepEqual(kills, process.platform === 'win32' ? ['SIGTERM'] : ['SIGTERM', 'SIGKILL']);
});

test('dispose terminates all active probes and actual runs and forbids new spawns', async (t) => {
  const children = [];
  let calls = 0;
  const runner = runnerFor(t, {
    spawn(file, args, options) {
      calls++;
      const child = spawn(file, args, options);
      children.push(child);
      return child;
    },
  });
  assert.deepEqual(await runner.run(js('')), success());
  const first = runner.run(js('setInterval(() => {}, 1000)'));
  const second = runner.run(js('setInterval(() => {}, 1000)'));
  await new Promise((resolve) => setImmediate(resolve));
  const closes = children.slice(-2).map((child) => once(child, 'close'));
  runner.dispose();
  assert.deepEqual(await first, failure('aborted'));
  assert.deepEqual(await second, failure('aborted'));
  await Promise.all(closes);
  const previous = calls;
  assert.deepEqual(await runner.run([]), failure('aborted'));
  assert.equal(calls, previous);

  let probe;
  const probing = runnerFor(t, {
    spawn(file, args, options) {
      probe = spawn(file, js('setInterval(() => {}, 1000)'), options);
      return probe;
    },
  });
  const waiting = probing.run([]);
  const closed = once(probe, 'close');
  probing.dispose();
  assert.deepEqual(await waiting, failure('aborted'));
  await closed;
});

test('real absent paths and empty candidates report missing without caching failure', async (t) => {
  const absent = runnerFor(t, { candidates: [`${node}/absent-fixture`] });
  const result = await absent.run([]);
  assert.equal(result.kind, 'missing');
  assert.equal(result.stdout, '');
  const empty = runnerFor(t, { candidates: [] });
  assert.deepEqual(await empty.run([]), failure('missing', 'ENOENT'));
});

test('caller abort listeners are removed on success, failure, and cancellation', async (t) => {
  const runner = runnerFor(t);
  for (const args of [js(''), js('process.exitCode = 2')]) {
    const controller = new AbortController();
    await runner.run(args, { signal: controller.signal });
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  }
  const controller = new AbortController();
  const work = runner.run(js('setInterval(() => {}, 1000)'), { signal: controller.signal });
  controller.abort();
  assert.deepEqual(await work, failure('aborted'));
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('non-EPIPE stdin errors resolve as sanitized spawn failures', async (t) => {
  const runner = runnerFor(t, {
    spawn(file, args, options) {
      if (args[0] === '--version') return spawn(file, args, options);
      const child = fakeChild();
      child.pid = 12345;
      child.kill = () => { queueMicrotask(() => child.emit('close', null)); return true; };
      queueMicrotask(() => child.stdin.emit('error', Object.assign(new Error('private input error'), { code: 'EIO' })));
      return child;
    },
  });
  assert.deepEqual(await runner.run([], { input: 'private input' }), failure('spawn', 'EIO'));
});

test('dispose escalates a version probe that ignores termination', { timeout: 3000 }, async (t) => {
  let childClosed;
  const runner = runnerFor(t, {
    killGraceMs: 20,
    spawn(file, args, options) {
      const child = spawn(file, js('process.on("SIGTERM", () => {}); process.stdout.write("ready"); setInterval(() => {}, 1000)'), options);
      childClosed = once(child, 'close');
      child.stdout.once('data', () => runner.dispose());
      return child;
    },
  });
  assert.deepEqual(await runner.run([]), failure('aborted'));
  const [, signal] = await childClosed;
  assert.equal(signal, process.platform === 'win32' ? 'SIGTERM' : 'SIGKILL');
});

test('stdin pipe closure waits for exit status on every platform', async (t) => {
  for (const code of ['EPIPE', 'EOF', 'ERR_STREAM_DESTROYED']) {
    for (const synchronous of [false, true]) {
      for (const exitCode of [0, 7]) {
        const runner = runnerFor(t, {
          spawn(file, args, options) {
            if (args[0] === '--version') return spawn(file, args, options);
            const child = fakeChild();
            const error = Object.assign(new Error('private input'), { code });
            if (synchronous) child.stdin.end = () => { throw error; };
            queueMicrotask(() => {
              if (!synchronous) child.stdin.emit('error', error);
              child.emit('exit', exitCode);
              child.emit('close', exitCode);
            });
            return child;
          },
        });
        assert.deepEqual(await runner.run([], { input: 'private' }), exitCode === 0 ? success() : failure('exit', exitCode));
      }
    }
  }
});

test('unresponsive probe and command deterministically escalate on all platforms', { timeout: 3000 }, async (t) => {
  for (const probe of [false, true]) {
    const controller = new AbortController();
    const kills = [];
    let closed;
    const runner = runnerFor(t, {
      killGraceMs: 10,
      spawn(file, args) {
        const child = fakeChild();
        if (!probe && args[0] === '--version') {
          queueMicrotask(() => child.emit('close', 0));
          return child;
        }
        child.pid = 12345;
        closed = once(child, 'close');
        child.kill = (signal) => {
          kills.push(signal);
          if (signal === 'SIGKILL') queueMicrotask(() => {
            child.emit('exit', null, signal);
            child.emit('close', null, signal);
          });
          return true;
        };
        queueMicrotask(() => probe ? runner.dispose() : controller.abort());
        return child;
      },
    });
    assert.deepEqual(await runner.run([], { signal: controller.signal }), failure('aborted'));
    await closed;
    assert.deepEqual(kills, ['SIGTERM', 'SIGKILL']);
  }
});

test('all failure diagnostics are model-safe and never describe a failed search as no matches', () => {
  for (const kind of ['missing', 'timeout', 'aborted', 'permission', 'overflow', 'exit', 'spawn', 'unexpected', 'toString', '__proto__']) {
    const message = describeFailure({ kind, stderr: 'private secret', code: 'private code' });
    assert.equal(typeof message, 'string');
    assert.doesNotMatch(message, /no (match|result|session)|not found in history|curl|private/i);
  }
});
