'use strict';

// MOCK REACT HOOKS / VIRTUAL HOST TESTS, NOT BROWSER ACCEPTANCE.
// This dependency-free harness does not load ReactDOM, jsdom or Testing Library.
// The deliberately small driver implements hook state, dependency cleanup, external
// store subscriptions, refs and portal structure. It does NOT validate actual DOM,
// browser layout, React scheduling/StrictMode, CSS rendering or accessibility tooling.
// Tests run offline without third-party test dependencies or network requests.
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
async function microtasks() { for (let i = 0; i < 12; i++) await Promise.resolve(); }
function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    emit(type, value = {}) { for (const callback of [...(listeners.get(type) || [])]) callback(value); },
    count(type) { return type ? listeners.get(type)?.size || 0 : [...listeners.values()].reduce((n, set) => n + set.size, 0); },
  };
}
function fakeEnvironment() {
  let now = START, serial = 0;
  const tasks = new Map();
  const timer = (callback, delay, interval = 0) => {
    const id = ++serial; tasks.set(id, { callback, at: now + delay, interval }); return id;
  };
  const head = {
    children: [],
    appendChild(element) { element.parent = this; this.children.push(element); return element; },
  };
  const env = {
    ...eventTarget(), innerWidth: 1024, innerHeight: 768,
    setTimeout: (callback, delay) => timer(callback, delay), clearTimeout: id => tasks.delete(id),
    setInterval: (callback, delay) => timer(callback, delay, delay), clearInterval: id => tasks.delete(id),
    document: {
      ...eventTarget(), visibilityState: 'visible', body: { mockBody: true }, head,
      createElement(tagName) {
        return { tagName, dataset: {}, textContent: '', remove() {
          if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);
          this.parent = null;
        } };
      },
    },
  };
  return {
    env, tasks, now: () => now,
    async advance(ms) {
      const end = now + ms;
      for (let guard = 0; ; guard++) {
        assert.ok(guard < 10000, 'fake clock runaway');
        const next = [...tasks.entries()].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        const [id, task] = next; now = task.at;
        if (task.interval) task.at += task.interval; else tasks.delete(id);
        task.callback(); await microtasks();
      }
      now = end; await microtasks();
    },
  };
}
function store(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => value,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    set(next) { value = next; for (const listener of [...listeners]) listener(); },
    listenerCount: () => listeners.size,
  };
}
let nextMockId = 0;
function mockReactDriver() {
  const hooks = [];
  let cursor = 0, dirty = false, mounted = false, component, props, tree, layout = [], passive = [], renders = 0;
  const fragment = Symbol('mock-fragment'), portal = Symbol('mock-portal');
  const same = (a, b) => !!a && !!b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));
  const changed = () => { if (mounted) dirty = true; };
  function effect(create, deps, queue) {
    const index = cursor++, item = hooks[index] || (hooks[index] = {});
    if (!same(item.deps, deps)) queue.push(() => {
      item.cleanup?.(); item.deps = deps; item.cleanup = create();
    });
  }
  const React = {
    Fragment: fragment,
    createElement(type, properties, ...children) { return { type, props: { ...(properties || {}), children: children.flat(Infinity) } }; },
    useState(initial) {
      const index = cursor++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === 'function' ? initial() : initial };
      const item = hooks[index];
      return [item.value, value => {
        const next = typeof value === 'function' ? value(item.value) : value;
        if (!Object.is(item.value, next)) { item.value = next; changed(); }
      }];
    },
    useRef(initial) { const index = cursor++; return hooks[index] || (hooks[index] = { current: initial }); },
    useId() { const index = cursor++; return (hooks[index] || (hooks[index] = { id: `mock-quota-${++nextMockId}` })).id; },
    useEffect(create, deps) { effect(create, deps, passive); },
    useLayoutEffect(create, deps) { effect(create, deps, layout); },
    useSyncExternalStore(subscribe, getSnapshot) {
      const index = cursor++, item = hooks[index] || (hooks[index] = {});
      if (item.subscribe !== subscribe) {
        item.cleanup?.(); item.subscribe = subscribe; item.cleanup = subscribe(changed);
      }
      return getSnapshot();
    },
  };
  const ReactDOM = { createPortal: (child, target) => ({ type: portal, props: { children: [child], target } }) };
  function walk(node, visitor) {
    if (Array.isArray(node)) { for (const item of node) walk(item, visitor); return; }
    if (!node || typeof node !== 'object') return;
    visitor(node);
    for (const child of node.props?.children || []) walk(child, visitor);
  }
  function refs() {
    walk(tree, node => {
      const ref = node.props.ref;
      if (!ref || typeof node.type !== 'string') return;
      if (!ref.current) ref.current = {
        mockHost: true, focusCount: 0,
        getBoundingClientRect: () => ({ top: 600, right: 800, left: 720, bottom: 624 }),
        contains(target) { return target === this || target?.mockParent === this; },
        focus() { this.focusCount++; },
      };
    });
  }
  const driver = {
    React, ReactDOM,
    mount(Component, injected) { component = Component; props = injected; mounted = true; dirty = true; return this.flush(); },
    flush() {
      for (let guard = 0; dirty; guard++) {
        assert.ok(guard < 50, 'mock hooks render loop');
        dirty = false; cursor = 0; layout = []; passive = []; renders++;
        tree = component(props); refs();
        for (const run of [...layout, ...passive]) run();
      }
      return tree;
    },
    nodes(predicate = () => true) { const result = []; walk(tree, node => { if (predicate(node)) result.push(node); }); return result; },
    one(predicate) { const result = this.nodes(predicate); assert.equal(result.length, 1, 'expected exactly one mock node'); return result[0]; },
    click(node) { assert.equal(node.type, 'button'); if (!node.props.disabled) node.props.onClick?.({ target: node.props.ref?.current }); this.flush(); },
    unmount() {
      if (!mounted) return;
      mounted = false;
      for (const item of hooks) item?.cleanup?.();
      walk(tree, node => { if (node.props.ref) node.props.ref.current = null; });
      tree = null; dirty = false;
    },
    get tree() { return tree; }, get renders() { return renders; },
  };
  return driver;
}
function text(node) {
  if (node === null || node === undefined || typeof node === 'boolean') return '';
  if (Array.isArray(node)) return node.map(text).join('');
  return typeof node === 'object' ? text(node.props?.children || []) : String(node);
}
function snapshot({ geminiLabel = 'Gemini', five = 0.81, week = 0.62, fetchedAt = START } = {}) {
  return { configured: true, quota: { fetchedAt, groups: [
    { label: geminiLabel, buckets: [
      { window: '5h', remainingFraction: five, resetTime: '2026-01-01T05:00:00Z' },
      { window: 'weekly', remainingFraction: week, resetTime: '2026-01-08T00:00:00Z' },
    ] },
    { label: 'Claude / GPT', buckets: [
      { window: 'weekly', remainingFraction: 0.24, resetTime: null },
      { window: '5h', remainingFraction: 0.43, resetTime: '2025-12-31T00:00:00Z' },
    ] },
  ] } };
}
async function settle(...drivers) { await microtasks(); for (const driver of drivers) driver.flush(); await microtasks(); for (const driver of drivers) driver.flush(); }
const summary = driver => driver.one(node => node.props.className === 'agComposerQuota');
const windows = driver => driver.nodes(node => node.props['data-ag-window']).map(node => [node.props['data-ag-window'], text(node.props.children[1])]);
const dialog = driver => driver.one(node => node.props.role === 'dialog');
const refreshButton = driver => driver.one(node => node.props.className === 'agQuotaRefresh');
async function mounted(t, describe = () => snapshot(), initial = { current: current(), routable: true }) {
  const time = fakeEnvironment(), driver = mockReactDriver();
  const lib = (await source).createAntiGravityComposerQuota(driver.React, driver.ReactDOM, time.env);
  const controller = lib.createController(describe, { now: time.now, timers: time.env });
  const directory = store(initial), translate = key => lib.messages.en[key] || key;
  driver.mount(lib.ComposerQuota, { controller, directory, t: translate });
  t.after(async () => { driver.unmount(); controller.dispose(); await microtasks(); });
  return { ...time, driver, lib, controller, directory, translate };
}

