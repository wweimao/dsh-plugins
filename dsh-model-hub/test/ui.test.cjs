'use strict';
// Offline tests: no browser, credentials, network or native Agent execution.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const clone = value => JSON.parse(JSON.stringify(value));
let definition;
const source = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8');
const React = {
  Fragment: Symbol('Fragment'),
  createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
  useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
};
vm.runInNewContext(source, { window: { __ModuleLoader__: { load: value => { definition = value; } } } }, { filename: 'client.js' });
const ui = definition.factory(id => { assert.equal(id, 'react'); return React; });
const preset = (id = 'coding') => ({ id, name: '跨渠道代码组合', main: { provider: 'codex', model: 'same', reasoningEffort: 'high' }, executor: { provider: 'antigravity', model: 'same', reasoningEffort: 'medium' }, reviewer: { provider: 'codex', model: 'same', reasoningEffort: 'low' } });
const catalog = () => ({ groups: [
  { id: 'codex', name: 'Codex', models: [{ id: 'same', name: '同名模型', reasoning: { efforts: [{ id: 'low', name: '低' }, { id: 'high', name: '高' }] } }, { id: 'other', name: '另一模型', reasoning: { efforts: [{ id: 'minimal', name: '最少' }] } }] },
  { id: 'antigravity', name: 'Antigravity App', models: [{ id: 'same', name: '同名模型', reasoning: { efforts: [{ id: 'medium', name: '中' }] } }] },
], failures: [] });
function form(value) {
  let snapshot = { status: 'ready', writable: true, revision: 'rev-1', value: clone(value) };
  const listeners = new Set(); let sequence = 1;
  const result = {
    calls: [], handler: undefined,
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    emit(patch) { snapshot = { ...snapshot, ...clone(patch) }; for (const listener of listeners) listener(); },
    async mutate(ops, revision) {
      result.calls.push({ ops: clone(ops), revision });
      if (result.handler) return result.handler(ops, revision);
      if (revision !== snapshot.revision || !snapshot.writable || snapshot.status !== 'ready') return false;
      const value = clone(snapshot.value);
      for (const op of ops) { assert.equal(op.op, 'set'); assert.equal(op.path.length, 1); value[op.path[0]] = clone(op.value); }
      result.emit({ value, revision: `rev-${++sequence}` });
      return true;
    },
    listenerCount: () => listeners.size,
  };
  return result;
}
function fixture(options = {}) {
  const own = form({ state: options.config ?? { activePresetId: 'coding', presets: [preset()] } });
  const ownMutate = own.mutate.bind(own);
  own.mutate = (ops, revision) => {
    assert.equal(ops.length, 1, 'own namespace must write one atomic state value');
    assert.deepEqual(clone(ops[0].path), ['state']);
    assert.equal(ops[0].op, 'set');
    assert.ok(Array.isArray(ops[0].value.presets));
    assert.equal(typeof ops[0].value.activePresetId, 'string');
    assert.deepEqual(Object.keys(ops[0].value), ['pool', 'activePresetId', 'presets'], 'all writes retain canonical complete state');
    return ownMutate(ops, revision);
  };
  const native = form(options.native ?? { enabled: false, allowedModels: [{ provider: 'legacy', model: 'kept' }, { provider: 'codex', model: 'same' }] });
  const events = new Map(); const effects = []; let directory = catalog(), loader, loads = 0;
  const mirror = { error: null, loads: 0, getSnapshot: () => ({ status: 'ready', error: mirror.error }), async load() { mirror.loads++; if (mirror.handler) await mirror.handler(); } };
  const subscribe = (name, listener) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(listener); return () => events.get(name).delete(listener); };
  const ctx = {
    remote: { session: { async modelCatalog() { loads++; return loader ? loader() : { ok: true, value: clone(directory) }; } }, $on: subscribe },
    on: subscribe,
    configForms: { get(name) { if (name === 'model-hub') return own; assert.equal(name, 'subagent-model-selection-settings'); return native; }, describe: () => mirror,
      whileServed(names, register) { assert.deepEqual(Array.from(names), ['model-hub']); const dispose = register(); return () => dispose(); } },
    effect(fn) { const off = fn(); effects.push(off); },
    slots: { inject(name, register) { assert.equal(name, 'settings.section'); return register(); }, register(spec, render) { ctx.registration = { spec, render }; return () => { ctx.registration = null; }; } },
  };
  const controller = new ui.ModelHubController(ctx);
  return { ctx, own, native, mirror, controller, effects, events, get loads() { return loads; }, setCatalog(value) { directory = value; }, setLoader(value) { loader = value; }, emit(name) { for (const fn of events.get(name) ?? []) fn(); } };
}
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function expand(node) {
  if (!node || typeof node !== 'object') return node;
  if (typeof node.type === 'function') return expand(node.type(node.props));
  return { ...node, props: { ...node.props, children: node.props.children.map(expand) } };
}
function nodes(node) { return !node || typeof node !== 'object' ? [] : [node, ...node.props.children.flatMap(nodes)]; }
function content(node) { return node == null || node === false ? '' : typeof node !== 'object' ? String(node) : node.props.children.map(content).join(' '); }
function page(f) { return expand(React.createElement(ui.Page, { controller: f.controller })); }

