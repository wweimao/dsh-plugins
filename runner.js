import { spawn as nodeSpawn } from 'node:child_process';
import { constants } from 'node:os';

const DEFAULT_TIMEOUT = 20_000;
const DEFAULT_MAX_BUFFER = 8 * 1024 * 1024;
const errnoCodes = new Set(Object.keys(constants.errno));
const failure = (kind, code = null) => ({ ok: false, stdout: '', kind, code });
const positive = (value, fallback) => Number.isFinite(value) && value > 0 ? value : fallback;
const safeCode = (code) => Number.isInteger(code) ? code : errnoCodes.has(code) ? code : null;
const spawnFailure = (error) => failure(
  error?.code === 'ENOENT' || error?.code === 'ENOTDIR' ? 'missing'
    : error?.code === 'EACCES' || error?.code === 'EPERM' ? 'permission' : 'spawn',
  safeCode(error?.code),
);

/** All diagnostics are fixed text: never expose CLI stderr, paths, arguments, or input. */
export function describeFailure(result) {
  return ({
    __proto__: null,
    missing: 'The deja executable could not be found. Check its configured path or PATH.',
    timeout: 'The deja command timed out; its search result is unavailable.',
    aborted: 'The deja command was cancelled; its search result is unavailable.',
    permission: 'Permission to execute deja was denied. Check executable permissions.',
    overflow: 'The deja command exceeded its output limit; its search result is unavailable.',
    exit: 'The deja command exited unsuccessfully; its search result is unavailable.',
    spawn: 'The deja command could not be started or completed; its search result is unavailable.',
  })[result?.kind] ?? 'The deja command failed; its search result is unavailable.';
}

/**
 * Lazy, asynchronous CLI runner. `spawn` and `killGraceMs` are injectable for tests.
 * A successful version probe is cached; unsuccessful discovery is always retryable.
 */
export function createRunner({
  candidates = [], timeoutMs = DEFAULT_TIMEOUT, maxBuffer = DEFAULT_MAX_BUFFER,
  spawn = nodeSpawn, killGraceMs = 100,
} = {}) {
  const executables = [...new Set(candidates.filter((value) => typeof value === 'string' && value))];
  const limit = positive(maxBuffer, DEFAULT_MAX_BUFFER);
  const defaultTimeout = positive(timeoutMs, DEFAULT_TIMEOUT);
  const grace = positive(killGraceMs, 100);
  const active = new Set();
  let disposed = false;
  let ready = null;
  let resolving = null;

  function execute(executable, args, { cwd, input, signal, timeoutMs: duration = defaultTimeout } = {}) {
    return new Promise((resolve) => {
      if (disposed || signal?.aborted) return resolve(failure('aborted'));
      let child;
      let settled = false;
      let exited = false;
      let timer;
      let killTimer;
      let bytes = 0;
      const chunks = [];
      const task = { stop: () => stop(failure('aborted')) };
      const finish = (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        chunks.length = 0;
        resolve(result);
      };
      const cleanup = () => {
        exited = true;
        clearTimeout(killTimer);
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
        active.delete(task);
      };
      const kill = (name) => {
        try { child?.kill(name); } catch { /* A racing process exit needs no diagnostic. */ }
      };
      function stop(result) {
        if (settled) return;
        finish(result);
        // Close inherited pipes even if the direct child has already exited.
        // Keep error listeners installed so late stdin EPIPE cannot escape.
        child?.stdout?.destroy();
        child?.stderr?.destroy();
        child?.stdin?.destroy();
        if (exited) return;
        kill('SIGTERM');
        killTimer = setTimeout(() => {
          if (!exited) kill('SIGKILL');
        }, grace);
      }
      const onAbort = () => stop(failure('aborted'));
      const data = (chunk, capture) => {
        if (settled) return;
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.length;
        if (bytes > limit) return stop(failure('overflow'));
        if (capture) chunks.push(buffer);
      };
      try {
        child = spawn(executable, args, { cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch (error) {
        finish(spawnFailure(error));
        return;
      }
      active.add(task);
      child.on('error', (error) => {
        stop(spawnFailure(error));
        if (child.pid == null) cleanup();
      });
      child.once('exit', () => {
        exited = true;
        clearTimeout(killTimer);
      });
      child.once('close', (code) => {
        cleanup();
        finish(code === 0
          ? { ok: true, stdout: Buffer.concat(chunks).toString('utf8'), code: 0 }
          : failure('exit', safeCode(code)));
      });
      child.stdout?.on('data', (chunk) => data(chunk, true));
      child.stderr?.on('data', (chunk) => data(chunk, false));
      const streamError = (error) => stop(spawnFailure(error));
      child.stdout?.on('error', streamError);
      child.stderr?.on('error', streamError);
      child.stdin?.on('error', (error) => {
        // A command may successfully exit without consuming all of its stdin.
        if (error.code !== 'EPIPE' && error.code !== 'ERR_STREAM_DESTROYED') streamError(error);
      });
      signal?.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => stop(failure('timeout')), positive(duration, defaultTimeout));
      if (disposed || signal?.aborted) return onAbort();
      try { child.stdin?.end(input); } catch (error) { streamError(error); }
    });
  }

  function discover(signal) {
    if (disposed || signal.aborted) return Promise.resolve(failure('aborted'));
    if (ready) return Promise.resolve({ ok: true, executable: ready });
    if (!resolving) {
      const batch = { controller: new AbortController(), waiters: 0, done: false };
      resolving = batch;
      batch.promise = (async () => {
        let last = failure('missing', 'ENOENT');
        for (const executable of executables) {
          const result = await execute(executable, ['--version'], { signal: batch.controller.signal });
          if (disposed || batch.controller.signal.aborted) return failure('aborted');
          if (result.ok) {
            ready = executable;
            return { ok: true, executable };
          }
          if (last.kind === 'missing') last = result;
        }
        return last;
      })().finally(() => {
        batch.done = true;
        if (resolving === batch) resolving = null;
      });
    }
    const batch = resolving;
    return new Promise((resolve) => {
      batch.waiters++;
      let done = false;
      const finish = (result) => {
        if (done) return;
        done = true;
        signal.removeEventListener('abort', onAbort);
        batch.waiters--;
        if (!batch.done && batch.waiters === 0) {
          if (resolving === batch) resolving = null;
          batch.controller.abort();
        }
        resolve(result);
      };
      const onAbort = () => finish(failure('aborted'));
      signal.addEventListener('abort', onAbort, { once: true });
      batch.promise.then(finish, () => finish(failure('spawn')));
      if (signal.aborted) onAbort();
    });
  }

  async function run(args, { cwd, input, signal, timeoutMs: duration = defaultTimeout } = {}) {
    if (disposed || signal?.aborted) return failure('aborted');
    if (!Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) return failure('spawn');
    const controller = new AbortController();
    let cancelled = 'aborted';
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const timer = setTimeout(() => {
      cancelled = 'timeout';
      controller.abort();
    }, positive(duration, defaultTimeout));
    try {
      if (signal?.aborted) controller.abort();
      const found = await discover(controller.signal);
      if (controller.signal.aborted) return failure(cancelled);
      if (!found.ok) return found;
      if (disposed) return failure('aborted');
      const result = await execute(found.executable, args, { cwd, input, signal: controller.signal, timeoutMs: duration });
      if (!result.ok && result.kind === 'missing') ready = null;
      return controller.signal.aborted ? failure(cancelled) : result;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    ready = null;
    resolving?.controller.abort();
    for (const task of active) task.stop();
  }

  return { run, dispose };
}