test('MOCK hooks: current Gemini/Claude/GPT changes update both periods, not stale provider metadata', async t => {
  const request = deferred(); let calls = 0;
  const h = await mounted(t, () => { calls++; return request.promise; });
  assert.deepEqual(windows(h.driver), [['5h', '--'], ['weekly', '--']]);
  assert.match(summary(h.driver).props['aria-label'], /Loading quota/);
  request.resolve(snapshot()); await settle(h.driver);
  assert.deepEqual(windows(h.driver), [['5h', '81%'], ['weekly', '62%']]);
  for (const model of ['claude-opus-4', 'gpt-oss-120b']) {
    h.directory.set({ current: current(model), routable: true, selected: current('gemini-3-pro') }); h.driver.flush();
    assert.deepEqual(windows(h.driver), [['5h', '43%'], ['weekly', '24%']]);
    assert.equal(summary(h.driver).props['data-ag-model'], model);
    assert.equal(summary(h.driver).props['data-ag-quota'], 'claude-gpt');
  }
  h.directory.set({ current: current(), routable: true }); h.driver.flush();
  assert.deepEqual(windows(h.driver), [['5h', '81%'], ['weekly', '62%']]);
  assert.equal(calls, 1, 'switching supported family uses the same shared snapshot');
});

test('MOCK hooks: unsupported provider/model and routable=false hide and release; restoration reloads', async t => {
  let calls = 0;
  const h = await mounted(t, () => { calls++; return snapshot(); }); await settle(h.driver);
  for (const state of [
    { current: current('gemini-3-pro', 'google'), routable: true },
    { current: current('mystery-model'), routable: true },
    { current: undefined, routable: true },
    { current: current(), routable: false },
  ]) {
    h.directory.set(state); h.driver.flush(); await settle(h.driver);
    assert.equal(h.driver.tree, null); assert.equal(h.controller.getSnapshot().snapshot, undefined);
    assert.equal(h.env.count('focus'), 0); assert.equal(h.tasks.size, 0);
    const before = calls;
    h.directory.set({ current: current('claude-sonnet-4'), routable: true }); h.driver.flush(); await settle(h.driver);
    assert.equal(calls, before + 1); assert.deepEqual(windows(h.driver), [['5h', '43%'], ['weekly', '24%']]);
  }
});

