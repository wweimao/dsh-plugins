'use strict';
// Real installed Host SettingsForms -> JSON wire -> bundled browser Schema/forms.
// Synthetic profile only: no filesystem persistence, user settings, network or authorization.
// Run with ELECTRON_RUN_AS_NODE=1 '<installed DSH executable>' --test test/bridge.test.cjs.
// Ordinary Node intentionally skips: it cannot traverse Electron's installed app.asar.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const ROOT = '/Applications/DeepSeek Harness.app/Contents/Resources/app.asar/dsh/node_modules/';
const BROWSER = ROOT + '@deepseek-ai/dsh-client-ui-settings/lib/client.js';
const skip = process.versions.electron && fs.existsSync(BROWSER) ? false : 'Requires installed DSH Electron/ASAR; run with ELECTRON_RUN_AS_NODE=1';
const plain = value => JSON.parse(JSON.stringify(value));
const legacyDefaults = () => ({ activePresetId: '', presets: [] });
const defaults = () => ({ pool: { mode: 'all', models: [] }, ...legacyDefaults() });
const configured = (name = '跨渠道合成组合') => ({ pool: { mode: 'all', models: [] }, activePresetId: 'demo', presets: [{
  id: 'demo', name,
  main: { provider: 'fixture-codex', model: 'same', reasoningEffort: 'high' },
  executor: { provider: 'fixture-antigravity', model: 'same', reasoningEffort: 'medium' },
}] });

async function hostModule() {
  const core = await import(pathToFileURL(path.join(__dirname, '..', 'core.js')).href);
  const module = require(ROOT + '@deepseek-ai/schemastery');
  const z = module.default || module;
  // Read the actual workspace entrypoint, injecting only its real imported values.
  const source = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8')
    .replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
  const host = vm.runInNewContext(source + '\n({Config})', { z, ...core, AbortController, AbortSignal });
  return { ...host, z };
}

function syntheticHost(Config, initial = {}) {
  const { SettingsForms } = require(ROOT + '@deepseek-ai/dsh-settings/lib/index.js');
  let stored = plain(initial), writes = 0;
  const fiber = { uid: 'model-hub-bridge-fixture', state: 2, runtime: { Config }, effectiveConfig: Config(stored) };
  fiber.ctx = { fiber };
  const entry = { id: 'model-hub-bridge-fixture', options: { id: 'model-hub', config: stored }, fiber };
  fiber.entry = entry;
  // Avoid constructing the application owner: its constructor imports real legacy settings.
  // All actual SettingsForms describe/path mutation/CAS logic runs on this synthetic editor.
  const settings = Object.create(SettingsForms.prototype);
  settings.revisions = new Map(); settings.presentations = new Map(); settings.invalidate = () => {};
  settings.ownerContext = { emit() {}, configEditor: {
    configuration: () => [{ entry, inherited: {}, override: stored }], entries: () => [entry],
    async edit(_entry, change) {
      const next = change(stored, {});
      fiber.runtime.Config(next); // Same schema boundary as the Host editor, before any commit.
      stored = plain(next); writes++;
      entry.options.config = stored;
      fiber.effectiveConfig = fiber.runtime.Config(stored);
    },
  } };
  return {
    settings, get writes() { return writes; }, get stored() { return plain(stored); },
    describe: () => settings.describe({ redactSecrets: true }),
    replaceSchema(next) { fiber.runtime.Config = next; fiber.effectiveConfig = next(stored); },
  };
}

