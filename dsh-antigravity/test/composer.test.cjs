'use strict';

// Offline contract tests only: no network, credentials, real model calls or Argon.
// This file imports the actual ESM source; all clocks and describe responses are local.
const test = require('node:test');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const path = require('node:path');
const source = import(pathToFileURL(path.resolve(__dirname, '../src/client/composer-quota.js')).href);
const START = Date.UTC(2026, 0, 1);
const current = (model = 'gemini-3-pro', provider = 'google-antigravity') => ({ model, provider });
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
async function flush() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function events() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(listener); },
    removeEventListener(type, listener) { listeners.get(type)?.delete(listener); },
    emit(type, event = {}) { for (const listener of [...(listeners.get(type) || [])]) listener(event); },
    count(type) { return type ? listeners.get(type)?.size || 0 : [...listeners.values()].reduce((n, set) => n + set.size, 0); },
  };
}
function clock() {
  let time = START, serial = 0;
  const tasks = new Map(), scheduled = [];
  const add = (fn, delay, interval) => {
    const id = ++serial;
    tasks.set(id, { fn, at: time + delay, interval });
    scheduled.push({ delay, interval });
    return id;
  };
  const timers = {
    setTimeout: (fn, delay) => add(fn, delay, 0), clearTimeout: id => tasks.delete(id),
    setInterval: (fn, delay) => add(fn, delay, delay), clearInterval: id => tasks.delete(id),
  };
  return {
    timers, tasks, scheduled, now: () => time,
    async advance(ms) {
      const end = time + ms;
      for (let guard = 0; ; guard++) {
        assert.ok(guard < 10000, 'fake timer must not spin indefinitely');
        const next = [...tasks.entries()].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        const [id, task] = next;
        time = task.at;
        if (task.interval) task.at += task.interval; else tasks.delete(id);
        task.fn();
        await flush();
      }
      time = end;
      await flush();
    },
  };
}
function group(label, five = 0.81, weekly = 0.62) {
  return { label, buckets: [
    { window: '5h', remainingFraction: five, resetTime: '2026-01-01T05:00:00.000Z' },
    { window: 'weekly', remainingFraction: weekly, resetTime: '2026-01-08T00:00:00.000Z' },
  ] };
}
function snapshot(groups = [group('Gemini'), group('Claude / GPT', 0.43, 0.24)], extra = {}) {
  return { configured: true, quota: { groups, fetchedAt: START, models: [] }, ...extra };
}
async function library(env = {}) { return (await source).createAntiGravityComposerQuota({}, {}, env); }
async function harness(t, describe, { hidden = false } = {}) {
  const time = clock();
  const env = { ...events(), ...time.timers, document: { ...events(), visibilityState: hidden ? 'hidden' : 'visible' } };
  const lib = await library(env);
  const controller = lib.createController(describe, { now: time.now, timers: time.timers });
  t.after(async () => { controller.dispose(); await flush(); });
  return { ...time, env, lib, controller };
}
const values = quota => quota?.windows.map(({ window, percent }) => [window, percent]);

test('familyOf accepts only google-antigravity Gemini or Claude/GPT models', async () => {
  const { familyOf } = await library();
  assert.equal(familyOf(current()), 'gemini');
  assert.equal(familyOf(current('claude-sonnet-4-5')), 'claude-gpt');
  assert.equal(familyOf(current('gpt-oss-120b')), 'claude-gpt');
  for (const value of [undefined, null, {}, { provider: 'google-antigravity', model: null },
    current('unknown'), current('gemini'), current('not-gemini-3'), current('Gemini-3'),
    current('claude'), current('gpt'), current('gemini-3', 'google'), current('claude-4', 'anthropic'),
    current('gpt-oss', 'google-antigravity-other')]) {
    assert.equal(familyOf(value), undefined, JSON.stringify(value));
  }
  assert.equal(familyOf({ model: 'gemini-3' }), undefined);
});