test('MOCK hooks: initially unsupported provider performs no describe until public current becomes supported', async t => {
  let calls = 0;
  const h = await mounted(t, () => { calls++; return snapshot(); }, { current: current('claude-4', 'anthropic'), routable: true });
  await settle(h.driver); assert.equal(calls, 0); assert.equal(h.driver.tree, null);
  h.directory.set({ current: current(), routable: true }); h.driver.flush(); await settle(h.driver);
  assert.equal(calls, 1); assert.deepEqual(windows(h.driver), [['5h', '81%'], ['weekly', '62%']]);
});

test('MOCK hooks: real 0 and null differ, and model-only quota cannot fill absent windows', async t => {
  let response = snapshot({ five: 0, week: null });
  const h = await mounted(t, () => response); await settle(h.driver);
  assert.deepEqual(windows(h.driver), [['5h', '0%'], ['weekly', '--']]);
  h.driver.click(summary(h.driver));
  assert.equal(h.driver.nodes(node => node.type === 'progress').length, 1);
  assert.equal(h.driver.one(node => node.type === 'progress').props.value, 0);
  assert.match(text(dialog(h.driver)), /No quota for this window/);
  response = { configured: true, quota: { models: [{ id: 'gemini-3-pro', quotaInfo: { remainingFraction: 1 } }] } };
  await h.controller.refresh(true); await settle(h.driver);
  assert.deepEqual(windows(h.driver), [['5h', '--'], ['weekly', '--']]);
  assert.equal(h.driver.nodes(node => node.type === 'progress').length, 0);
  assert.doesNotMatch(text(dialog(h.driver)), /Remaining 0%/);
});

