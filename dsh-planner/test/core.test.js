import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlanner, dateInZone, validDate, validateRecord, isRecord, publicError } from '../core.js';
import { memoryTable } from './helpers.js';

const clock = () => new Date('2026-11-09T16:30:00.000Z'); // Nov 10 in Shanghai.
function setup(options = {}) { const table = memoryTable(options); let n = 0; return { table, planner: createPlanner(table, { clock, makeId: () => `p_${++n}` }) }; }
const create = (planner, item = { title: 'Note' }, actor) => planner.dispatch({ action: 'create', item }, actor);
const update = (planner, item, patch) => planner.dispatch({ action: 'update', id: item.id, expectedRevision: item.revision, patch });

test('all-day dates validate leap years without UTC shifting', () => {
  for (const value of ['2024-02-29', '2000-02-29', '2026-11-10', '0001-01-01']) assert.equal(validDate(value), true);
  for (const value of ['1900-02-29', '2026-02-29', '2026-04-31', '0000-01-01', '2026-13-01', '2026-1-01', '2026-11-10T00:00:00Z', null]) assert.equal(validDate(value), false);
  assert.equal(dateInZone(clock(), 'Asia/Shanghai'), '2026-11-10');
  assert.equal(dateInZone(clock(), 'America/Los_Angeles'), '2026-11-09');
});

test('memo defaults, canonical text, bounded summary and no automatic execution', async () => {
  const { planner, table } = setup();
  const item = await create(planner, { title: '  A note  ', content: 'line1\r\nline2', tags: [' one ', 'one'] });
  assert.equal(item.title, 'A note'); assert.equal(item.content, 'line1\nline2'); assert.deepEqual(item.tags, ['one']);
  assert.equal(item.kind, 'memo'); assert.equal(item.dueDate, null); assert.equal(item.revision, 1); assert.equal(item.sourceSessionId, null);
  assert.equal(isRecord(item), true);
  item.title = 'mutated response';
  const got = await planner.dispatch({ action: 'get', id: item.id }); assert.equal(got.title, 'A note');
  const list = await planner.dispatch({ action: 'list' });
  assert.equal(list.today, '2026-11-10'); assert.equal(list.total, 1); assert.equal(list.items[0].excerpt, 'line1\nline2');
  assert.equal('content' in list.items[0], false); assert.equal('history' in list.items[0], false);
  assert.equal(table.size, 1); // No schedule, child run or another record is synthesized.
});

test('CRUD round trip, source audit, safe conversion and archive/restore', async () => {
  const { planner } = setup();
  let item = await create(planner, { title: 'Research', content: 'Find evidence' }, { kind: 'agent', sessionId: 'session-a' });
  assert.equal(item.sourceSessionId, 'session-a'); assert.equal(item.history[0].actor, 'agent');
  item = await update(planner, item, { kind: 'task', status: 'doing', dueDate: '2026-11-10' });
  assert.equal(item.kind, 'task'); assert.equal(item.history[1].actor, 'user');
  item = await update(planner, item, { archived: true }); assert.equal(item.history.at(-1).action, 'archive');
  assert.equal((await planner.dispatch({ action: 'list' })).total, 0);
  assert.equal((await planner.dispatch({ action: 'list', archived: true })).total, 1);
  item = await update(planner, item, { archived: false }); assert.equal(item.history.at(-1).action, 'restore');
  item = await update(planner, item, { kind: 'memo' }); assert.equal(item.dueDate, null); assert.equal(item.status, 'todo');
  assert.equal(item.sourceSessionId, 'session-a'); assert.equal(item.revision, 5);
});

test('conversion refuses contradictory explicit fields without changing the record', async () => {
  const { planner, table } = setup();
  const item = await create(planner, { kind: 'task', title: 'Task', status: 'doing', dueDate: '2026-11-10' });
  for (const patch of [{ kind: 'memo', status: 'done' }, { kind: 'memo', dueDate: '2027-01-01' }]) {
    await assert.rejects(update(planner, item, patch), { code: 'invalid_input' });
    assert.deepEqual(table.get(item.id), item);
  }
  const memo = await update(planner, item, { kind: 'memo' });
  assert.equal(memo.dueDate, null); assert.equal(memo.status, 'todo');
});

test('uncertain storage failures give restart-and-verify guidance without leaking internals', () => {
  const error = new Error('secret backend path'); error.code = 'unknown-state';
  const result = publicError(error);
  assert.equal(result.code, 'storage_error'); assert.match(result.message, /restart/); assert.match(result.message, /check whether the write committed/); assert.equal(result.message.includes('secret'), false);
});

test('concurrent edits compare revisions inside FIFO and preserve immutable objects', async () => {
  const { planner, table } = setup(); const item = await create(planner);
  const before = structuredClone(table.get(item.id));
  const results = await Promise.allSettled([update(planner, item, { title: 'Winner' }), update(planner, item, { title: 'Loser' })]);
  assert.equal(results[0].status, 'fulfilled'); assert.equal(results[1].status, 'rejected'); assert.equal(results[1].reason.code, 'conflict');
  assert.equal(table.get(item.id).title, 'Winner'); assert.equal(before.title, 'Note'); assert.equal(table.get(item.id).revision, 2);
});

