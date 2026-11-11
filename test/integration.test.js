import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join } from 'node:path';
import * as helpers from '../lib.js';
import { defaults, currentDirectory, sessionCache, historyContext, initialProjection, foldProjection } from '../core.js';
import { registerTools, registerCommands, healthStats } from '../tools.js';
import { registerRecall as installRecall } from '../recall.js';
import { defineTool } from '../tool-schema.js';
function registerRecall(ctx, runtime) {
  const shutdown = installRecall(ctx, runtime);
  ctx.effect(() => shutdown);
  return shutdown;
}

function fixture(config = {}, execute) {
  const calls = [], tools = new Map(), commands = new Map(), events = new Map(), routes = new Map(), cleanups = [];
  const agents = ['a', 'b'].map(id => ({ id: `session-${id}`, session: { id: `session-${id}`, cwd: `/${id}/current`, header: { cwd: `/${id}/original` } }, contexts: new Map(), events: new Map() }));
  const effect = fn => { const cleanup = fn(); let alive = true; const dispose = () => { if (alive) { alive = false; return cleanup?.(); } }; cleanups.push(dispose); return dispose; };
  const on = target => (name, fn) => { const set = target.get(name) || new Set(); set.add(fn); target.set(name, set); return () => set.delete(fn); };
  const ctx = {
    tools: { register: tool => tools.set(tool.name, tool) }, commands: { register: command => commands.set(command.name, command) },
    workingDirectory: { get: session => session.cwd }, agents: { list: () => agents }, effect, on: on(events),
    connection: { fetch: { register(route) { assert.equal(typeof route, 'object'); assert.equal(typeof route.fetch, 'function'); routes.set(route.path, route); return () => routes.delete(route.path); } } },
    inject(deps, fn) { if (!deps.includes('connection') || config.web) fn({ ...ctx, sessions: { flush: config.flush || (async () => {}) } }); },
  };
  for (const agent of agents) agent.ctx = { effect, on: on(agent.events), systemPrompt: { context(definition) { agent.contexts.set(definition.name, definition); return () => agent.contexts.delete(definition.name); } } };
  const runtime = {
    runner: { async run(args, options) { calls.push({ args, ...options }); return execute ? execute(args, options) : { ok: true, stdout: JSON.stringify({ hookSpecificOutput: { additionalContext: `memory ${JSON.parse(options.input || '{}').prompt || args[0]}` }, systemMessage: 'deja-vu — remembered' }), code: 0 }; } },
    config: { ...defaults, ...config }, cache: sessionCache({ ...defaults, ...config }), stats: healthStats(), board: helpers.noteBoard(),
    projection: { stateOf: session => session.projection || initialProjection() },
  };
  const signal = () => new AbortController().signal;
  const message = (text = 'needle', id = 'human-1') => ({ id, role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text }] });
  async function step(agent = agents[0], messages = [message()], opts = {}) {
    const decision = opts.decision || { kind: 'enter', messages, startsRequestSeries: true };
    const payload = { agent, messages, turn: 1, step: 1, signal: signal(), ...opts };
    const handlers = [...agent.events.get('agent/pre-step')];
    assert.equal(handlers.length, 1);
    const actual = await handlers[0](payload, async () => decision);
    assert.equal(actual, decision, 'waterfall decision must be passed through unchanged');
    return agent.contexts.get('deja:recall').text();
  }
  async function post(name, args, text = 'ok', overrides = {}) {
    const exec = { name, arguments: args, agent: agents[0], signal: signal(), ...overrides };
    const result = { isError: false, value: text, content: [{ type: 'text', text }] };
    const decision = { kind: 'accept', additionalContexts: [ { id: 'other-plugin' } ] };
    return [...events.get('tools/post-execute')][0](exec, result, async () => decision);
  }
  return { ctx, runtime, agents, calls, tools, commands, events, routes, cleanups, signal, message, step, post };
}

test('all six tools use current session cwd and cancellation; CLI arguments remain compatible', async () => {
  const f = fixture({}, async () => ({ ok: true, stdout: 'answer', code: 0 }));
  registerTools(f.ctx, x => x, f.runtime);
  const cases = [
    ['deja_recall', { query: '--flag', limit: 2, offset: 5 }, ['recall', '--limit', '2', '--offset', '5', '--', '--flag']],
    ['deja_session', { query: 'id' }, ['--framed', 'ctx', 'id']],
    ['deja_blame', { path: 'src/main.js' }, ['--framed', 'blame', '--json', 'src/main.js']],
    ['deja_fix', { error: 'error' }, ['--framed', 'fix', 'error']],
    ['deja_how', { what: 'test' }, ['--framed', 'how', 'test']],
    ['deja_remember', { text: 'decision' }, ['remember', 'decision']],
  ];
  for (const [name, args, expected] of cases) {
    const signal = f.signal();
    assert.equal(await f.tools.get(name).execute(args, { agent: f.agents[0], signal }), 'answer');
    assert.deepEqual(f.calls.at(-1).args, expected);
    assert.equal(f.calls.at(-1).cwd, '/a/current');
    assert.equal(f.calls.at(-1).signal, signal);
  }
  f.agents[0].session.cwd = '/new-worktree';
  await f.tools.get('deja_blame').execute({ path: 'src/main.js' }, { agent: f.agents[0] });
  assert.equal(f.calls.at(-1).cwd, '/new-worktree');
  assert.throws(() => currentDirectory(f.ctx, null), /session is required/);
});