function browserBridge(host) {
  let definition;
  const realm = vm.createContext({ window: { __ModuleLoader__: { load: value => { definition = value; } } } });
  const copyIn = value => {
    realm.fixtureJSON = JSON.stringify(value);
    return vm.runInContext('JSON.parse(fixtureJSON)', realm);
  };
  // JSON-shaped settings clones must have browser-realm prototypes as they do after RPC.
  realm.structuredClone = copyIn;
  const source = fs.readFileSync(BROWSER, 'utf8');
  const marker = 'exports.apply = apply;';
  assert.equal(source.split(marker).length, 2, 'installed browser bundle instrumentation anchor changed');
  // No bundle file is edited. Export otherwise-private real classes in this VM copy only.
  vm.runInContext(source.replace(marker, 'exports.bridgeInternals = { SettingsSchemaService, SettingsDescribeMirror, ConfigForms };\n' + marker), realm);
  class Service { constructor(ctx, name) { this.ctx = ctx; ctx[name] = this; } }
  // The only infrastructure substitutes are Cordis ownership and a snapshot store.
  // Schema validation, form derive/recovery/write queues and the describe mirror are real.
  function createSnapshotStore(initial) {
    let value = initial; const listeners = new Set();
    return {
      getSnapshot: () => value,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      set(next) { value = next; for (const listener of listeners) listener(); },
      update(recipe) { const next = { ...value }; recipe(next); this.set(next); },
    };
  }
  const browser = definition.factory(id => {
    if (id === '@deepseek-ai/cordis') return { Service };
    if (id === '@deepseek-ai/dsh-client-store') return { createSnapshotStore };
    throw new Error('Unexpected browser dependency: ' + id);
  }).bridgeInternals;
  const effects = [], mutations = [], events = new Map();
  let describes = 0, catalogs = 0, served = false, directory = { groups: [], failures: [] };
  const listen = (name, fn) => { if (!events.has(name)) events.set(name, new Set()); events.get(name).add(fn); return () => events.get(name).delete(fn); };
  const ctx = {
    effect(fn) { const dispose = fn(); effects.push(dispose); }, on: listen,
    remote: {
      $on: listen,
      session: { async modelCatalog() { catalogs++; return copyIn({ ok: true, value: directory }); } },
      settings: {
        async describe() { describes++; return copyIn({ ok: true, value: { writable: host.settings.writable, namespaces: host.describe() } }); },
        async mutate(namespace, ops, revision) {
          assert.equal(namespace, 'model-hub', 'bridge must never touch native authorization or another namespace');
          const owned = plain(ops); mutations.push({ namespace, ops: owned, revision });
          try {
            // Cross the JSON boundary in the opposite direction, back into Host's realm.
            await host.settings.mutate(namespace, owned, revision);
            return copyIn({ ok: true, value: host.describe().find(row => row.ns === namespace) });
          } catch (error) {
            return copyIn({ ok: false, error: { code: error.code || 'INVALID_CONFIG', message: 'Synthetic settings write refused' } });
          }
        },
      },
    },
  };
  const schema = new browser.SettingsSchemaService(ctx);
  const mirror = new browser.SettingsDescribeMirror(ctx);
  const forms = new browser.ConfigForms(ctx, { schema, mirror });
  const form = forms.get('model-hub');
  const stopServed = forms.whileServed(['model-hub'], () => { served = true; return () => { served = false; }; });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8'), realm);
  const ui = definition.factory(id => { assert.equal(id, 'react'); return {}; });
  const controller = new ui.ModelHubController(ctx);
  return {
    ctx, schema, mirror, forms, form, controller, mutations, copyIn, setCatalog(value) { directory = plain(value); },
    get describes() { return describes; }, get catalogs() { return catalogs; }, get served() { return served; },
    async dispose() { controller.dispose(); stopServed(); for (const off of effects.reverse()) await off?.(); },
  };
}

// This deliberately reproduces the pre-fix module-closure dependency. Host invocation
// succeeds, but callback.toString() cannot carry `object` into the browser's realm.
function object(value) { if (!value || typeof value !== 'object') throw new Error('fixture object'); }
function legacyClosureNormalizer(value = {}) {
  object(value);
  return { activePresetId: value.activePresetId ?? '', presets: value.presets ?? [] };
}