test('MOCK hooks: details portal, refresh singleflight, disabled loading, close/outside/Escape cleanup', async t => {
  const pending = deferred(); let calls = 0;
  const h = await mounted(t, () => ++calls === 1 ? snapshot() : pending.promise); await settle(h.driver);
  h.driver.click(summary(h.driver));
  const panel = dialog(h.driver);
  assert.equal(summary(h.driver).props['aria-expanded'], true);
  assert.equal(summary(h.driver).props['aria-controls'], panel.props.id);
  assert.equal(panel.props.style.position, 'fixed');
  assert.ok(panel.props.style.left >= 12);
  assert.equal(h.driver.one(node => node.props.target === h.env.document.body).props.target, h.env.document.body);
  assert.match(text(panel), /Five hoursRemaining 81%/); assert.match(text(panel), /WeeklyRemaining 62%/);
  assert.equal(h.env.count('resize'), 1); assert.equal(h.env.document.count('pointerdown'), 1);
  h.driver.click(refreshButton(h.driver)); await settle(h.driver);
  assert.equal(calls, 2); assert.equal(refreshButton(h.driver).props.disabled, true);
  assert.match(text(refreshButton(h.driver)), /Loading quota/);
  h.driver.click(refreshButton(h.driver)); await settle(h.driver); assert.equal(calls, 2);
  pending.resolve(snapshot({ five: 0.55, week: 0.33 })); await settle(h.driver);
  assert.deepEqual(windows(h.driver), [['5h', '55%'], ['weekly', '33%']]);
  assert.equal(refreshButton(h.driver).props.disabled, false);
  h.env.document.emit('pointerdown', { target: panel.props.ref.current }); h.driver.flush();
  assert.equal(h.driver.nodes(node => node.props.role === 'dialog').length, 1, 'inside click keeps panel');
  const trigger = summary(h.driver).props.ref.current;
  h.env.document.emit('keydown', { key: 'Escape' }); h.driver.flush();
  assert.equal(trigger.focusCount, 1); assert.equal(h.driver.nodes(node => node.props.role === 'dialog').length, 0);
  assert.equal(h.env.count('resize'), 0); assert.equal(h.env.count('scroll'), 0);
  assert.equal(h.env.document.count('pointerdown'), 0); assert.equal(h.env.document.count('keydown'), 0);
  h.driver.click(summary(h.driver)); h.env.document.emit('pointerdown', { target: {} }); h.driver.flush();
  assert.equal(summary(h.driver).props['aria-expanded'], false);
  h.driver.click(summary(h.driver)); h.driver.click(h.driver.one(node => node.props['aria-label'] === 'Close'));
  assert.equal(summary(h.driver).props['aria-expanded'], false);
});

test('MOCK hooks: current/routable changes clean detail listeners and unmount cleans stores/retain', async t => {
  const h = await mounted(t); await settle(h.driver); h.driver.click(summary(h.driver));
  h.directory.set({ current: current('claude-opus-4'), routable: true }); h.driver.flush();
  assert.equal(h.driver.nodes(node => node.props.role === 'dialog').length, 0);
  assert.equal(h.env.document.count('keydown'), 0);
  h.driver.click(summary(h.driver));
  assert.match(text(dialog(h.driver)), /Reset due; awaiting refreshed data/);
  assert.match(text(dialog(h.driver)), /Reset time unavailable/);
  h.directory.set({ current: current('claude-opus-4'), routable: false }); h.driver.flush();
  assert.equal(h.driver.tree, null); assert.equal(h.env.document.count('pointerdown'), 0);
  h.directory.set({ current: current(), routable: true }); h.driver.flush(); await settle(h.driver);
  h.driver.click(summary(h.driver)); h.driver.unmount(); await microtasks();
  assert.equal(h.directory.listenerCount(), 0); assert.equal(h.env.count(), 0); assert.equal(h.env.document.count(), 0);
  assert.equal(h.tasks.size, 0); assert.equal(h.controller.getSnapshot().snapshot, undefined);
  const renders = h.driver.renders; h.directory.set({ current: current() }); h.driver.flush(); assert.equal(h.driver.renders, renders);
});