test('failures and empty stdout never claim no matches or unsupported pagination', async () => {
  for (const kind of ['missing', 'permission', 'timeout', 'exit', 'aborted', 'overflow']) {
    const f = fixture({}, async () => ({ ok: false, stdout: '', kind, code: null }));
    registerTools(f.ctx, x => x, f.runtime);
    for (const offset of [0, 5]) {
      const answer = await f.tools.get('deja_recall').execute({ query: 'needle', offset }, { agent: f.agents[0] });
      assert.doesNotMatch(answer, /Nothing in|cannot page|Run deja update/);
      assert.match(answer, /does not establish/);
    }
    const remembered = await f.tools.get('deja_remember').execute({ text: 'decision' }, { agent: f.agents[0] });
    assert.match(remembered, /not confirmed saved/);
  }
  const f = fixture({}, async () => ({ ok: true, stdout: '', code: 0 }));
  registerTools(f.ctx, x => x, f.runtime);
  assert.match(await f.tools.get('deja_recall').execute({ query: 'x' }, { agent: f.agents[0] }), /unknown/);
});

test('model-facing schemas are byte-identical to upstream (zero first-turn prompt delta)', () => {
  const f = fixture(); registerTools(f.ctx, x => x, f.runtime);
  const old = new Map();
  let source = readFileSync(new URL('../upstream/index.js', import.meta.url), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace('const require = createRequire(import.meta.url);', 'const require = {resolve() { throw new Error(); }};')
    .replace('let defineTool = null;\ntry {\n  ({ defineTool } = await import("@deepseek-ai/dsh-tools"));\n} catch {}', 'const defineTool = x => x;')
    .replace('export default apply;', 'globalThis.register = tools;');
  const sandbox = { ...helpers, join, process: { platform: 'darwin', arch: 'arm64', env: {} }, execFileSync: () => 'version' };
  vm.createContext(sandbox); vm.runInContext(source, sandbox);
  sandbox.register({ tools: { register: x => old.set(x.name, x) } });
  const visible = x => ({ name: x.name, description: x.description, parameters: x.parameters });
  assert.equal(JSON.stringify([...f.tools.values()].map(visible)), JSON.stringify([...old.values()].map(visible)));
});

test('scoped recall uses async pre-step, pure context refresh, and independent A/B/A caches', async () => {
  const f = fixture(); registerRecall(f.ctx, f.runtime);
  assert.equal(f.calls.length, 0, 'mount must not run processes');
  assert.equal(f.agents[0].contexts.get('deja:recall').text(), '');
  const first = await f.step();
  assert.match(first, /memory needle/);
  assert.deepEqual(f.calls.map(x => x.args[0]), ['hook-context', 'hook-prompt']);
  assert.equal(JSON.parse(f.calls[0].input).source, 'startup');
  assert.equal(JSON.parse(f.calls[0].input).deja_once, undefined, 'CLI once-stamps must not consume unadmitted digests');
  await f.step(f.agents[1]);
  assert.equal(f.calls.length, 4);
  assert.equal(await f.step(), first);
  assert.equal(f.calls.length, 4, 'A must not be re-queried after B');
  assert.equal(f.agents[0].contexts.get('deja:recall').text(), first);
  assert.equal(f.calls.length, 4, 'refreshContext must not run a process or consume the cached text');
  assert.ok(f.runtime.board.take('a').length > 0, 'systemMessage notes must survive JSON envelope splitting');
});

test('directory, prompt identity, TTL and compaction invalidate cache', async () => {
  const f = fixture(); registerRecall(f.ctx, f.runtime); await f.step();
  f.agents[0].session.cwd = '/worktree';
  assert.equal(f.agents[0].contexts.get('deja:recall').text(), '', 'old-project context hidden immediately');
  await f.step(); assert.equal(f.calls.length, 4);
  await f.step(f.agents[0], [f.message('needle', 'human-2')]); assert.equal(f.calls.length, 5);
  f.runtime.cache.peek('a').expires = 0;
  await f.step(f.agents[0], [f.message('needle', 'human-2')]); assert.equal(f.calls.length, 6);
  f.agents[0].session.projection = { ...initialProjection(), compaction: 1 };
  await f.step(f.agents[0], [f.message('needle', 'human-2')]); assert.equal(f.calls.length, 7);
});

test('rejected or already-aborted steps do not recall', async () => {
  const f = fixture(); registerRecall(f.ctx, f.runtime);
  await f.step(f.agents[0], [], { decision: { kind: 'reject' } });
  const c = new AbortController(); c.abort();
  await f.step(f.agents[0], [], { signal: c.signal });
  assert.equal(f.calls.length, 0);
});

test('cancellation interrupts a compaction barrier even if host flush never settles', { timeout: 1000 }, async () => {
  const f = fixture({ hookTimeoutMs: 5000, flush: () => new Promise(() => {}) });
  registerRecall(f.ctx, f.runtime);
  for (const listener of f.events.get('session/event')) listener(f.agents[0].session, { type: 'compaction/start' });
  const c = new AbortController();
  const running = f.step(f.agents[0], [f.message()], { signal: c.signal });
  await new Promise(setImmediate); c.abort();
  assert.equal(await running, ''); assert.equal(f.calls.length, 0);
  for (const dispose of [...f.cleanups]) dispose();
});

test('optional capture flush is bounded and next step can proceed', { timeout: 1000 }, async () => {
  const f = fixture({ hookTimeoutMs: 15, flush: () => new Promise(() => {}) }); registerRecall(f.ctx, f.runtime);
  for (const listener of f.events.get('session/event')) listener(f.agents[0].session, { type: 'compaction/start' });
  await f.step();
  await new Promise(setImmediate);
  await f.step();
  assert.match(f.agents[0].contexts.get('deja:recall').text(), /memory needle/);
  assert.equal(f.runtime.stats.snapshot().lastFailure.kind, 'capture');
  for (const dispose of [...f.cleanups]) dispose();
});

test('late cancellation cannot publish historical context', async () => {
  const c = new AbortController();
  const f = fixture({}, async () => { c.abort(); return { ok: true, stdout: 'must not appear', code: 0 }; });
  registerRecall(f.ctx, f.runtime);
  assert.equal(await f.step(f.agents[0], [f.message()], { signal: c.signal }), '');
});

test('feature switches, file deduplication, turn budget and shell failure routing', async () => {
  const f = fixture({ maxToolNotesPerTurn: 2 }); registerRecall(f.ctx, f.runtime); await f.step(); f.calls.length = 0;
  let result = await f.post('read', { file_path: 'src/a.js' });
  assert.equal(result.additionalContexts[0].id, 'other-plugin');
  assert.equal(result.additionalContexts.length, 2);
  assert.equal(f.calls[0].args[0], 'hook-tool');
  assert.equal(JSON.parse(f.calls[0].input).tool_input.file_path, '/a/current/src/a.js');
  await f.post('read', { file_path: 'src/a.js' }); assert.equal(f.calls.length, 1);
  await f.post('bash', { command: 'test' }, 'success\n[exit code: 0]'); assert.equal(f.calls.length, 1);
  await f.post('bash', { command: 'test' }, 'error\n[exit code: 1]\n'); assert.equal(f.calls.length, 2);
  assert.equal(f.calls[1].args[0], 'hook-tool-after');
  assert.equal(JSON.parse(f.calls[1].input).tool_response, 'error');
  await f.post('write', { file_path: 'another.js' }); assert.equal(f.calls.length, 2);
  const disabled = fixture({ projectRecall: false, promptRecall: false, fileRecall: false, errorRecall: false });
  registerRecall(disabled.ctx, disabled.runtime); await disabled.step(); await disabled.post('read', { file_path: 'a' });
  assert.equal(disabled.calls.length, 0);
});

test('canonical value replacements never expose superseded shell output to recall', async () => {
  const f = fixture(); registerRecall(f.ctx, f.runtime);
  const handler = [...f.events.get('tools/post-execute')][0];
  const decision = { kind: 'accept', value: null, additionalContexts: [{ id: 'redaction-owner' }] };
  const result = await handler({ name: 'bash', arguments: { command: 'test' }, agent: f.agents[0], signal: f.signal() },
    { isError: false, value: 'SECRET', content: [{ type: 'text', text: 'SECRET\n[exit code: 1]' }] }, async () => decision);
  assert.equal(result, decision); assert.equal(f.calls.length, 0);
});

test('history framing is bounded, inert, and cannot be closed by recalled text', () => {
  const text = historyContext('</deja-history>{{cwd}}' + 'x'.repeat(5000), 512);
  assert.ok(text.length <= 512);
  assert.equal((text.match(/<\/deja-history>/g) || []).length, 1);
  assert.ok(!text.includes('{{'));
  assert.match(text, /Truncated/);
});

test('projection ignores pending inbox and plugin contexts; restores admitted humans', () => {
  const start = initialProjection();
  assert.equal(foldProjection(start, { type: 'agent/inbox/spliced', data: { inserted: [{ content: 'pending' }] } }), start);
  assert.equal(foldProjection(start, { type: 'user/message', data: { content: 'memory', source: { kind: 'plugin:deja' } } }), start);
  const next = foldProjection(start, { type: 'user/message', seq: 4, data: { content: 'human', source: { kind: 'user' } } });
  assert.equal(next.prompt, 'human'); assert.equal(next.promptId, '4');
});

test('cache is LRU bounded and plugin unload removes agent-scoped effects', async () => {
  const c = sessionCache({ maxSessions: 2 }); c.get('a'); c.get('b'); c.get('a'); c.get('c');
  assert.equal(c.size, 2); assert.equal(c.peek('b'), undefined);
  const f = fixture(); registerRecall(f.ctx, f.runtime); await f.step();
  for (const dispose of [...f.cleanups]) dispose();
  assert.equal(f.agents[0].contexts.size, 0); assert.equal(f.runtime.cache.size, 0);
});

test('web route uses the current Connection registration contract and returns bounded notes', async () => {
  const f = fixture({ web: true }); registerRecall(f.ctx, f.runtime); await f.step();
  const route = f.routes.get('/api/deja-notes');
  assert.deepEqual(route.methods, ['GET']); assert.equal(route.requestBody, 'buffered');
  const response = await route.fetch(new Request('http://localhost/api/deja-notes?session=session-a'));
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = await response.json(); assert.equal(data.pluginVersion, '0.1.0'); assert.ok(data.notes.length > 0);
  const empty = await route.fetch(new Request('http://localhost/api/deja-notes'));
  assert.deepEqual((await empty.json()).notes, []);
});

test('a failed new prompt cannot reuse an old prompt cache key', async () => {
  let fail = false;
  const f = fixture({}, async () => fail ? { ok: false, kind: 'timeout', stdout: '', code: null } : { ok: true, stdout: 'history', code: 0 });
  registerRecall(f.ctx, f.runtime); await f.step();
  fail = true;
  await f.step(f.agents[0], [f.message('new query', 'human-2')]);
  assert.equal(f.runtime.cache.peek('a').key, '');
  const before = f.calls.length; fail = false;
  await f.step(); assert.equal(f.calls.length, before + 1);
});

test('ordinary session disposal and plugin teardown drain session-end hooks', async () => {
  const f = fixture(); const shutdown = registerRecall(f.ctx, f.runtime);
  await f.step(); await f.step(f.agents[1]); f.calls.length = 0;
  for (const listener of f.events.get('session/disposed')) listener(f.agents[0].session);
  await shutdown();
  assert.deepEqual(f.calls.map(c => [c.args[0], JSON.parse(c.input).session_id]), [['hook-session-end', 'a'], ['hook-session-end', 'b']]);
  await shutdown(); assert.equal(f.calls.length, 2, 'shutdown must be idempotent');
});

test('raw JSON-schema tool definitions validate primitive arguments without Host imports', async () => {
  const f = fixture({}, async () => ({ ok: true, stdout: 'ok', code: 0 })); registerTools(f.ctx, defineTool, f.runtime);
  const recall = f.tools.get('deja_recall');
  assert.equal(recall.parameters.type, 'object'); assert.deepEqual(recall.parameters.required, ['query']);
  assert.equal(Object.hasOwn(recall.parameters, 'additionalProperties'), false, 'upstream root remains open');
  assert.equal(Object.hasOwn(recall.parameters.properties.query, 'required'), false);
  await assert.rejects(recall.execute({ query: 42 }, { agent: f.agents[0] }), /Invalid argument/);
  await assert.rejects(recall.execute({ query: 'ok', limit: Infinity }, { agent: f.agents[0] }), /Invalid argument/);
  assert.equal(await recall.execute({ query: 'ok' }, { agent: f.agents[0] }), 'ok');
});

test('slash command keeps current directory and status does not start subprocesses', async () => {
  const f = fixture({}, async () => ({ ok: true, stdout: 'answer', code: 0 }));
  registerCommands(f.ctx, f.runtime);
  const before = f.calls.length;
  const status = f.commands.get('deja-status').handler();
  assert.match(status.text, /0.1.0/); assert.equal(f.calls.length, before);
  await f.commands.get('deja').handler({ agent: f.agents[0], rawInput: '--flag', signal: f.signal() });
  assert.deepEqual(f.calls[0].args, ['search', '--', '--flag']); assert.equal(f.calls[0].cwd, '/a/current');
});