test('groupFamily uses exclusive real label tokens, never ids, names, position or model membership', async () => {
  const { groupFamily } = await library();
  for (const label of ['Gemini', 'GEMINI shared', 'Gemini Pro / Flash']) assert.equal(groupFamily({ label }), 'gemini');
  for (const label of ['Claude', 'GPT', 'Claude / GPT', 'claude-gpt']) assert.equal(groupFamily({ label }), 'claude-gpt');
  for (const label of ['', 'Gemini + Claude', 'Gemini / GPT', 'notgemini', 'claudette', 'gptish', null, 42]) {
    assert.equal(groupFamily({ label }), undefined, String(label));
  }
  for (const value of [null, undefined, { id: 'gemini', name: 'Gemini', models: ['gemini-3-pro'] }]) assert.equal(groupFamily(value), undefined);
});

test('both families always select 5h plus weekly by window, including reversed group/bucket order', async () => {
  const { selectQuota } = await library();
  for (const groups of [snapshot().quota.groups, snapshot().quota.groups.reverse().map(item => ({ ...item, buckets: item.buckets.reverse() }))]) {
    const data = snapshot(groups);
    assert.deepEqual(values(selectQuota(data, current())), [['5h', 81], ['weekly', 62]]);
    assert.deepEqual(values(selectQuota(data, current('claude-opus-4'))), [['5h', 43], ['weekly', 24]]);
    assert.deepEqual(values(selectQuota(data, current('gpt-oss-120b'))), [['5h', 43], ['weekly', 24]]);
    assert.equal(selectQuota(data, current('deepseek-v4')), undefined);
    assert.equal(selectQuota(data, current('gemini-3', 'google')), undefined);
  }
});

test('missing, duplicate and cross-family ambiguous groups stay unknown instead of borrowing a group', async () => {
  const { selectQuota } = await library();
  for (const groups of [[], null, [group('Gemini + Claude')], [group('Gemini + GPT')],
    [group('Gemini'), group('Gemini shared', 0.1, 0.2)], [group('Claude', 0.3, 0.4)],
    [null, { id: 'gemini', buckets: group('ignored').buckets }]]) {
    assert.deepEqual(values(selectQuota(snapshot(groups), current())), [['5h', null], ['weekly', null]], JSON.stringify(groups));
  }
  assert.deepEqual(values(selectQuota(snapshot([group('Claude'), group('GPT')]), current('claude-4'))), [['5h', null], ['weekly', null]]);
});

test('duplicate windows are ambiguous individually and exact bucket.window is required', async () => {
  const { selectQuota } = await library();
  const gemini = group('Gemini');
  gemini.buckets.push({ window: '5h', remainingFraction: 0.01 });
  assert.deepEqual(values(selectQuota(snapshot([gemini]), current())), [['5h', null], ['weekly', 62]]);
  const fake = { label: 'Gemini', buckets: [
    { label: '5h', remainingFraction: 1 }, { window: 'week', remainingFraction: 1 },
    { window: 'Weekly', remainingFraction: 1 }, { window: '5H', remainingFraction: 1 }, null,
  ] };
  assert.deepEqual(values(selectQuota(snapshot([fake]), current())), [['5h', null], ['weekly', null]]);
});

test('real zero remains 0%, missing/null/invalid quota never becomes fabricated zero', async () => {
  const { selectQuota } = await library();
  assert.deepEqual(values(selectQuota(snapshot([group('Gemini', 0, 1)]), current())), [['5h', 0], ['weekly', 100]]);
  assert.deepEqual(values(selectQuota(snapshot([group('Gemini', 0.12345, 0.99999)]), current())), [['5h', 12.3], ['weekly', 100]]);
  for (const invalid of [null, undefined, NaN, Infinity, -Infinity, -0.01, 1.01, '0', '0.4', false, {}, []]) {
    const item = group('Gemini');
    for (const bucket of item.buckets) bucket.remainingFraction = invalid;
    assert.deepEqual(values(selectQuota(snapshot([item]), current())), [['5h', null], ['weekly', null]], String(invalid));
  }
  for (const configured of [false, undefined, null, 'true']) {
    assert.deepEqual(values(selectQuota(snapshot([group('Gemini', 0, 1)], { configured }), current())), [['5h', null], ['weekly', null]]);
  }
});