test('MOCK hooks: malicious group.label is a literal text child, never executable markup', async t => {
  const label = 'Gemini <img src=x onerror="globalThis.pwned=true"><script>evil()</script>';
  const h = await mounted(t, () => snapshot({ geminiLabel: label })); await settle(h.driver); h.driver.click(summary(h.driver));
  const heading = h.driver.one(node => node.props.className === 'agQuotaHeading');
  assert.equal(heading.props.children[0].props.children[0], label, 'React must receive the original label as a string');
  assert.equal(h.driver.nodes(node => ['script', 'img', 'iframe'].includes(node.type)).length, 0);
  assert.equal(h.driver.nodes(node => Object.hasOwn(node.props, 'dangerouslySetInnerHTML')).length, 0);
  assert.match(text(dialog(h.driver)), /<script>evil\(\)<\/script>/);
});

test('MOCK hooks: failed refresh retains old values with warning; stale and signed-out statuses remain explicit', async t => {
  let response = snapshot({ fetchedAt: START - 120001 });
  const h = await mounted(t, () => response instanceof Error ? Promise.reject(response) : response); await settle(h.driver);
  assert.equal(summary(h.driver).props['data-warning'], 'true'); assert.match(summary(h.driver).props['aria-label'], /Older data/);
  response = new Error('offline failure'); await h.controller.refresh(true); await settle(h.driver);
  assert.deepEqual(windows(h.driver), [['5h', '81%'], ['weekly', '62%']]);
  assert.equal(summary(h.driver).props['data-warning'], 'true'); assert.match(summary(h.driver).props['aria-label'], /Refresh failed; showing previous data/);
  h.driver.click(summary(h.driver)); assert.match(text(h.driver.one(node => node.props.role === 'status')), /Refresh failed/);
  response = { configured: false }; h.controller.invalidate(); await settle(h.driver);
  assert.deepEqual(windows(h.driver), [['5h', '--'], ['weekly', '--']]);
  assert.match(summary(h.driver).props['aria-label'], /Not signed in/);
});

test('MOCK hooks: two consumers share controller flight, have unique ids and release independently', async t => {
  const pending = deferred(); let calls = 0;
  const h = await mounted(t, () => { calls++; return pending.promise; });
  const otherDriver = mockReactDriver();
  const otherLib = (await source).createAntiGravityComposerQuota(otherDriver.React, otherDriver.ReactDOM, h.env);
  const otherDirectory = store({ current: current('claude-opus-4'), routable: true });
  otherDriver.mount(otherLib.ComposerQuota, { directory: otherDirectory, controller: h.controller, t: h.translate });
  t.after(() => otherDriver.unmount());
  await settle(h.driver, otherDriver); assert.equal(calls, 1);
  pending.resolve(snapshot()); await settle(h.driver, otherDriver);
  assert.deepEqual(windows(h.driver), [['5h', '81%'], ['weekly', '62%']]);
  assert.deepEqual(windows(otherDriver), [['5h', '43%'], ['weekly', '24%']]);
  h.driver.click(summary(h.driver)); otherDriver.click(summary(otherDriver));
  assert.notEqual(dialog(h.driver).props.id, dialog(otherDriver).props.id);
  h.driver.unmount(); assert.ok(h.controller.getSnapshot().snapshot); assert.equal(h.env.count('focus'), 1);
  otherDriver.unmount(); await microtasks();
  assert.equal(h.controller.getSnapshot().snapshot, undefined); assert.equal(h.env.count(), 0);
  assert.equal(otherDirectory.listenerCount(), 0); assert.equal(h.tasks.size, 0);
});