test('real bridge negative control: closure transform serves namespace but leaves form loading', { skip }, async () => {
  const { z } = await hostModule();
  const Config = z.object({ state: z.transform(z.any(), legacyClosureNormalizer, true).default(legacyDefaults()).volatile() });
  const host = syntheticHost(Config), bridge = browserBridge(host);
  try {
    await bridge.mirror.ensure();
    assert.equal(bridge.describes, 1); assert.equal(bridge.served, true);
    const row = bridge.mirror.namespace('model-hub');
    assert.deepEqual(plain(row.value), { state: legacyDefaults() });
    // Two independent serialization defects: raw callback loses its lexical closure;
    // SettingsForms' additional rehydrate/toJSON drops callback.toJSON and then the key.
    assert.equal(bridge.schema.validate(bridge.schema.rehydrate(bridge.copyIn(Config.toJSON())), row.value), 'object is not defined');
    assert.equal(bridge.schema.validate(bridge.schema.rehydrate(row.schema), row.value), 'callback is not a function');
    assert.equal(bridge.form.getSnapshot().status, 'loading');
    assert.equal(bridge.form.getSnapshot().value, undefined);
    assert.equal(bridge.form.getSnapshot().revision, 0);
    assert.equal(bridge.form.getSnapshot().writable, true);
    assert.equal(bridge.controller.getSnapshot().available, false);
    assert.equal(bridge.controller.getSnapshot().configInvalid, true);
    assert.equal(host.writes, 0);
  } finally { await bridge.dispose(); }
});

test('real bridge: fixed Host schema reaches ready/defaults automatically through get and whileServed', { skip }, async () => {
  const { Config } = await hostModule(), host = syntheticHost(Config), bridge = browserBridge(host);
  try {
    assert.equal(bridge.form.getSnapshot().status, 'loading');
    await bridge.mirror.ensure(); // Observe the read already initiated by ConfigForms.get.
    assert.equal(bridge.describes, 1); assert.equal(bridge.served, true);
    const row = bridge.mirror.namespace('model-hub');
    assert.equal(bridge.schema.validate(bridge.schema.rehydrate(row.schema), row.value), undefined);
    assert.equal(bridge.form.getSnapshot().status, 'ready');
    assert.deepEqual(plain(bridge.form.getSnapshot().value), { state: defaults() });
    assert.equal(bridge.controller.getSnapshot().available, true);
    assert.equal(bridge.controller.getSnapshot().configInvalid, false);
    assert.equal(bridge.controller.getSnapshot().writable, true);
    assert.equal(bridge.controller.getSnapshot().nativeAvailable, false);
    assert.equal(bridge.catalogs, 0); assert.equal(host.writes, 0);
  } finally { await bridge.dispose(); }
});

test('real bridge: validator remains strict through repeated native schema rehydrate/serialization', { skip }, async () => {
  const { Config, z } = await hostModule(), host = syntheticHost(Config), bridge = browserBridge(host);
  try {
    await bridge.mirror.ensure();
    let schema = Config;
    for (let cycle = 1; cycle <= 3; cycle++) {
      schema = new z(schema.toJSON());
      const decoded = bridge.schema.rehydrate(bridge.copyIn(schema.toJSON()));
      assert.equal(bridge.schema.validate(decoded, bridge.copyIn({ state: configured() })), undefined, `round trip ${cycle} must keep the callback executable`);
      assert.match(bridge.schema.validate(decoded, bridge.copyIn({ state: { ...configured(), secret: 'NEVER_STORE' } })), /Invalid model-hub configuration/);
    }
    assert.equal(host.writes, 0);
  } finally { await bridge.dispose(); }
});

test('real bridge: one complete-state CAS round trip updates mirror and remains ready', { skip }, async () => {
  const { Config } = await hostModule(), host = syntheticHost(Config), bridge = browserBridge(host);
  try {
    await bridge.mirror.ensure();
    const revision = bridge.form.getSnapshot().revision;
    assert.equal(await bridge.form.mutate(bridge.copyIn([{ op: 'set', path: ['state'], value: configured() }]), revision), true);
    assert.equal(host.writes, 1); assert.equal(bridge.mutations.length, 1);
    assert.deepEqual(bridge.mutations[0], { namespace: 'model-hub', revision, ops: [{ op: 'set', path: ['state'], value: configured() }] });
    assert.deepEqual(host.stored, { state: configured() });
    assert.deepEqual(plain(bridge.form.getSnapshot().value), { state: configured() });
    assert.equal(bridge.form.getSnapshot().status, 'ready');
    assert.equal(bridge.form.getSnapshot().revision, revision + 1);
    assert.equal(bridge.describes, 1, 'accepted write folds its view without a recovery describe');
    assert.equal(bridge.controller.getSnapshot().config.activePresetId, 'demo');
    assert.equal(bridge.controller.getSnapshot().config.presets[0].reviewer, undefined);
  } finally { await bridge.dispose(); }
});