test('module mounts only the served model-hub settings section using public dependencies', async () => {
  assert.equal(definition.id, '@local/dsh-model-hub');
  assert.deepEqual(Array.from(ui.inject), ['slots', 'remote', 'remote.session', 'configForms']);
  const f = fixture(); f.controller.dispose(); ui.apply(f.ctx);
  assert.equal(f.ctx.registration.spec.id, 'model-hub');
  assert.equal(f.ctx.registration.spec.name, 'settings.section');
  assert.equal(f.own.calls.length + f.native.calls.length, 0);
  for (const off of f.effects.reverse()) off();
  assert.equal(f.ctx.registration, null);
  assert.equal(f.own.listenerCount() + f.native.listenerCount(), 0);
  assert.doesNotMatch(source, /session\.selectModel|fetch\(|XMLHttpRequest|localStorage|sessionStorage|remote\.subagent/);
});

test('own configuration reads the atomic state envelope and never falls back to legacy root fields', () => {
  const f = fixture();
  assert.equal(f.controller.getSnapshot().config.presets[0].id, 'coding');
  f.own.emit({ value: { activePresetId: 'coding', presets: [preset()] } });
  assert.equal(f.controller.getSnapshot().configInvalid, true);
  assert.equal(f.controller.getSnapshot().writable, false);
  assert.equal(f.native.calls.length + f.own.calls.length, 0);
  f.controller.dispose();
});

test('malformed atomic states fail closed without rendering or silently stripping unknown secrets', () => {
  const base = { activePresetId: 'coding', presets: [preset()] };
  for (const bad of [
    { ...base, apiKey: 'SHOULD_NEVER_RENDER' },
    { ...base, presets: [{ ...preset(), password: 'SHOULD_NEVER_RENDER' }] },
    { ...base, presets: [{ ...preset(), main: { ...preset().main, token: 'SHOULD_NEVER_RENDER' } }] },
    { ...base, presets: [preset(), preset()] },
    { ...base, activePresetId: 'missing' },
    { ...base, presets: [{ ...preset(), reviewer: {} }] },
    { ...base, presets: 'invalid' },
  ]) {
    const f = fixture({ config: bad });
    assert.throws(() => ui.configOf(bad));
    assert.equal(f.controller.getSnapshot().configInvalid, true);
    assert.equal(f.controller.getSnapshot().writable, false);
    assert.doesNotMatch(content(page(f)), /SHOULD_NEVER_RENDER/);
    assert.equal(f.own.calls.length + f.native.calls.length, 0); f.controller.dispose();
  }
});

test('same model names under distinct providers remain separate identities and native efforts', async () => {
  const f = fixture(); await f.controller.refreshCatalog();
  const p = preset(); assert.notEqual(ui.keyOf(p.main), ui.keyOf(p.executor));
  assert.deepEqual(clone(ui.unionRoutes([], p)), [{ provider: 'codex', model: 'same' }, { provider: 'antigravity', model: 'same' }]);
  assert.equal(ui.routeIssue(f.controller.catalog, p.main), '');
  assert.match(ui.routeIssue(f.controller.catalog, { ...p.executor, reasoningEffort: 'high' }), /档位/);
  assert.equal(f.controller.catalog.groups[0].models[0].efforts[0].id, 'low');
  f.controller.dispose();
});

test('changing a role provider/model clears old effort without affecting other roles', async () => {
  const f = fixture(); await f.controller.refreshCatalog(); f.controller.edit('coding');
  f.controller.selectRole('main', 'model', 'other');
  assert.deepEqual(clone(f.controller.editor.value.main), { provider: 'codex', model: 'other' });
  f.controller.selectRole('main', 'reasoningEffort', 'minimal');
  assert.equal(f.controller.editor.value.main.reasoningEffort, 'minimal');
  f.controller.selectRole('main', 'provider', 'antigravity');
  assert.deepEqual(clone(f.controller.editor.value.main), { provider: 'antigravity', model: '' });
  f.controller.selectRole('main', 'model', 'same');
  f.controller.selectRole('main', 'reasoningEffort', 'high');
  assert.equal(f.controller.editor.value.main.reasoningEffort, undefined);
  assert.equal(f.controller.editor.value.executor.reasoningEffort, 'medium');
  f.controller.selectRole('main', 'reasoningEffort', 'medium');
  f.controller.selectRole('main', 'reasoningEffort', '');
  assert.equal(f.controller.editor.value.main.reasoningEffort, undefined);
  f.controller.setReviewer(false); assert.equal(f.controller.editor.value.reviewer, undefined);
  f.controller.setReviewer(true); assert.deepEqual(clone(f.controller.editor.value.reviewer), { provider: '', model: '' });
  f.controller.dispose();
});

test('editing, saving and activating use only own namespace with fixed CAS', async () => {
  const f = fixture(); await f.controller.refreshCatalog();
  f.controller.edit('coding'); f.controller.editField('name', '新名称');
  assert.equal(await f.controller.save(), true);
  assert.equal(f.own.calls[0].revision, 'rev-1');
  assert.equal(f.own.getSnapshot().value.state.presets[0].name, '新名称');
  assert.equal(f.controller.editor, null);
  assert.equal(await f.controller.activate(''), true);
  assert.equal(f.own.calls[1].revision, 'rev-2');
  assert.equal(f.native.calls.length, 0);
  assert.equal(f.loads, 1, 'saving and activating do not probe or run a model');
  f.controller.dispose();
});

test('CAS conflict preserves draft and revision, never rebases silently over another edit', async () => {
  const f = fixture(); f.controller.edit('coding'); f.controller.editField('name', '保留草稿');
  f.own.emit({ revision: 'external-rev', value: { state: { activePresetId: 'coding', presets: [{ ...preset(), name: '另一个窗口' }] } } });
  assert.equal(await f.controller.save(), false);
  assert.equal(f.own.calls.length, 0);
  assert.equal(f.controller.editor.value.name, '保留草稿');
  assert.equal(f.controller.editor.revision, 'rev-1');
  assert.equal(f.controller.editor.conflicted, true);
  await f.controller.reloadSettings(); assert.equal(f.controller.editor.value.name, '保留草稿');
  f.controller.discard(); f.controller.edit('coding');
  assert.equal(f.controller.editor.value.name, '另一个窗口');
  assert.equal(f.controller.editor.revision, 'external-rev');
  f.controller.dispose();
});

test('refused or rejected save retains draft without retry or secret error rendering', async () => {
  for (const throws of [false, true]) {
    const f = fixture(); f.controller.edit('coding'); f.controller.editField('name', '仍未保存');
    f.own.handler = async () => { if (throws) throw new Error('SECRET_DIAGNOSTIC'); return false; };
    assert.equal(await f.controller.save(), false);
    assert.equal(f.controller.editor.value.name, '仍未保存');
    assert.equal(f.own.calls.length, 1);
    assert.doesNotMatch(content(page(f)), /SECRET_DIAGNOSTIC/);
    f.controller.dispose();
  }
});

test('deleted active preset clears activity but never revokes existing native authorizations', async () => {
  const f = fixture(); f.controller.requestDelete('coding');
  assert.equal(f.own.calls.length, 0); assert.equal(await f.controller.confirmDelete(), true);
  assert.deepEqual(f.own.getSnapshot().value.state, { pool: { mode: 'all', models: [] }, activePresetId: '', presets: [] });
  assert.equal(f.native.calls.length, 0);
  f.controller.dispose();
});

test('delete confirmation does not silently overwrite concurrent configuration', async () => {
  const f = fixture(); f.controller.requestDelete('coding'); f.own.emit({ revision: 'changed' });
  assert.equal(await f.controller.confirmDelete(), false);
  assert.equal(f.own.calls.length, 0); assert.ok(f.controller.deletion);
  f.controller.dispose();
});

test('authorization preparation is read-only; unchecked or cancelled confirmation never writes', async () => {
  const f = fixture(); assert.equal(await f.controller.prepareAuthorization('coding'), true);
  assert.equal(f.loads, 1); assert.equal(f.mirror.loads, 1);
  assert.deepEqual(clone(f.controller.authorization.routes), [
    { provider: 'legacy', model: 'kept' }, { provider: 'codex', model: 'same' }, { provider: 'antigravity', model: 'same' },
  ]);
  assert.equal(await f.controller.confirmAuthorization(), false);
  assert.equal(f.native.calls.length + f.own.calls.length, 0);
  const tree = page(f), text = content(tree);
  assert.match(text, /legacy \/ kept/); assert.match(text, /此前保存但可能未启用/);
  const confirm = nodes(tree).find(n => n.type === 'button' && content(n) === '确认合并原生授权');
  assert.equal(confirm.props.disabled, true);
  f.controller.consent(true); f.controller.cancelAuthorization();
  assert.equal(await f.controller.confirmAuthorization(), false);
  assert.equal(f.native.calls.length, 0); f.controller.dispose();
});

test('explicit confirmed authorization rechecks catalog and unions old routes, deduplicating roles', async () => {
  const f = fixture(); await f.controller.prepareAuthorization('coding'); f.controller.consent(true);
  assert.equal(await f.controller.confirmAuthorization(), true);
  assert.equal(f.loads, 2, 'fresh catalog immediately before CAS');
  assert.equal(f.native.calls.length, 1); assert.equal(f.native.calls[0].revision, 'rev-1');
  assert.deepEqual(f.native.calls[0].ops.map(op => op.path), [['enabled'], ['allowedModels']], 'native authorization retains its existing two-field atomic contract');
  assert.deepEqual(f.native.getSnapshot().value, { enabled: true, allowedModels: [
    { provider: 'legacy', model: 'kept' }, { provider: 'codex', model: 'same' }, { provider: 'antigravity', model: 'same' },
  ] });
  assert.equal(f.own.calls.length, 0);
  assert.match(f.controller.notice, /仅之后创建的新顶级会话/);
  assert.match(f.controller.notice, /旧会话权限不变/);
  assert.equal(f.controller.authorization, null); f.controller.dispose();
});

test('authorization failure/CAS rejection is attempted once and does not modify preset or roll back', async () => {
  const f = fixture(); await f.controller.prepareAuthorization('coding'); f.controller.consent(true);
  f.native.handler = async () => { f.native.emit({ revision: 'changed', value: { enabled: true, allowedModels: [{ provider: 'elsewhere', model: 'new' }] } }); return false; };
  assert.equal(await f.controller.confirmAuthorization(), false);
  assert.equal(f.native.calls.length, 1); assert.equal(f.own.calls.length, 0);
  assert.deepEqual(f.native.getSnapshot().value.allowedModels, [{ provider: 'elsewhere', model: 'new' }]);
  assert.equal(f.controller.authorization, null); assert.match(f.controller.error, /未自动重试/);
  f.controller.dispose();
});

test('model disappearance, provider failure and effort removal block final authorization', async () => {
  for (const change of [
    c => { c.groups[1].models = []; },
    c => { c.groups.pop(); c.failures.push({ id: 'antigravity', name: 'Antigravity', message: 'SECRET_FAILURE' }); },
    c => { c.groups[1].models[0].reasoning.efforts = []; },
  ]) {
    const f = fixture(); await f.controller.prepareAuthorization('coding'); f.controller.consent(true);
    const changed = catalog(); change(changed); f.setCatalog(changed);
    assert.equal(await f.controller.confirmAuthorization(), false);
    assert.equal(f.native.calls.length, 0); assert.equal(f.own.getSnapshot().value.state.presets.length, 1);
    assert.doesNotMatch(content(page(f)), /SECRET_FAILURE/); f.controller.dispose();
  }
});

test('unrelated partial directory failure does not prevent an exact valid authorization', async () => {
  const f = fixture(); const c = catalog(); c.failures = [{ id: 'unrelated', name: '其他渠道', message: 'raw' }]; f.setCatalog(c);
  assert.equal(await f.controller.prepareAuthorization('coding'), true); f.controller.consent(true);
  assert.equal(await f.controller.confirmAuthorization(), true); assert.equal(f.native.calls.length, 1);
  f.controller.dispose();
});

test('catalog failure shows retained presets but denies authorization and does not leak raw diagnostics', async () => {
  const f = fixture(); await f.controller.refreshCatalog(); f.setLoader(async () => ({ ok: false, error: { message: 'SECRET_URL' } }));
  assert.equal(await f.controller.prepareAuthorization('coding'), false);
  const text = content(page(f)); assert.match(text, /目录读取失败/); assert.match(text, /跨渠道代码组合/); assert.doesNotMatch(text, /SECRET_URL/);
  assert.equal(f.native.calls.length, 0); f.controller.dispose();
});

test('a dependency invalidation removes the confirmation and never grants newly discovered models', async () => {
  const f = fixture(); await f.controller.prepareAuthorization('coding'); f.controller.consent(true);
  const c = catalog(); c.groups[0].models.push({ id: 'newly-discovered', name: '新发现' }); f.setCatalog(c);
  f.emit('llm/adapters-updated');
  assert.equal(f.controller.authorization, null);
  assert.equal(await f.controller.confirmAuthorization(), false);
  assert.equal(f.native.calls.length, 0); f.controller.dispose();
});

test('native setting changes while dialog is open invalidate consent rather than merging unshown routes', async () => {
  const f = fixture(); await f.controller.prepareAuthorization('coding'); f.controller.consent(true);
  f.native.emit({ revision: 'new-native', value: { enabled: false, allowedModels: [{ provider: 'surprise', model: 'new' }] } });
  assert.equal(f.controller.authorization, null); assert.equal(await f.controller.confirmAuthorization(), false);
  assert.equal(f.native.calls.length, 0); f.controller.dispose();
});

test('pending final catalog check is cancelled by scope change, connection reset or disposal', async () => {
  for (const kind of ['scope', 'reset', 'dispose']) {
    const f = fixture(); await f.controller.prepareAuthorization('coding'); f.controller.consent(true);
    const gate = deferred(); f.setLoader(() => gate.promise);
    const result = f.controller.confirmAuthorization();
    if (kind === 'scope') f.own.emit({ status: 'unavailable' });
    else if (kind === 'dispose') f.controller.dispose();
    else { f.setLoader(async () => ({ ok: true, value: catalog() })); await f.controller.resetConnection(); }
    gate.resolve({ ok: true, value: catalog() });
    assert.equal(await result, false); assert.equal(f.native.calls.length, 0);
    if (kind !== 'dispose') f.controller.dispose();
  }
});

test('read-only or unserved native settings cannot be authorized, while own preset editing remains independent', async () => {
  for (const patch of [{ status: 'unavailable' }, { writable: false }, { revision: undefined }, { revision: null }]) {
    const f = fixture();
    // Missing/null revisions must not fall through to the shared form's latest-revision default.
    if (Object.hasOwn(patch, 'revision')) { f.native.getSnapshot().revision = patch.revision; } else f.native.emit(patch);
    assert.equal(await f.controller.prepareAuthorization('coding'), false);
    assert.equal(f.native.calls.length, 0);
    f.controller.edit('coding'); f.controller.editField('name', '只改组合'); assert.equal(await f.controller.save(), true);
    f.controller.dispose();
  }
});

test('reconnect keeps the draft but blocks reuse of its CAS even if new host revision has same spelling', async () => {
  const f = fixture(); f.controller.edit('coding'); f.controller.editField('name', '跨连接保留草稿');
  await f.controller.resetConnection();
  assert.equal(f.controller.editor.value.name, '跨连接保留草稿'); assert.equal(f.controller.editor.conflicted, true);
  assert.equal(await f.controller.save(), false); assert.equal(f.own.calls.length, 0);
  f.controller.dispose();
});

test('out-of-order catalog responses cannot restore removed providers or stale efforts', async () => {
  const f = fixture(); const gate = deferred(); f.setLoader(() => gate.promise);
  const old = f.controller.refreshCatalog(); f.setLoader(async () => ({ ok: true, value: { groups: [], failures: [] } }));
  await f.controller.refreshCatalog(); gate.resolve({ ok: true, value: catalog() });
  assert.equal(await old, false); assert.equal(f.controller.catalog.groups.length, 0); f.controller.dispose();
});

test('strict route/preset bounds, optional reviewer and 16-preset maximum are enforced', async () => {
  for (const bad of [{ provider: '', model: 'm' }, { provider: 'p', model: 'm\n' }, { provider: 'p'.repeat(161), model: 'm' }, { provider: 'p', model: 'm'.repeat(257) }, { provider: 'p', model: 'm', reasoningEffort: '' }, { provider: 'p', model: 'm', reasoningEffort: 'x'.repeat(65) }]) assert.throws(() => ui.routeOf(bad));
  assert.throws(() => ui.presetOf({ ...preset(), id: 'UPPER' })); assert.throws(() => ui.presetOf({ ...preset(), name: 'x'.repeat(81) }));
  const noReviewer = preset(); delete noReviewer.reviewer; assert.equal(ui.presetOf(noReviewer).reviewer, undefined);
  assert.throws(() => ui.configOf({ activePresetId: '', presets: Array.from({ length: 17 }, (_, i) => preset(`p-${i}`)) }));
  const f = fixture({ config: { activePresetId: '', presets: Array.from({ length: 16 }, (_, i) => preset(`p-${i}`)) } });
  f.controller.edit(); assert.equal(f.controller.editor, null); assert.match(f.controller.error, /16/); f.controller.dispose();
});

test('saved unavailable routes and invalid effort remain visible and editable without silent fallback', async () => {
  const f = fixture(); await f.controller.refreshCatalog(); f.controller.edit('coding');
  const c = catalog(); c.groups[0].models[0].reasoning.efforts = []; c.groups.pop(); f.setCatalog(c); await f.controller.refreshCatalog();
  const text = content(page(f)); assert.match(text, /已失效/); assert.match(text, /antigravity（不可用）/);
  assert.equal(f.controller.editor.value.main.reasoningEffort, 'high'); assert.equal(f.controller.editor.value.executor.provider, 'antigravity');
  f.controller.editField('name', '暂不可用记录'); assert.equal(await f.controller.save(), true);
  assert.equal(await f.controller.prepareAuthorization('coding'), false); f.controller.dispose();
});

test('new preset requires both mandatory roles and saves without automatically activating or authorizing', async () => {
  const f = fixture({ config: { activePresetId: '', presets: [] } }); await f.controller.refreshCatalog();
  f.controller.edit(); f.controller.editField('name', '新组合');
  assert.equal(await f.controller.save(), false); assert.equal(f.own.calls.length, 0);
  f.controller.selectRole('main', 'provider', 'codex'); f.controller.selectRole('main', 'model', 'same');
  f.controller.selectRole('executor', 'provider', 'antigravity'); f.controller.selectRole('executor', 'model', 'same');
  assert.equal(await f.controller.save(), true);
  assert.deepEqual(f.own.getSnapshot().value.state, { pool: { mode: 'all', models: [] }, activePresetId: '', presets: [{ id: 'preset-1', name: '新组合', main: { provider: 'codex', model: 'same' }, executor: { provider: 'antigravity', model: 'same' } }] });
  assert.equal(f.native.calls.length, 0); f.controller.dispose();
});

test('rapid repeated final confirmation is single-flight and grants no additional discovered models', async () => {
  const f = fixture(); await f.controller.prepareAuthorization('coding'); f.controller.consent(true);
  const gate = deferred(); f.setLoader(() => gate.promise);
  const first = f.controller.confirmAuthorization(); assert.equal(await f.controller.confirmAuthorization(), false);
  const latest = catalog(); latest.groups[0].models.push({ id: 'brand-new', name: '新发现模型' });
  gate.resolve({ ok: true, value: latest }); assert.equal(await first, true);
  assert.equal(f.native.calls.length, 1);
  assert.equal(f.native.getSnapshot().value.allowedModels.some(r => r.model === 'brand-new'), false);
  f.controller.dispose();
});

const allPool = () => ({ mode: 'all', models: [] });
const poolState = (pool = allPool(), presets = []) => ({ pool, activePresetId: presets[0]?.id ?? '', presets });
const selectedPool = (...models) => ({ mode: 'selected', models });
const codexSame = { provider: 'codex', model: 'same' };
const antiSame = { provider: 'antigravity', model: 'same' };
function multiCatalog() {
  const c = catalog();
  c.groups.push({ id: 'third-provider', name: '第三渠道', models: [{ id: 'same', name: '同名模型' }, { id: 'writer', name: '写作模型' }] });
  return c;
}
function poolFixture(pool = allPool(), presets = []) {
  const f = fixture({ config: poolState(pool, presets) }); f.setCatalog(multiCatalog()); return f;
}

test('old state migrates to all candidates in memory without writing, authorizing or requiring templates', async () => {
  const f = fixture({ config: { activePresetId: '', presets: [] } }); await f.controller.refreshCatalog();
  assert.deepEqual(clone(f.controller.getSnapshot().config), poolState());
  assert.equal(Object.hasOwn(f.own.getSnapshot().value.state, 'pool'), false, 'reading is not a migration write');
  assert.equal(f.own.calls.length + f.native.calls.length, 0);
  const tree = page(f); assert.match(content(tree), /无需创建角色模板/);
  const templates = nodes(tree).find(n => n.type === 'details' && content(n).includes('可选角色模板'));
  assert.equal(templates.props.open, undefined);
  assert.ok(nodes(tree).some(n => n.type === 'button' && content(n) === '授权池给新会话' && !n.props.disabled));
  f.controller.dispose();
});

test('pool validation rejects malformed, duplicate, credential and effort identities instead of stripping them', () => {
  for (const pool of [null, {}, { mode: 'all' }, { models: [] }, { mode: 'unknown', models: [] },
    { mode: 'all', models: [codexSame] }, selectedPool(codexSame, codexSame),
    selectedPool({ ...codexSame, reasoningEffort: 'high' }), selectedPool({ ...codexSame, token: 'SECRET' }),
    { ...selectedPool(codexSame), extra: true }, selectedPool({ provider: 'bad\n', model: 'same' }),
    { mode: 'selected', models: Array.from({ length: 4097 }, (_, i) => ({ provider: 'p', model: `m-${i}` })) },
  ]) assert.throws(() => ui.configOf(poolState(pool)));
  assert.throws(() => ui.configOf({ ...poolState(), pool: undefined }));
  assert.deepEqual(clone(ui.poolOf(selectedPool(codexSame, antiSame))), selectedPool(codexSame, antiSame));
  assert.deepEqual(clone(ui.poolOf(selectedPool())), selectedPool());
});

test('dynamic all pool discovers more than three cross-provider models and filters without changing membership', async () => {
  const f = poolFixture(); await f.controller.refreshCatalog();
  assert.equal(ui.poolCandidates(f.controller.catalog, allPool()).length, 5);
  assert.equal(ui.poolRows(f.controller.catalog, allPool()).filter(r => r.model === 'same').length, 3);
  f.controller.setPoolFilter('provider', 'third-provider'); f.controller.setPoolFilter('query', 'WRITER');
  const rows = ui.poolRows(f.controller.catalog, allPool(), f.controller.filter);
  assert.equal(rows.length, 1); assert.equal(rows[0].model, 'writer');
  const c = multiCatalog(); c.groups.push({ id: 'discovered', name: '新渠道', models: [{ id: 'fresh', name: '新模型' }] }); f.setCatalog(c);
  await f.controller.refreshCatalog(); assert.equal(ui.poolCandidates(f.controller.catalog, allPool()).length, 6);
  assert.equal(f.own.calls.length + f.native.calls.length, 0); f.controller.dispose();
});

test('pool save preserves templates; template save, activity and deletion preserve the selected pool', async () => {
  const f = poolFixture(allPool(), [preset()]); await f.controller.refreshCatalog();
  f.controller.setPoolMode('selected'); f.controller.togglePoolModel(codexSame, true); f.controller.togglePoolModel(codexSame, true); f.controller.togglePoolModel(antiSame, true);
  assert.equal(await f.controller.savePool(), true);
  assert.deepEqual(f.own.getSnapshot().value.state, poolState(selectedPool(codexSame, antiSame), [preset()]));
  f.controller.edit('coding'); f.controller.editField('name', '仅改模板'); assert.equal(await f.controller.save(), true);
  assert.deepEqual(f.own.getSnapshot().value.state.pool, selectedPool(codexSame, antiSame));
  assert.equal(await f.controller.activate(''), true);
  f.controller.requestDelete('coding'); assert.equal(await f.controller.confirmDelete(), true);
  assert.deepEqual(f.own.getSnapshot().value.state, poolState(selectedPool(codexSame, antiSame)));
  assert.equal(f.native.calls.length, 0); f.controller.dispose();
});

test('selected pool preserves unavailable identities and permits explicit removal but never substitutes another provider', async () => {
  const missing = { provider: 'closed', model: 'same' }, f = poolFixture(selectedPool(codexSame, missing)); await f.controller.refreshCatalog();
  const row = ui.poolRows(f.controller.catalog, f.controller.current().pool).find(r => r.provider === 'closed');
  assert.equal(row.selected, true); assert.match(row.issue, /不可用/);
  assert.equal(await f.controller.preparePoolAuthorization(), false);
  f.controller.togglePoolModel(missing, false); assert.equal(await f.controller.savePool(), true);
  assert.deepEqual(f.own.getSnapshot().value.state.pool, selectedPool(codexSame));
  assert.equal(f.native.calls.length, 0); f.controller.dispose();
});

test('filter-to-subset is explicit, saves empty subsets, and cannot authorize an unsaved pool draft', async () => {
  const f = poolFixture(); await f.controller.refreshCatalog();
  f.controller.setPoolFilter('provider', 'third-provider'); f.controller.selectFilteredPool();
  assert.equal(f.controller.poolEditor.value.models.length, 2);
  const reads = f.loads; assert.equal(await f.controller.preparePoolAuthorization(), false); assert.equal(f.loads, reads);
  assert.equal(await f.controller.savePool(), true);
  f.controller.setPoolFilter('query', 'no-match'); f.controller.selectFilteredPool();
  assert.deepEqual(clone(f.controller.poolEditor.value), selectedPool()); assert.equal(await f.controller.savePool(), true);
  assert.equal(await f.controller.preparePoolAuthorization(), false);
  assert.equal(f.native.calls.length, 0); f.controller.dispose();
});

test('pool draft CAS conflict, refused write and reconnect preserve the full unsaved selection', async () => {
  for (const kind of ['conflict', 'refusal', 'reconnect']) {
    const f = poolFixture(); await f.controller.refreshCatalog(); f.controller.setPoolMode('selected'); f.controller.togglePoolModel(antiSame, true);
    if (kind === 'conflict') f.own.emit({ revision: 'elsewhere', value: { state: poolState(allPool(), [preset()]) } });
    if (kind === 'refusal') f.own.handler = async () => false;
    if (kind === 'reconnect') await f.controller.resetConnection();
    assert.equal(await f.controller.savePool(), false);
    assert.deepEqual(clone(f.controller.poolEditor.value), selectedPool(antiSame));
    assert.equal(f.controller.poolEditor.revision, 'rev-1');
    assert.equal(f.own.calls.length, kind === 'refusal' ? 1 : 0);
    if (kind !== 'refusal') assert.equal(f.controller.poolEditor.conflicted, true);
    assert.equal(f.native.calls.length, 0); f.controller.dispose();
  }
});

test('full pool confirmation shows all five candidates and complete old union even under a UI filter', async () => {
  const f = poolFixture(); f.controller.setPoolFilter('provider', 'codex');
  assert.equal(await f.controller.preparePoolAuthorization(), true);
  assert.equal(f.controller.authorization.kind, 'pool'); assert.equal(f.controller.authorization.candidates.length, 5);
  assert.equal(f.controller.authorization.routes.length, 6);
  assert.equal(await f.controller.confirmAuthorization(), false); assert.equal(f.native.calls.length, 0);
  const tree = page(f), lists = nodes(tree).filter(n => n.type === 'ul');
  assert.match(content(lists.find(n => n.props['aria-label'] === '本次候选完整清单')), /third-provider \/ writer/);
  assert.match(content(lists.find(n => n.props['aria-label'] === '合并后完整原生授权清单')), /legacy \/ kept/);
  f.controller.consent(true); assert.equal(await f.controller.confirmAuthorization(), true);
  assert.equal(f.loads, 2); assert.equal(f.native.calls.length, 1); assert.equal(f.native.calls[0].revision, 'rev-1');
  assert.equal(f.native.getSnapshot().value.allowedModels.length, 6);
  assert.equal(f.own.calls.length, 0); f.controller.dispose();
});

test('all-pool authorization fails closed for incomplete or empty directory but selected visible subset may proceed', async () => {
  const c = multiCatalog(); c.failures.push({ id: 'failed-provider', name: '失败渠道' });
  const all = poolFixture(); all.setCatalog(c);
  assert.equal(await all.controller.preparePoolAuthorization(), false); assert.match(all.controller.error, /目录不完整/); assert.equal(all.native.calls.length, 0); all.controller.dispose();
  const subset = poolFixture(selectedPool(codexSame, antiSame)); subset.setCatalog(c);
  assert.equal(await subset.controller.preparePoolAuthorization(), true); subset.controller.consent(true);
  assert.equal(await subset.controller.confirmAuthorization(), true); assert.equal(subset.native.calls.length, 1); subset.controller.dispose();
  const empty = poolFixture(); empty.setCatalog({ groups: [], failures: [] });
  assert.equal(await empty.controller.preparePoolAuthorization(), false); assert.equal(empty.native.calls.length, 0); empty.controller.dispose();
});

test('all-pool final catalog additions, removals, replacement identities and partial failures revoke old consent', async () => {
  for (const change of [
    c => c.groups[0].models.push({ id: 'new', name: '新模型' }),
    c => c.groups[0].models.pop(),
    c => { c.groups[0].models[0].id = 'replacement'; },
    c => { c.failures.push({ id: 'failed', name: '失败渠道' }); },
  ]) {
    const f = poolFixture(); await f.controller.preparePoolAuthorization(); f.controller.consent(true);
    const next = multiCatalog(); change(next); f.setCatalog(next);
    assert.equal(await f.controller.confirmAuthorization(), false);
    assert.equal(f.controller.authorization, null); assert.equal(f.native.calls.length, 0); assert.match(f.controller.error, /旧确认已撤销/);
    f.controller.dispose();
  }
});

test('pool compares exact candidate sets, not catalog order or newly discovered models outside selected subset', async () => {
  const all = poolFixture(); await all.controller.preparePoolAuthorization(); all.controller.consent(true);
  const reordered = multiCatalog(); reordered.groups.reverse(); reordered.groups.forEach(g => g.models.reverse()); all.setCatalog(reordered);
  assert.equal(await all.controller.confirmAuthorization(), true); all.controller.dispose();
  const subset = poolFixture(selectedPool(antiSame)); await subset.controller.preparePoolAuthorization(); subset.controller.consent(true);
  const added = multiCatalog(); added.groups[0].models.push({ id: 'new', name: '不在子集中' }); subset.setCatalog(added);
  assert.equal(await subset.controller.confirmAuthorization(), true);
  assert.equal(subset.native.getSnapshot().value.allowedModels.some(r => r.model === 'new'), false); subset.controller.dispose();
});

test('selected candidate disappearing at final confirmation blocks authorization', async () => {
  const f = poolFixture(selectedPool(antiSame)); await f.controller.preparePoolAuthorization(); f.controller.consent(true);
  const c = multiCatalog(); c.groups.splice(1, 1); f.setCatalog(c);
  assert.equal(await f.controller.confirmAuthorization(), false); assert.equal(f.native.calls.length, 0); f.controller.dispose();
});

test('cancel, pool editing, external native revision and pool change invalidate or refuse consent without writes', async () => {
  for (const kind of ['cancel', 'edit', 'native', 'pool']) {
    const f = poolFixture(); await f.controller.preparePoolAuthorization(); f.controller.consent(true);
    if (kind === 'cancel') f.controller.cancelAuthorization();
    if (kind === 'edit') f.controller.setPoolMode('selected');
    if (kind === 'native') f.native.emit({ revision: 'elsewhere' });
    if (kind === 'pool') f.own.emit({ value: { state: poolState(selectedPool(codexSame)) } }); // Same-revision corruption must still fail closed.
    assert.equal(await f.controller.confirmAuthorization(), false); assert.equal(f.native.calls.length, 0); f.controller.dispose();
  }
});

test('pool final preflight cannot write after dependency unload, readonly native settings, reset or disposal', async () => {
  for (const kind of ['scope', 'native', 'reset', 'dispose']) {
    const f = poolFixture(); await f.controller.preparePoolAuthorization(); f.controller.consent(true);
    const gate = deferred(); f.setLoader(() => gate.promise); const result = f.controller.confirmAuthorization();
    if (kind === 'scope') f.own.emit({ status: 'unavailable' });
    if (kind === 'native') f.native.emit({ writable: false });
    if (kind === 'reset') { f.setLoader(async () => ({ ok: true, value: multiCatalog() })); await f.controller.resetConnection(); }
    if (kind === 'dispose') f.controller.dispose();
    gate.resolve({ ok: true, value: multiCatalog() }); assert.equal(await result, false); assert.equal(f.native.calls.length, 0);
    if (kind !== 'dispose') f.controller.dispose();
  }
});

test('pool authorization is single-flight and CAS refusal never retries or rolls back old native routes', async () => {
  const f = poolFixture(); await f.controller.preparePoolAuthorization(); f.controller.consent(true);
  const gate = deferred(); f.setLoader(() => gate.promise); const first = f.controller.confirmAuthorization();
  assert.equal(await f.controller.confirmAuthorization(), false);
  f.native.handler = async () => { f.native.emit({ revision: 'external', value: { enabled: true, allowedModels: [{ provider: 'other-editor', model: 'keep' }] } }); return false; };
  gate.resolve({ ok: true, value: multiCatalog() }); assert.equal(await first, false);
  assert.equal(f.native.calls.length, 1); assert.deepEqual(f.native.getSnapshot().value.allowedModels, [{ provider: 'other-editor', model: 'keep' }]);
  assert.equal(f.controller.authorization, null); assert.equal(f.own.calls.length, 0); f.controller.dispose();
});

test('shrinking a saved pool does not revoke already granted native authorization', async () => {
  const f = poolFixture(); await f.controller.preparePoolAuthorization(); f.controller.consent(true); assert.equal(await f.controller.confirmAuthorization(), true);
  const authorized = clone(f.native.getSnapshot().value);
  f.controller.setPoolMode('selected'); assert.equal(await f.controller.savePool(), true);
  assert.deepEqual(f.own.getSnapshot().value.state.pool, selectedPool());
  assert.deepEqual(f.native.getSnapshot().value, authorized); assert.equal(f.native.calls.length, 1);
  assert.equal(await f.controller.preparePoolAuthorization(), false); f.controller.dispose();
});

test('large all pools are not truncated to the selected-state bound and display pagination never narrows consent', async () => {
  const wide = { groups: [{ id: 'wide', name: '宽目录', models: Array.from({ length: 4097 }, (_, i) => ({ id: `m-${i}`, name: `模型 ${i}` })) }], failures: [] };
  assert.equal(ui.poolCandidates(ui.catalogOf(wide), allPool()).length, 4097);
  const f = poolFixture(); f.setCatalog({ groups: [{ ...wide.groups[0], models: wide.groups[0].models.slice(0, 211) }], failures: [] });
  await f.controller.refreshCatalog();
  const body = nodes(page(f)).find(n => n.type === 'tbody'); assert.equal(body.props.children.length, 100);
  f.controller.setPoolPage(2); assert.equal(nodes(page(f)).find(n => n.type === 'tbody').props.children.length, 11);
  assert.equal(await f.controller.preparePoolAuthorization(), true);
  assert.equal(f.controller.authorization.candidates.length, 211, 'authorization ignores display pagination');
  assert.equal(f.native.calls.length + f.own.calls.length, 0); f.controller.dispose();
});

test('pool dependency disappearance retains its draft and prevents save until the namespace is ready', async () => {
  const f = poolFixture(); await f.controller.refreshCatalog(); f.controller.setPoolMode('selected'); f.controller.togglePoolModel(codexSame, true);
  f.own.emit({ status: 'unavailable' });
  assert.equal(await f.controller.savePool(), false); assert.deepEqual(clone(f.controller.poolEditor.value), selectedPool(codexSame));
  assert.equal(f.own.calls.length, 0); assert.equal(f.native.calls.length, 0);
  f.controller.setPoolMode('all'); assert.deepEqual(clone(f.controller.poolEditor.value), selectedPool(codexSame));
  f.controller.dispose();
});

test('final authorization refresh discovers silent server changes before any pool or template CAS', async () => {
  for (const kind of ['pool', 'template']) for (const changed of ['native', 'own']) {
    const f = kind === 'pool' ? poolFixture() : fixture();
    assert.equal(await (kind === 'pool' ? f.controller.preparePoolAuthorization() : f.controller.prepareAuthorization('coding')), true);
    f.controller.consent(true);
    // No settings notification has reached the mirror. Only the explicit final read
    // discovers these synthetic server-side changes, after the final catalog refresh.
    f.mirror.handler = async () => {
      assert.equal(f.loads, 2, 'final settings read follows final catalog refresh');
      if (changed === 'native') f.native.emit({ revision: 'silent-native', value: { enabled: false, allowedModels: [{ provider: 'remote-only', model: 'unseen' }] } });
      else {
        const state = clone(f.controller.current());
        if (kind === 'pool') state.pool = selectedPool(codexSame); else state.presets[0].name = '服务端静默更新';
        f.own.emit({ revision: 'silent-own', value: { state } });
      }
    };
    assert.equal(await f.controller.confirmAuthorization(), false);
    assert.equal(f.mirror.loads, 2); assert.equal(f.native.calls.length + f.own.calls.length, 0);
    assert.equal(f.controller.authorization, null); f.controller.dispose();
  }
});

test('final settings describe failure revokes confirmation and never falls back to cached permission values', async () => {
  for (const throws of [false, true]) {
    const f = poolFixture(); await f.controller.preparePoolAuthorization(); f.controller.consent(true);
    f.mirror.handler = async () => { if (throws) throw new Error('SECRET_READ_FAILURE'); f.mirror.error = 'SECRET_READ_FAILURE'; };
    assert.equal(await f.controller.confirmAuthorization(), false);
    assert.equal(f.mirror.loads, 2); assert.equal(f.native.calls.length + f.own.calls.length, 0);
    assert.equal(f.controller.authorization, null); assert.doesNotMatch(content(page(f)), /SECRET_READ_FAILURE/);
    f.controller.dispose();
  }
});

test('final settings read cannot issue authorization after disposal or a connection generation change', async () => {
  for (const kind of ['dispose', 'reset']) {
    const f = poolFixture(); await f.controller.preparePoolAuthorization(); f.controller.consent(true);
    const gate = deferred(), entered = deferred();
    f.mirror.handler = async () => { if (f.mirror.loads === 2) { entered.resolve(); await gate.promise; } };
    const result = f.controller.confirmAuthorization(); await entered.promise;
    if (kind === 'dispose') f.controller.dispose(); else await f.controller.resetConnection();
    gate.resolve(); assert.equal(await result, false);
    assert.equal(f.native.calls.length + f.own.calls.length, 0);
    if (kind !== 'dispose') f.controller.dispose();
  }
});

test('confirmation has exact provider/model list, future-session warning and no implicit execution control', async () => {
  const f = fixture(); await f.controller.prepareAuthorization('coding');
  const text = content(page(f));
  for (const pattern of [/codex \/ same/, /antigravity \/ same/, /legacy \/ kept/, /仅新会话/, /手动选择/, /未进行真实调用验证/, /不会自动获得授权/, /保存组合 ≠ 授权 ≠ 开始运行/]) assert.match(text, pattern);
  assert.doesNotMatch(text, /立即执行组合|自动开始推理/);
  assert.equal(f.native.calls.length + f.own.calls.length, 0); f.controller.dispose();
});