async function registration(t, implementations = {}) {
  const time = fakeEnvironment(), driver = mockReactDriver();
  const lib = (await source).createAntiGravityComposerQuota(driver.React, driver.ReactDOM, time.env);
  const effects = [], events = new Map(), injected = [], registered = [], called = [], directories = new Map(), lookedUp = [];
  const api = {
    describe: async (...args) => { called.push(['describe', ...args]); return implementations.describe ? implementations.describe(...args) : snapshot(); },
  };
  for (const name of ['start', 'logout', 'setModelEnabled', 'poll']) {
    if (!Object.hasOwn(implementations, name)) continue;
    api[name] = async (...args) => { called.push([name, ...args]); return implementations[name](...args); };
  }
  const originals = { ...api };
  const ctx = {
    effect(create, label) { const cleanup = create(); effects.push({ cleanup, label }); return cleanup; },
    on(name, handler) { events.set(name, handler); return () => events.delete(name); },
    modelDirectories: { directoryFor(sessionId) {
      lookedUp.push(sessionId);
      if (!directories.has(sessionId)) directories.set(sessionId, { store: store({ current: current(), routable: true }) });
      return directories.get(sessionId);
    } },
    locale: { bind(namespace) { assert.equal(namespace, 'settings.antiGravity'); return key => lib.messages.en[key] || key; } },
    slots: {
      inject(slot, callback) { injected.push(slot); const cleanup = callback(); effects.push({ cleanup, label: 'mock slot lifecycle' }); },
      register(definition, Component) {
        const entry = { definition, Component }; registered.push(entry);
        return () => { const index = registered.indexOf(entry); if (index >= 0) registered.splice(index, 1); };
      },
    },
  };
  let cleaned = false;
  const controller = lib.register(ctx, api, 'settings.antiGravity');
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true; driver.unmount(); for (const item of [...effects].reverse()) item.cleanup?.();
  };
  t.after(async () => { cleanup(); await microtasks(); });
  return { ...time, lib, driver, ctx, api, originals, controller, cleanup, called, registered, injected, effects, events, directories, lookedUp };
}

test('register: only one composer-right slot/id; injected props use session directoryFor.store', async t => {
  const h = await registration(t);
  assert.deepEqual(h.injected, ['conversation.input.right']); assert.equal(h.registered.length, 1);
  const { definition, Component } = h.registered[0];
  assert.equal(definition.name, 'conversation.input.right'); assert.equal(definition.id, 'antigravity-composer-quota');
  assert.equal(new Set(h.registered.map(item => item.definition.id)).size, h.registered.length);
  assert.equal(h.registered.some(item => /model/.test(item.definition.name)), false);
  assert.equal(Component, h.lib.ComposerQuota); assert.equal(definition.locale, 'settings.antiGravity');
  const sessionId = { id: 'opaque-session-id' };
  const props = definition.inject(sessionId);
  assert.equal(h.lookedUp[0], sessionId); assert.equal(props.directory, h.directories.get(sessionId).store);
  assert.equal(props.controller, h.controller); assert.equal(props.t('agQuotaWeekly'), 'Weekly');
  const other = definition.inject('session-b'); assert.notEqual(other.directory, props.directory); assert.equal(other.controller, props.controller);
  assert.deepEqual(h.called, [], 'registration does not call settings, inference, auth or describe without a consumer');
  h.driver.mount(Component, props); await settle(h.driver);
  assert.deepEqual(h.called.map(call => call[0]), ['describe']);
  assert.deepEqual(windows(h.driver), [['5h', '81%'], ['weekly', '62%']]);
});

test('register: existing settings actions keep args/results, only invalidate; poll pending does not fetch', async t => {
  const result = { ok: true }, enabled = deferred();
  const h = await registration(t, {
    start: (...args) => { assert.deepEqual(args, ['explicit-user-start']); return result; },
    setModelEnabled: (...args) => { assert.deepEqual(args, ['gemini-3-pro', false]); return enabled.promise; },
    poll: kind => ({ kind }),
  });
  const { definition, Component } = h.registered[0]; h.driver.mount(Component, definition.inject('s')); await settle(h.driver);
  assert.equal(await h.api.start('explicit-user-start'), result); await settle(h.driver);
  assert.equal(h.called.filter(([name]) => name === 'describe').length, 2);
  const operation = h.api.setModelEnabled('gemini-3-pro', false); await settle(h.driver);
  assert.equal(h.controller.getSnapshot().snapshot, undefined, 'settings mutation invalidates prior account/model data immediately');
  enabled.resolve(result); assert.equal(await operation, result); await settle(h.driver);
  const before = h.called.filter(([name]) => name === 'describe').length;
  assert.deepEqual(await h.api.poll('pending'), { kind: 'pending' }); await settle(h.driver);
  assert.equal(h.called.filter(([name]) => name === 'describe').length, before);
  assert.deepEqual(await h.api.poll('complete'), { kind: 'complete' }); await settle(h.driver);
  assert.equal(h.called.filter(([name]) => name === 'describe').length, before + 1);
  assert.equal(h.api.logout, undefined, 'absent settings actions are not manufactured');
  assert.deepEqual(h.called.filter(([name]) => name !== 'describe').map(([name]) => name), ['start', 'setModelEnabled', 'poll', 'poll']);
});