test('real bridge: actual model-hub controller saves a draft through the real form queue and Host validator', { skip }, async () => {
  const { Config } = await hostModule(), host = syntheticHost(Config, { state: configured() }), bridge = browserBridge(host);
  try {
    await bridge.mirror.ensure();
    bridge.controller.edit('demo'); bridge.controller.editField('name', '真正往返后的名称');
    assert.equal(await bridge.controller.save(), true);
    assert.equal(host.writes, 1); assert.equal(bridge.mutations.length, 1);
    assert.deepEqual(bridge.mutations[0].ops.map(op => op.path), [['state']]);
    assert.equal(bridge.mutations[0].revision, 0);
    assert.equal(host.stored.state.presets[0].name, '真正往返后的名称');
    assert.equal(bridge.controller.getSnapshot().editor, null);
    assert.equal(bridge.controller.getSnapshot().config.presets[0].name, '真正往返后的名称');
    assert.equal(bridge.form.getSnapshot().status, 'ready'); assert.equal(bridge.catalogs, 0);
  } finally { await bridge.dispose(); }
});

test('real bridge: client-rehydrated schema and Host both reject secrets, dangling activity and malformed roles', { skip }, async () => {
  const { Config } = await hostModule(), host = syntheticHost(Config, { state: configured() }), bridge = browserBridge(host);
  try {
    await bridge.mirror.ensure();
    const good = configured(), revision = bridge.form.getSnapshot().revision;
    const badStates = [
      { ...good, apiKey: 'NEVER_STORE' },
      { ...good, presets: [{ ...good.presets[0], password: 'NEVER_STORE' }] },
      { ...good, presets: [{ ...good.presets[0], executor: { ...good.presets[0].executor, accessToken: 'NEVER_STORE' } }] },
      { ...good, activePresetId: 'missing' },
      { ...good, presets: [good.presets[0], good.presets[0]] },
      { ...good, presets: [{ ...good.presets[0], reviewer: {} }] },
      { ...good, presets: [{ ...good.presets[0], name: 'control\n' }] },
      { ...good, pool: null }, { ...good, pool: {} },
      { ...good, pool: { mode: 'all', models: [{ provider: 'p', model: 'm' }] } },
      { ...good, pool: { mode: 'selected', models: [{ provider: 'p', model: 'm' }, { provider: 'p', model: 'm' }] } },
      { ...good, pool: { mode: 'selected', models: [{ provider: 'p', model: 'm', accessToken: 'NEVER_STORE' }] } },
      { ...good, pool: { mode: 'selected', models: [{ provider: 'p', model: 'm', reasoningEffort: 'high' }] } },
    ];
    for (const state of badStates) {
      const row = bridge.mirror.namespace('model-hub');
      const failure = bridge.schema.validate(bridge.schema.rehydrate(row.schema), bridge.copyIn({ state }));
      assert.match(failure, /Invalid model-hub configuration/);
      assert.doesNotMatch(failure, /NEVER_STORE/);
      assert.equal(await bridge.form.mutate(bridge.copyIn([{ op: 'set', path: ['state'], value: state }]), revision), false);
      assert.equal(bridge.form.getSnapshot().status, 'ready');
      assert.equal(bridge.form.getSnapshot().revision, revision);
      assert.deepEqual(host.stored, { state: good });
    }
    assert.equal(host.writes, 0);
    assert.equal(bridge.mutations.length, badStates.length, 'one rejected request per explicit attempt, no auto retry');
    assert.doesNotMatch(JSON.stringify(host.describe()), /NEVER_STORE/);
  } finally { await bridge.dispose(); }
});

