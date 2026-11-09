import test from 'node:test';
import assert from 'node:assert/strict';
import { mountPlanner } from '../runtime.js';
import { isRecord } from '../core.js';
import { mockHost, jsonRequest } from './helpers.js';

const PATH = '/api/local-planner';
const schema = { safeParse: value => ({ success: isRecord(value) }) };
const exec = () => ({ agent: { id: 'test-session' }, signal: new AbortController().signal });

test('UI and tools share the exact CRUD store, errors and source audit', async () => {
  const host = mockHost(); const dispose = await mountPlanner(host.ctx, schema);
  try {
    assert.equal(host.state.spec.name, 'local_planner'); assert.equal(host.tools.size, 4);
    const route = host.routes.get(PATH);
    const create = await host.tools.get('planner_create').execute({ title: 'Shared memo' }, exec());
    assert.equal(create.ok, true); assert.equal(create.value.sourceSessionId, 'test-session');
    const get = await (await route.fetch(jsonRequest({ action: 'get', id: create.value.id }))).json();
    assert.deepEqual(get.value, create.value);
    const edited = await (await route.fetch(jsonRequest({ action: 'update', id: create.value.id, expectedRevision: 1, patch: { kind: 'task', dueDate: '2026-11-11' } }))).json();
    assert.equal(edited.value.revision, 2); assert.equal(edited.value.history.at(-1).actor, 'user');
    const conflict = await host.tools.get('planner_update').execute({ id: create.value.id, expectedRevision: 1, patch: { title: 'Stale' } }, exec());
    assert.equal(conflict.error.code, 'conflict');
    const staleUI = await route.fetch(jsonRequest({ action: 'update', id: create.value.id, expectedRevision: 1, patch: { title: 'Stale' } }));
    assert.equal(staleUI.status, 409); assert.equal((await staleUI.json()).error.code, 'conflict');
    const list = await host.tools.get('planner_list').execute({}, exec()); assert.equal(list.value.items[0].kind, 'task');
  } finally { await dispose(); }
  assert.equal(host.state.closed, true); assert.equal(host.tools.size, 0); assert.equal(host.routes.size, 0);
});

test('HTTP parsing rejects invalid JSON, unsupported content type, huge or spoofed payloads', async () => {
  const host = mockHost(); const dispose = await mountPlanner(host.ctx, schema);
  try {
    const route = host.routes.get(PATH);
    const bad = [
      new Request(`http://localhost${PATH}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' }),
      jsonRequest({ action: 'summary' }, { headers: { 'content-type': 'text/plain' } }),
      jsonRequest({ action: 'create', item: { title: 'x'.repeat(140000) } }),
      jsonRequest({ action: 'create', item: { title: 'A' }, sourceSessionId: 'spoof' }),
    ];
    for (const request of bad) { const response = await route.fetch(request); assert.equal(response.status, 400); assert.equal((await response.json()).ok, false); }
    const read = await route.fetch(new Request(`http://localhost${PATH}?action=create&title=unexpected`));
    assert.equal(read.status, 200); assert.equal(host.table.size, 0);
  } finally { await dispose(); }
});

test('SSE delivers after mutation and closes on request abort and plugin disposal', async () => {
  const host = mockHost(); const dispose = await mountPlanner(host.ctx, schema);
  try {
    const abort = new AbortController();
    const response = await host.routes.get(`${PATH}/events`).fetch(new Request(`http://localhost${PATH}/events`, { signal: abort.signal }));
    assert.match(response.headers.get('content-type'), /text\/event-stream/);
    const reader = response.body.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /event: change/);
    await host.tools.get('planner_create').execute({ title: 'Notify UI' }, exec());
    const changed = new TextDecoder().decode((await reader.read()).value);
    assert.match(changed, /event: change/); assert.equal(changed.includes('Notify UI'), false);
    abort.abort(); assert.equal((await reader.read()).done, true);
    const second = await host.routes.get(`${PATH}/events`).fetch(new Request(`http://localhost${PATH}/events`));
    const secondReader = second.body.getReader(); await secondReader.read();
    await dispose(); assert.equal((await secondReader.read()).done, true);
  } finally { await dispose(); }
});

test('SSE cancellation unregisters listener and plugin close is idempotent', async () => {
  const host = mockHost(); const dispose = await mountPlanner(host.ctx, schema);
  const response = await host.routes.get(`${PATH}/events`).fetch(new Request(`http://localhost${PATH}/events`));
  await response.body.cancel();
  assert.equal((await host.tools.get('planner_create').execute({ title: 'After disconnect' }, exec())).ok, true);
  await Promise.all([dispose(), dispose()]); assert.equal(host.state.closed, true);
});

test('shutdown aborts a stalled body read instead of hanging native storage close', { timeout: 2000 }, async () => {
  const host = mockHost(); const dispose = await mountPlanner(host.ctx, schema);
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const request = new Request(`http://localhost${PATH}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body, duplex: 'half' });
  const pending = host.routes.get(PATH).fetch(request);
  await dispose();
  const result = await pending; assert.equal(result.status, 503); assert.equal(cancelled, true); assert.equal(host.table.size, 0);
});

test('partial activation cleans up domain and registered routes', async () => {
  const host = mockHost();
  host.ctx.tools.register = () => { throw new Error('registry unavailable'); };
  await assert.rejects(mountPlanner(host.ctx, schema));
  assert.equal(host.state.closed, true); assert.equal(host.routes.size, 0);
});

test('read-only tool names cannot smuggle mutation actions through raw execute arguments', async () => {
  const host = mockHost(); const dispose = await mountPlanner(host.ctx, schema);
  try {
    const item = (await host.tools.get('planner_create').execute({ title: 'Original' }, exec())).value;
    const attacks = [
      ['planner_list', { action: 'create', item: { title: 'Smuggled' } }],
      ['planner_list', { action: 'update', id: item.id, expectedRevision: 1, patch: { title: 'Smuggled' } }],
      ['planner_get', { action: 'update', id: item.id, expectedRevision: 1, patch: { archived: true } }],
      ['planner_update', { action: 'create', item: { title: 'Smuggled' }, id: item.id, expectedRevision: 1, patch: { title: 'Bad' } }],
    ];
    for (const [name, args] of attacks) assert.equal((await host.tools.get(name).execute(args, exec())).error.code, 'invalid_input');
    assert.equal(host.table.size, 1); assert.equal(host.table.get(item.id).title, 'Original'); assert.equal(host.table.get(item.id).revision, 1);
    for (const tool of host.tools.values()) {
      const serialized = JSON.stringify(tool.parameters);
      assert.equal(/\"(?:minimum|maximum)\"/.test(serialized), false);
    }
  } finally { await dispose(); }
});

test('model tools require a real caller and never accept UI attribution', async () => {
  const host = mockHost(); const dispose = await mountPlanner(host.ctx, schema);
  try {
    const tool = host.tools.get('planner_create');
    assert.equal((await tool.execute({ title: 'No caller' }, {})).error.code, 'agent_required');
    assert.equal((await tool.execute({ title: 'Spoof', actor: 'user' }, exec())).error.code, 'invalid_input');
    assert.equal(host.table.size, 0);
    assert.deepEqual([...host.tools.keys()], ['planner_list', 'planner_get', 'planner_create', 'planner_update']);
  } finally { await dispose(); }
});