test('register: rejected settings action is propagated and invalidates in finally without retrying the action', async t => {
  const failure = new Error('mock user-setting action failed');
  const h = await registration(t, { start: () => { throw failure; } });
  const release = h.controller.retain(); await microtasks();
  await assert.rejects(h.api.start('once'), error => error === failure); await microtasks();
  assert.equal(h.called.filter(([name]) => name === 'start').length, 1);
  assert.equal(h.called.filter(([name]) => name === 'describe').length, 2); release();
});

test('register: logout invalidates immediately, discards old account response and describes signed-out state', async t => {
  const old = deferred(), logout = deferred(); let descriptions = 0;
  const h = await registration(t, {
    describe: () => ++descriptions === 1 ? old.promise : { configured: false },
    logout: () => logout.promise,
  });
  const { definition, Component } = h.registered[0]; h.driver.mount(Component, definition.inject('s')); await settle(h.driver);
  const operation = h.api.logout(); await settle(h.driver);
  assert.equal(h.controller.getSnapshot().snapshot, undefined);
  old.resolve(snapshot()); await settle(h.driver); assert.equal(h.controller.getSnapshot().snapshot, undefined);
  logout.resolve(undefined); await operation; await settle(h.driver);
  assert.equal(descriptions, 2); assert.equal(h.controller.getSnapshot().status, 'unconfigured');
  assert.deepEqual(windows(h.driver), [['5h', '--'], ['weekly', '--']]);
  assert.match(summary(h.driver).props['aria-label'], /Not signed in/);
  assert.deepEqual(h.called.filter(([name]) => name !== 'describe'), [['logout']]);
});

test('register: effect cleanup restores existing API actions instead of leaving stacked hot-reload wrappers', async t => {
  const h = await registration(t, {
    start: () => ({ kind: 'started' }), logout: () => undefined,
    setModelEnabled: () => undefined, poll: () => ({ kind: 'pending' }),
  });
  for (const name of ['start', 'logout', 'setModelEnabled', 'poll']) assert.notEqual(h.api[name], h.originals[name]);
  h.cleanup(); await microtasks();
  for (const name of ['start', 'logout', 'setModelEnabled', 'poll']) {
    assert.equal(h.api[name], h.originals[name], `${name} must be restored when registration effects are disposed`);
  }
  assert.equal(h.api.describe, h.originals.describe, 'read-only describe is never replaced');
});

test('register: connection/reset invalidates, effects clean style/slots/listeners/timers and ignore late responses', async t => {
  const pending = deferred(); let calls = 0;
  const h = await registration(t, { describe: () => ++calls === 1 ? snapshot() : pending.promise });
  assert.equal(h.env.document.head.children.length, 1);
  const style = h.env.document.head.children[0]; assert.equal(style.tagName, 'style'); assert.equal(style.dataset.agQuotaStyle, '1');
  assert.equal(h.events.size, 1); assert.equal(h.events.has('connection/reset'), true);
  const { definition, Component } = h.registered[0]; h.driver.mount(Component, definition.inject('s')); await settle(h.driver);
  h.driver.click(summary(h.driver)); h.events.get('connection/reset')(); await settle(h.driver);
  assert.equal(calls, 2); assert.equal(h.controller.getSnapshot().snapshot, undefined);
  h.cleanup(); await microtasks(); pending.resolve(snapshot({ five: 1, week: 1 })); await microtasks();
  assert.equal(h.controller.getSnapshot().snapshot, undefined); assert.equal(h.env.document.head.children.length, 0);
  assert.equal(h.registered.length, 0); assert.equal(h.events.size, 0);
  assert.equal(h.env.count(), 0); assert.equal(h.env.document.count(), 0); assert.equal(h.tasks.size, 0);
  await h.controller.refresh(true); assert.equal(calls, 2);
});