test('real bridge: native CAS rejection recovers current state and preserves the controller draft', { skip }, async () => {
  const { Config } = await hostModule(), host = syntheticHost(Config, { state: configured() }), bridge = browserBridge(host);
  try {
    await bridge.mirror.ensure();
    bridge.controller.edit('demo'); bridge.controller.editField('name', '未覆盖草稿');
    await host.settings.mutate('model-hub', [{ op: 'set', path: ['state'], value: configured('外部更新') }], 0);
    assert.equal(await bridge.controller.save(), false);
    assert.equal(host.writes, 1, 'only the simulated other editor committed');
    assert.equal(bridge.mutations.length, 1); assert.equal(bridge.mutations[0].revision, 0);
    assert.equal(bridge.describes, 2, 'the real form performs one recovery describe');
    assert.equal(bridge.form.getSnapshot().status, 'ready');
    assert.equal(bridge.controller.getSnapshot().config.presets[0].name, '外部更新');
    assert.equal(bridge.controller.getSnapshot().editor.value.name, '未覆盖草稿');
    assert.equal(bridge.controller.getSnapshot().editor.conflicted, true);
    assert.equal(bridge.controller.getSnapshot().editor.revision, 0);
  } finally { await bridge.dispose(); }
});

test('real bridge: legacy stored state gains all-pool defaults in projection without migration writes', { skip }, async () => {
  const { Config } = await hostModule(), legacy = configured(); delete legacy.pool;
  const host = syntheticHost(Config, { state: legacy }), bridge = browserBridge(host);
  try {
    await bridge.mirror.ensure();
    assert.equal(bridge.form.getSnapshot().status, 'ready');
    assert.deepEqual(plain(bridge.form.getSnapshot().value.state), configured());
    assert.deepEqual(plain(bridge.controller.current().pool), { mode: 'all', models: [] });
    assert.deepEqual(host.stored, { state: legacy });
    assert.equal(host.writes, 0); assert.equal(bridge.mutations.length, 0);
    bridge.controller.setPoolMode('selected'); assert.equal(await bridge.controller.savePool(), true);
    assert.deepEqual(host.stored, { state: { ...configured(), pool: { mode: 'selected', models: [] } } });
    assert.equal(host.writes, 1); assert.equal(bridge.mutations.length, 1);
  } finally { await bridge.dispose(); }
});

test('real bridge: dynamic selected pool saves more than three identities and survives template edits/deletion', { skip }, async () => {
  const { Config } = await hostModule(), host = syntheticHost(Config, { state: configured() }), bridge = browserBridge(host);
  const models = [
    { provider: 'fixture-codex', model: 'same' }, { provider: 'fixture-codex', model: 'other' },
    { provider: 'fixture-antigravity', model: 'same' },
    { provider: 'third', model: 'same' }, { provider: 'third', model: 'writer' },
  ];
  bridge.setCatalog({ groups: [...new Set(models.map(r => r.provider))].map(id => ({ id, name: id, models: models.filter(r => r.provider === id).map(r => ({ id: r.model, name: r.model })) })), failures: [] });
  try {
    await bridge.mirror.ensure(); await bridge.controller.refreshCatalog();
    bridge.controller.setPoolMode('selected');
    for (const model of models) bridge.controller.togglePoolModel(bridge.copyIn(model), true);
    assert.equal(await bridge.controller.savePool(), true);
    assert.deepEqual(host.stored.state.pool, { mode: 'selected', models });
    assert.deepEqual(host.stored.state.presets, configured().presets);
    assert.equal(host.stored.state.activePresetId, 'demo');
    bridge.controller.edit('demo'); bridge.controller.editField('name', '保留完整池'); assert.equal(await bridge.controller.save(), true);
    assert.deepEqual(host.stored.state.pool, { mode: 'selected', models });
    bridge.controller.requestDelete('demo'); assert.equal(await bridge.controller.confirmDelete(), true);
    assert.deepEqual(host.stored.state, { pool: { mode: 'selected', models }, activePresetId: '', presets: [] });
    assert.equal(host.writes, 3); assert.equal(bridge.mutations.length, 3);
    for (const mutation of bridge.mutations) {
      assert.equal(mutation.namespace, 'model-hub'); assert.equal(mutation.ops.length, 1);
      assert.deepEqual(mutation.ops[0].path, ['state']);
      assert.deepEqual(Object.keys(mutation.ops[0].value), ['pool', 'activePresetId', 'presets']);
    }
    assert.equal(bridge.form.getSnapshot().status, 'ready');
  } finally { await bridge.dispose(); }
});