test('per-model quotaInfo cannot impersonate missing 5h/weekly buckets', async () => {
  const { selectQuota } = await library();
  const data = snapshot([]);
  data.quota.models = [
    { model: 'gemini-3-pro', label: 'Gemini', remainingFraction: 0.99, quotaInfo: { remainingFraction: 0.99, resetTime: '2026-01-08T00:00:00Z' } },
    { id: 'claude-opus-4', quotaInfo: { remainingFraction: 0.98 }, buckets: group('Claude').buckets },
  ];
  for (const model of ['gemini-3-pro', 'claude-opus-4']) assert.deepEqual(values(selectQuota(data, current(model))), [['5h', null], ['weekly', null]]);
  data.quota.groups = [{ label: 'Gemini', models: data.quota.models, remainingFraction: 0.99 }];
  assert.deepEqual(values(selectQuota(data, current())), [['5h', null], ['weekly', null]]);
});

test('reset timestamps are validated independently without inventing a window', async () => {
  const { selectQuota } = await library();
  const item = group('Gemini');
  item.buckets[0].resetTime = 'not a date';
  item.buckets[1].resetTime = null;
  assert.deepEqual(selectQuota(snapshot([item]), current()).windows.map(row => row.resetTime), [null, null]);
  item.buckets[0].resetTime = '2026-01-01T05:00:00Z';
  assert.equal(selectQuota(snapshot([item]), current()).windows[0].resetTime, '2026-01-01T05:00:00Z');
});

test('controller requires consumers, shares one flight, and last release clears the snapshot', async t => {
  const request = deferred(); let calls = 0;
  const h = await harness(t, () => { calls++; return request.promise; });
  const c = h.controller;
  await c.refresh(true);
  assert.equal(calls, 0);
  const releaseA = c.retain(), releaseB = c.retain();
  assert.equal(c.getSnapshot().status, 'loading');
  const first = c.refresh(), second = c.refresh(true);
  assert.equal(first, second, 'forced refresh must still join the current request');
  await flush();
  assert.equal(calls, 1);
  assert.equal(h.env.count('focus'), 1);
  assert.equal(h.env.document.count('visibilitychange'), 1);
  request.resolve(snapshot()); await first;
  assert.equal(c.getSnapshot().status, 'ready');
  releaseA(); releaseA();
  assert.ok(c.getSnapshot().snapshot, 'one remaining consumer keeps shared data');
  releaseB();
  assert.equal(c.getSnapshot().snapshot, undefined);
  assert.equal(c.getSnapshot().status, 'idle');
  assert.equal(h.env.count(), 0); assert.equal(h.env.document.count(), 0);
  assert.equal(h.tasks.size, 0);
});

test('15s local ticks publish time, while data is fetched at 60s not at every tick', async t => {
  let calls = 0, notifications = 0;
  const h = await harness(t, () => { calls++; return snapshot(); });
  const c = h.controller, unsubscribe = c.subscribe(() => { notifications++; });
  c.retain(); await flush();
  assert.equal(calls, 1);
  await h.advance(15000);
  assert.equal(c.getSnapshot().now, START + 15000); assert.equal(calls, 1);
  await h.advance(44999); assert.equal(calls, 1);
  await h.advance(1); assert.equal(calls, 2);
  assert.ok(notifications >= 6);
  assert.equal(h.scheduled.filter(x => x.interval === 15000).length, 1);
  assert.ok(h.scheduled.some(x => x.delay === 30000 && !x.interval));
  await c.refresh(); assert.equal(calls, 2);
  await c.refresh(true); assert.equal(calls, 3);
  unsubscribe(); const before = notifications;
  await h.advance(15000); assert.equal(notifications, before);
});