test('validation rejects malformed input, privilege spoofing and impossible dates before writes', async () => {
  const { planner, table } = setup();
  const bad = [null, {}, { action: 'delete', id: 'p_1' }, { action: 'create', item: { title: '' } }, { action: 'create', item: { title: 'A', content: 'x'.repeat(20001) } }, { action: 'create', item: { title: 'A', tags: [''] } }, { action: 'create', item: { title: 'A', archived: true } }, { action: 'create', item: { title: 'A', sourceSessionId: 'spoof' } }, { action: 'create', item: { title: 'A', dueDate: '2026-11-10' } }, { action: 'create', item: { title: 'A', kind: 'task', dueDate: '2026-02-29' } }, { action: 'create', item: { title: 'A', pinned: 'true' } }, { action: 'create', item: { title: 'A' }, actor: 'agent' }];
  for (const request of bad) await assert.rejects(planner.dispatch(request), { code: 'invalid_input' });
  await assert.rejects(create(planner, { title: 'A' }, { kind: 'user', sessionId: 'spoof' }), { code: 'invalid_input' });
  assert.equal(table.size, 0);
});

test('read filters, pagination and exact summary exclude archived/done deadlines', async () => {
  const { planner } = setup();
  const rows = [
    { title: 'Yesterday', kind: 'task', dueDate: '2026-11-09', project: 'A' },
    { title: 'Today', kind: 'task', dueDate: '2026-11-10', status: 'doing', tags: ['special'] },
    { title: 'Tomorrow', kind: 'task', dueDate: '2026-11-11', status: 'review' },
    { title: 'Done', kind: 'task', dueDate: '2026-11-09', status: 'done' },
    { title: 'Pinned memo', pinned: true, content: 'Searchable content' },
  ];
  for (const row of rows) await create(planner, row);
  let result = await planner.dispatch({ action: 'summary' });
  assert.deepEqual(result.counts, { tasks: 4, memos: 1, today: 1, overdue: 1, doing: 1, review: 1, done: 1 });
  assert.equal(result.pinnedItems[0].title, 'Pinned memo'); assert.equal(result.todayItems[0].title, 'Today');
  assert.equal((await planner.dispatch({ action: 'list', query: 'special' })).total, 1);
  assert.equal((await planner.dispatch({ action: 'list', query: 'searchable' })).total, 1);
  assert.equal((await planner.dispatch({ action: 'list', project: 'A' })).total, 1);
  assert.equal((await planner.dispatch({ action: 'list', month: '2026-11' })).total, 4);
  const page = await planner.dispatch({ action: 'list', limit: 2, offset: 2 }); assert.equal(page.items.length, 2); assert.equal(page.total, 5);
  await assert.rejects(planner.dispatch({ action: 'list', limit: 201 }), { code: 'invalid_input' });
  await assert.rejects(planner.dispatch({ action: 'list', month: '2026-13' }), { code: 'invalid_input' });
});

test('failed persistence publishes neither mutation nor change signal', async () => {
  const { planner, table } = setup({ failWrite: true }); let notifications = 0;
  planner.subscribe(() => notifications++);
  await assert.rejects(create(planner));
  assert.equal(table.size, 0); assert.equal(notifications, 0);
  assert.equal(publicError(new Error('/private/secret')).message.includes('secret'), false);
});

test('observers run after durable state and cannot turn success into failure', async () => {
  const { planner, table } = setup();
  let seen;
  const off = planner.subscribe(() => { seen = table.size; throw new Error('bad UI observer'); });
  await create(planner); assert.equal(seen, 1); off();
  await create(planner); assert.equal(seen, 1);
});

test('history remains bounded and validates on simulated domain reopen', async () => {
  const { planner, table } = setup(); let item = await create(planner);
  for (let i = 0; i < 38; i++) item = await update(planner, item, { title: `Version ${i}` });
  assert.equal(item.history.length, 30); assert.equal(item.history.at(-1).revision, 39);
  const persisted = JSON.parse(JSON.stringify([...table.entries()]));
  for (const [, row] of persisted) assert.equal(validateRecord(row), row);
  const tampered = structuredClone(item); tampered.dueDate = 'not-a-date'; assert.equal(isRecord(tampered), false);
  const tamperedHistory = structuredClone(item); tamperedHistory.history.at(-1).revision = 1; assert.equal(isRecord(tamperedHistory), false);
});

test('aborted operations and unloading refuse further writes', async () => {
  const { planner, table } = setup(); const controller = new AbortController(); controller.abort();
  await assert.rejects(planner.dispatch({ action: 'create', item: { title: 'No' } }, { kind: 'user' }, controller.signal));
  assert.equal(table.size, 0); await planner.close();
  await assert.rejects(create(planner), { code: 'disposed' });
});