test('real bridge: pool CAS conflict recovers external template change and preserves the pool draft', { skip }, async () => {
  const { Config } = await hostModule(), host = syntheticHost(Config, { state: configured() }), bridge = browserBridge(host);
  try {
    await bridge.mirror.ensure(); bridge.controller.setPoolMode('selected');
    await host.settings.mutate('model-hub', [{ op: 'set', path: ['state'], value: configured('外部模板更新') }], 0);
    assert.equal(await bridge.controller.savePool(), false);
    assert.equal(host.writes, 1); assert.equal(bridge.mutations.length, 1);
    assert.deepEqual(plain(bridge.controller.poolEditor.value), { mode: 'selected', models: [] });
    assert.equal(bridge.controller.poolEditor.conflicted, true); assert.equal(bridge.controller.poolEditor.revision, 0);
    assert.equal(bridge.controller.current().presets[0].name, '外部模板更新');
    assert.deepEqual(plain(bridge.controller.current().pool), { mode: 'all', models: [] });
    assert.equal(bridge.form.getSnapshot().status, 'ready'); assert.equal(bridge.describes, 2);
  } finally { await bridge.dispose(); }
});

test('real bridge: selected identities remain strict and intact through three browser schema round trips', { skip }, async () => {
  const { Config, z } = await hostModule(), host = syntheticHost(Config), bridge = browserBridge(host);
  const state = { ...configured(), pool: { mode: 'selected', models: [{ provider: 'p', model: 'same' }, { provider: 'q', model: 'same' }] } };
  try {
    await bridge.mirror.ensure(); let schema = Config;
    for (let cycle = 0; cycle < 3; cycle++) {
      schema = new z(schema.toJSON());
      const decoded = bridge.schema.rehydrate(bridge.copyIn(schema.toJSON()));
      assert.equal(bridge.schema.validate(decoded, bridge.copyIn({ state })), undefined);
      const bad = { ...state, pool: { ...state.pool, models: [state.pool.models[0], state.pool.models[0]] } };
      assert.match(bridge.schema.validate(decoded, bridge.copyIn({ state: bad })), /Invalid model-hub configuration/);
    }
    assert.equal(host.writes, 0); assert.equal(bridge.mutations.length, 0);
  } finally { await bridge.dispose(); }
});

test('real bridge: replacing broken Host schema then refreshing makes the existing controller ready', { skip }, async () => {
  const { Config, z } = await hostModule();
  const broken = z.object({ state: z.transform(z.any(), legacyClosureNormalizer, true).default(legacyDefaults()).volatile() });
  const host = syntheticHost(broken), bridge = browserBridge(host);
  try {
    await bridge.mirror.ensure(); assert.equal(bridge.form.getSnapshot().status, 'loading');
    host.replaceSchema(Config); await bridge.mirror.load();
    assert.equal(bridge.form.getSnapshot().status, 'ready');
    assert.equal(bridge.controller.getSnapshot().available, true);
    assert.equal(bridge.controller.getSnapshot().configInvalid, false);
    assert.equal(bridge.controller.getSnapshot().writable, true);
    assert.equal(bridge.served, true); assert.equal(bridge.describes, 2);
    assert.equal(host.writes, 0); assert.equal(bridge.mutations.length, 0);
  } finally { await bridge.dispose(); }
});