test('30s client timeout unblocks singleflight; a late old response cannot replace a retry', async t => {
  const old = deferred(), fresh = deferred(); let calls = 0;
  const h = await harness(t, () => (++calls === 1 ? old : fresh).promise);
  const c = h.controller; c.retain(); await flush();
  const timed = c.refresh();
  await h.advance(29999); assert.equal(c.getSnapshot().refreshing, true);
  await h.advance(1); await timed;
  assert.equal(c.getSnapshot().status, 'error'); assert.equal(c.getSnapshot().failed, true);
  assert.equal(c.getSnapshot().refreshing, false); assert.equal(c.getSnapshot().snapshot, undefined);
  const retry = c.refresh(true); await flush(); assert.equal(calls, 2);
  const latest = snapshot([group('Gemini', 0.2, 0.3)]);
  fresh.resolve(latest); await retry;
  old.resolve(snapshot([group('Gemini', 0.9, 0.9)])); await flush();
  assert.equal(c.getSnapshot().snapshot, latest); assert.equal(c.getSnapshot().failed, false);
});

test('describe rejection/invalid snapshot preserves previous values, marks failure, then recovers', async t => {
  const good = snapshot(); let outcome = good;
  const h = await harness(t, () => outcome instanceof Error ? Promise.reject(outcome) : outcome);
  const c = h.controller; c.retain(); await flush();
  for (const bad of [new Error('offline describe failure'), null, {}, { configured: 'true' }]) {
    outcome = bad; await c.refresh(true);
    assert.equal(c.getSnapshot().snapshot, good);
    assert.equal(c.getSnapshot().status, 'error'); assert.equal(c.getSnapshot().failed, true);
    assert.equal(c.getSnapshot().refreshing, false);
  }
  outcome = snapshot([group('Gemini', 0.1, 0.2)]); await c.refresh(true);
  assert.equal(c.getSnapshot().snapshot, outcome); assert.equal(c.getSnapshot().failed, false);
});

test('a backend quota.error is flagged and unconfigured snapshots cannot retain signed-in data', async t => {
  let result = snapshot();
  const h = await harness(t, () => result); const c = h.controller;
  c.retain(); await flush();
  result = { configured: true, quota: { ...snapshot().quota, error: 'backend unavailable' } };
  await c.refresh(true); assert.equal(c.getSnapshot().failed, true);
  result = { configured: false }; await c.refresh(true);
  assert.equal(c.getSnapshot().status, 'unconfigured'); assert.equal(c.getSnapshot().snapshot, result);
  assert.deepEqual(values(h.lib.selectQuota(c.getSnapshot().snapshot, current())), [['5h', null], ['weekly', null]]);
});

test('hidden documents pause automatic fetching/ticks and visibility/focus resume without duplicate requests', async t => {
  let calls = 0;
  const h = await harness(t, () => { calls++; return snapshot(); }, { hidden: true });
  const c = h.controller; c.retain(); await flush();
  await h.advance(120000); assert.equal(calls, 0); assert.equal(c.getSnapshot().now, START);
  h.env.emit('focus'); await flush(); assert.equal(calls, 0);
  h.env.document.visibilityState = 'visible'; h.env.document.emit('visibilitychange'); h.env.emit('focus');
  await flush(); assert.equal(calls, 1); assert.equal(c.getSnapshot().now, START + 120000);
  h.env.document.visibilityState = 'hidden'; h.env.document.emit('visibilitychange');
  await h.advance(180000); assert.equal(calls, 1);
  h.env.document.visibilityState = 'visible'; h.env.emit('focus'); h.env.document.emit('visibilitychange');
  await flush(); assert.equal(calls, 2);
});

test('hidden transition does not create new flights while a visible-started request is pending', async t => {
  const pending = deferred(); let calls = 0;
  const h = await harness(t, () => { calls++; return pending.promise; });
  const c = h.controller; c.retain(); await flush();
  h.env.document.visibilityState = 'hidden';
  await h.advance(15000); assert.equal(calls, 1);
  pending.resolve(snapshot()); await flush();
  await h.advance(120000); assert.equal(calls, 1);
  h.env.document.visibilityState = 'visible'; h.env.document.emit('visibilitychange'); await flush();
  assert.equal(calls, 2);
});

