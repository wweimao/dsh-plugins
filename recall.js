import { resolve } from 'node:path';
import { currentDirectory, sessionId, bareSessionId, humanText, latestHuman, fingerprint, historyContext, noteMessage, waitOptional, VERSION } from './core.js';
import { splitHookReply, resultText, exitStatus } from './lib.js';

export function registerRecall(ctx, runtime) {
  const { runner, config, cache, stats, board, projection } = runtime;
  const owners = new Map();
  const captures = new Map();
  const live = new Map();
  const lifetime = new AbortController();
  const endingLifetime = new AbortController();
  const endings = new Set();
  let closing;
  const signalFor = signal => signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;

  async function hook(command, args, payload, signal) {
    const result = await runner.run([command, ...args], {
      cwd: payload.cwd, input: JSON.stringify(payload), signal: signalFor(signal), timeoutMs: config.hookTimeoutMs,
    });
    stats.record(result);
    if (!result.ok) return { ok: false, text: '', kind: result.kind };
    const reply = splitHookReply(result.stdout);
    if (reply.notes) board.push(payload.session_id, reply.notes);
    return { ok: true, text: reply.context };
  }

  async function prepare(agent, payload, next) {
    const decision = await next();
    if (decision.kind !== 'enter' || payload.signal.aborted || lifetime.signal.aborted) return decision;
    const sid = sessionId(agent);
    const cwd = currentDirectory(ctx, agent);
    const state = cache.get(sid);
    const generation = ++state.generation;
    const valid = () => !payload.signal.aborted && !lifetime.signal.aborted
      && cache.peek(sid) === state && state.generation === generation && currentDirectory(ctx, agent) === cwd;
    if (state.cwd !== cwd) {
      state.cwd = cwd; state.context = ''; state.key = ''; state.projectDone = false; state.project = ''; state.projectCwd = '';
    }
    if (state.turn !== payload.turn) {
      state.turn = payload.turn; state.toolNotes.clear(); state.toolNoteCount = 0;
    }
    if (!await waitOptional(captures.get(sid), { signal: signalFor(payload.signal), timeoutMs: config.hookTimeoutMs })) {
      state.context = ''; state.key = ''; return decision;
    }
    if (!valid()) return decision;
    const persisted = projection.stateOf(agent.session);
    const admitted = latestHuman(decision.messages);
    const prompt = (admitted ? humanText(admitted) : persisted.prompt).slice(0, 32768);
    const promptId = admitted?.id || persisted.promptId || fingerprint(prompt);
    const key = JSON.stringify([cwd, promptId, fingerprint(prompt), persisted.compaction]);
    if (state.key === key && state.expires > Date.now()) { stats.hit(); return decision; }
    if (state.failedKey === key && state.retryAt > Date.now()) return decision;
    // Do not allow stale project/prompt text into a changed request on failure.
    state.context = ''; state.key = ''; state.expires = 0;
    live.set(sid, cwd);
    const base = { cwd, session_id: sid };
    const flags = board.hasReader() ? [] : ['--plain'];
    let successful = true;
    if (config.projectRecall && (!state.projectDone || state.projectCwd !== cwd)) {
      // The in-memory project cache owns deduplication. A CLI-side once stamp
      // would consume the digest before an aborted step can admit it, and would
      // suppress a different project's digest after a cwd change.
      const digest = await hook('hook-context', flags, { ...base, source: 'startup' }, payload.signal);
      if (!valid()) return decision;
      successful = digest.ok;
      if (digest.ok) { state.project = digest.text; state.projectDone = true; state.projectCwd = cwd; }
    }
    let recalled = '';
    if (config.promptRecall && prompt) {
      const reply = await hook('hook-prompt', flags, { ...base, prompt }, payload.signal);
      if (!valid()) return decision;
      successful = successful && reply.ok;
      recalled = reply.text;
    }
    if (!valid()) return decision;
    state.context = historyContext([state.project, recalled].filter(Boolean).join('\n\n'), config.maxContextChars);
    if (successful) {
      state.key = key; state.expires = Date.now() + config.cacheTtlMs; state.failedKey = ''; state.retryAt = 0;
    } else {
      state.failedKey = key; state.retryAt = Date.now() + Math.min(5000, config.cacheTtlMs);
      board.push(sid, 'deja-vu — automatic recall is temporarily unavailable; this is not evidence of an empty history.');
    }
    return decision;
  }

  function mount(agent) {
    if (owners.has(agent) || lifetime.signal.aborted) return;
    const sid = sessionId(agent);
    const dispose = agent.ctx.effect(() => {
      const offContext = agent.ctx.systemPrompt.context({
        name: 'deja:recall', order: 120, interpolate: false,
        // Pure and synchronous: refreshContext records this text in the Session.
        text: () => {
          const state = cache.peek(sid);
          return state?.cwd === currentDirectory(ctx, agent) ? state.context : '';
        },
      });
      const offStep = agent.ctx.on('agent/pre-step', (payload, next) => prepare(agent, payload, next));
      return () => {
        offStep(); offContext(); cache.delete(sid); owners.delete(agent);
      };
    });
    owners.set(agent, dispose);
  }
  ctx.on('agent/created', ({ agent }) => { mount(agent); });
  for (const agent of ctx.agents.list()) mount(agent);
  // The caller owns this ordered disposer and destroys the runner only after
  // session-end work drains. Ordinary recall is cancelled first; end hooks
  // have a separate, bounded shutdown signal so they can release live stamps.
  function endSession(sid, cwd) {
    const task = runner.run(['hook-session-end'], {
      cwd, input: JSON.stringify({ cwd, session_id: sid }),
      signal: endingLifetime.signal, timeoutMs: Math.min(config.hookTimeoutMs, 2000),
    }).then(result => stats.record(result));
    endings.add(task);
    void task.finally(() => endings.delete(task));
    return task;
  }
  function shutdown() {
    if (closing) return closing;
    lifetime.abort();
    for (const dispose of [...owners.values()]) dispose();
    owners.clear(); captures.clear();
    const queue = [...live]; live.clear();
    closing = (async () => {
      const timer = setTimeout(() => endingLifetime.abort(), Math.min(config.hookTimeoutMs, 2000));
      try {
        const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
          while (queue.length && !endingLifetime.signal.aborted) {
            const [sid, cwd] = queue.shift(); await endSession(sid, cwd);
          }
        });
        await Promise.all([...endings, ...workers]);
      } finally { clearTimeout(timer); endingLifetime.abort(); }
    })();
    return closing;
  }

  // Only this route is HTTP-facing; it remains behind DSH's authenticated
  // Connection fetch registry. No new server or unauthenticated endpoint.
  ctx.inject(['connection', 'webServer'], c => {
    c.connection.fetch.register({
      path: '/api/deja-notes', methods: ['GET'], requestBody: 'buffered',
      fetch: async request => {
        const sid = bareSessionId(new URL(request.url).searchParams.get('session'));
        return new Response(JSON.stringify({ notes: sid ? board.take(sid) : [], pluginVersion: VERSION }), {
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
        });
      },
    });
    board.setReader();
  });

  ctx.on('tools/post-execute', async (exec, result, next) => {
    const decision = await next();
    if (decision.kind !== 'accept' || !exec.agent || exec.signal?.aborted || lifetime.signal.aborted) return decision;
    // A downstream policy may replace/redact the canonical value; the tool
    // pipeline renders that value only after this waterfall completes. Never
    // send the superseded (possibly sensitive) original output to the CLI.
    if (Object.hasOwn(decision, 'value')) return decision;
    const name = exec.name;
    const args = exec.arguments || {};
    const cwd = currentDirectory(ctx, exec.agent);
    const sid = sessionId(exec.agent);
    const state = cache.get(sid);
    let translated, key, command;
    const path = name === 'str_replace_editor' ? args.path : args.file_path;
    if (config.fileRecall && !result.isError && ['read', 'edit', 'write', 'str_replace_editor'].includes(name) && typeof path === 'string') {
      const tool = name === 'str_replace_editor' ? (args.command === 'view' ? 'read' : 'edit') : name;
      translated = { tool_name: tool, tool_input: { file_path: resolve(cwd, path) } };
      key = `file:${tool}:${translated.tool_input.file_path}`;
      command = 'hook-tool';
    } else if (config.errorRecall && ['bash', 'pwsh'].includes(name)) {
      const output = resultText({ content: decision.content || result.content });
      const status = exitStatus(output.trimEnd());
      if (!result.isError && !status.failed) return decision;
      translated = { tool_name: name === 'pwsh' ? 'powershell' : 'bash', tool_input: { command: String(args.command || '') }, tool_response: status.body.slice(-32768) };
      key = `error:${fingerprint(status.body)}`;
      command = 'hook-tool-after';
    } else return decision;
    if (state.toolNotes.has(key) || state.toolNoteCount >= config.maxToolNotesPerTurn) return decision;
    state.toolNotes.add(key); state.toolNoteCount++;
    const turn = state.turn;
    const reply = await hook(command, ['--plain'], { ...translated, session_id: sid, cwd }, exec.signal);
    if (!reply.ok) { state.toolNotes.delete(key); state.toolNoteCount--; return decision; }
    if (exec.signal?.aborted || lifetime.signal.aborted || state.turn !== turn || currentDirectory(ctx, exec.agent) !== cwd) return decision;
    const text = historyContext(reply.text, config.maxToolNoteChars);
    if (!text) return decision;
    return { ...decision, additionalContexts: [...(decision.additionalContexts || []), noteMessage(text)] };
  });

  if (config.captureCompaction) ctx.inject(['sessions'], c => {
    c.on('session/event', (session, event) => {
      if (event.type !== 'compaction/start') return;
      const sid = bareSessionId(session.id);
      const task = (async () => {
        if (!await waitOptional(captures.get(sid), { signal: lifetime.signal })) return;
        if (!await waitOptional(c.sessions.flush(session), { signal: lifetime.signal, timeoutMs: config.hookTimeoutMs })) {
          stats.record({ ok: false, kind: 'capture', code: null }); return;
        }
        if (lifetime.signal.aborted) return;
        const cwd = ctx.workingDirectory.get(session);
        await hook('hook-precompact', [], { cwd, session_id: sid, harness: 'deepseek' });
        const state = cache.peek(sid);
        if (state) { state.key = ''; state.projectDone = false; state.context = ''; }
      })().catch(() => { stats.record({ ok: false, kind: 'capture', code: null }); });
      captures.set(sid, task);
      void task.finally(() => { if (captures.get(sid) === task) captures.delete(sid); });
    });
  });
  ctx.on('session/disposed', session => {
    const sid = bareSessionId(session.id);
    const cwd = live.get(sid);
    live.delete(sid); cache.delete(sid);
    if (cwd && !lifetime.signal.aborted) void endSession(sid, cwd);
  });
  return shutdown;
}