test('release before describe microtask cancels work and rapid reacquire starts a fresh flight', async t => {
  let calls = 0;
  const h = await harness(t, () => { calls++; return snapshot(); }); const c = h.controller;
  const release = c.retain(); release();
  await flush(); assert.equal(calls, 0);
  const releaseAgain = c.retain(); await flush();
  assert.equal(calls, 1); assert.equal(c.getSnapshot().status, 'ready');
  releaseAgain(); assert.equal(c.getSnapshot().snapshot, undefined);
});

test('release/reacquire isolates late results and old finally cannot clear the new singleflight', async t => {
  const old = deferred(), fresh = deferred(); let calls = 0;
  const h = await harness(t, () => (++calls === 1 ? old : fresh).promise); const c = h.controller;
  const release = c.retain(); await flush(); release();
  c.retain(); const secondFlight = c.refresh(true); await flush(); assert.equal(calls, 2);
  old.resolve(snapshot()); await flush();
  assert.equal(c.getSnapshot().snapshot, undefined);
  assert.equal(c.refresh(true), secondFlight);
  const next = snapshot([group('Gemini', 0.12, 0.34)]); fresh.resolve(next); await secondFlight;
  assert.equal(c.getSnapshot().snapshot, next);
});

test('invalidate reloads one generation, rejects old completion and keeps fresh singleflight', async t => {
  const old = deferred(), fresh = deferred(); let calls = 0;
  const h = await harness(t, () => (++calls === 1 ? old : fresh).promise); const c = h.controller;
  c.retain(); await flush(); c.invalidate();
  const nextFlight = c.refresh(); await flush(); assert.equal(calls, 2);
  old.resolve(snapshot()); await flush();
  assert.equal(c.getSnapshot().snapshot, undefined); assert.equal(c.getSnapshot().failed, false);
  assert.equal(c.refresh(true), nextFlight);
  const next = snapshot([group('Gemini', 0.05, 0.06)]); fresh.resolve(next); await nextFlight;
  assert.equal(c.getSnapshot().snapshot, next);
});

test('invalidate(false), logout-shaped data and no-consumer invalidation never resurrect old auth state', async t => {
  const old = deferred(); let calls = 0;
  const h = await harness(t, () => ++calls === 1 ? old.promise : { configured: false }); const c = h.controller;
  const release = c.retain(); await flush(); c.invalidate(false);
  assert.equal(c.getSnapshot().status, 'idle'); assert.equal(c.getSnapshot().snapshot, undefined);
  old.resolve(snapshot()); await flush(); assert.equal(c.getSnapshot().snapshot, undefined); assert.equal(calls, 1);
  c.invalidate(); await flush(); assert.equal(calls, 2); assert.equal(c.getSnapshot().status, 'unconfigured');
  release(); c.invalidate(); await flush(); assert.equal(calls, 2); assert.equal(c.getSnapshot().snapshot, undefined);
});

test('dispose cancels timers/listeners, prevents further describe and discards late completion', async t => {
  const pending = deferred(); let calls = 0, notifications = 0;
  const h = await harness(t, () => { calls++; return pending.promise; }); const c = h.controller;
  c.subscribe(() => { notifications++; }); const release = c.retain(); await flush();
  c.dispose(); await flush(); const count = notifications;
  pending.resolve(snapshot()); await flush();
  assert.equal(c.getSnapshot().snapshot, undefined); assert.equal(notifications, count);
  h.env.emit('focus'); h.env.document.emit('visibilitychange');
  c.invalidate(); await c.refresh(true); c.retain()(); await h.advance(120000);
  assert.equal(calls, 1); assert.equal(h.tasks.size, 0);
  assert.equal(h.env.count(), 0); assert.equal(h.env.document.count(), 0);
  release(); release();
});
