import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { normalizeState, normalizeRoute, validateHubValue, routeKey, presetRoutes, childArguments, describePresets, safeError, abortable } from '../core.js';
const main = { provider: 'openai-codex', model: 'gpt-test' };
const executor = { provider: 'google-antigravity', model: 'gemini-3.8-flash', reasoningEffort: 'medium' };
const preset = () => ({ id: 'codex-flash', name: 'Codex + Flash', main: { ...main }, executor: { ...executor } });
const state = () => ({ activePresetId: 'codex-flash', presets: [preset()] });
function registry(overrides = {}) {
  const calls = [];
  return { calls,
    listProviders() { calls.push(['providers']); return [{ id: main.provider }, { id: executor.provider }]; },
    async listModels(provider) { calls.push(['models', provider]); return [{ id: provider === main.provider ? main.model : executor.model }]; },
    async resolveCallConfig(route, signal) { calls.push(['resolve', { ...route }, signal]); return { ...route }; },
    prepareCall() { throw Error('Inference must never be prepared by model-hub'); },
    stream() { throw Error('Inference must never run in model-hub'); },
    ...overrides,
  };
}
test('empty defaults and detached valid presets', () => {
  assert.deepEqual(normalizeState(), { pool: { mode: 'all', models: [] }, activePresetId: '', presets: [] });
  const input = state(), copy = normalizeState(input); copy.presets[0].executor.model = 'different';
  assert.equal(input.presets[0].executor.model, executor.model);
});
test('reject secrets, unknown keys, controls, empty/oversized and duplicate state', () => {
  const bad = [null, [], { apiKey: 'secret' }, { activePresetId: 'missing' }, { presets: Array(17).fill(preset()) }, { presets: [preset(), preset()] },
    { presets: [{ ...preset(), id: 'not valid' }] }, { presets: [{ ...preset(), name: 'x'.repeat(81) }] },
    { presets: [{ ...preset(), executor: { ...executor, accessToken: 'secret' } }] },
    { presets: [{ ...preset(), executor: { ...executor, model: 'x\0y' } }] },
    { presets: [{ ...preset(), executor: { ...executor, reasoningEffort: '' } }] },
    { presets: [{ ...preset(), executor: { provider: 'x', model: 'x'.repeat(257) } }] },
  ];
  for (const value of bad) assert.throws(() => normalizeState(value), { code: 'INVALID_CONFIG' });
  assert.throws(() => normalizeRoute(Object.create(executor)), { code: 'INVALID_CONFIG' });
});
test('serialized validator runs without module closures and keeps strict invariants', () => {
  const code = `(${validateHubValue.toString()})(JSON.parse(input))`;
  const decoded = vm.runInNewContext(code, { input: JSON.stringify(state()) });
  assert.deepEqual(JSON.parse(JSON.stringify(decoded)), normalizeState(state()));
  for (const bad of [{ ...state(), activePresetId: 'missing' }, { ...state(), accessToken: 'never-persist' }, { presets: [preset(), preset()] }]) {
    assert.throws(() => vm.runInNewContext(code, { input: JSON.stringify(bad) }), { code: 'INVALID_CONFIG' });
  }
});
test('exact route identities, dedup across effort, no provider collisions', () => {
  assert.notEqual(routeKey({ provider: 'a', model: 'same' }), routeKey({ provider: 'b', model: 'same' }));
  assert.deepEqual(presetRoutes({ ...preset(), reviewer: { ...executor, reasoningEffort: 'high' } }), [main, { provider: executor.provider, model: executor.model }]);
  assert.deepEqual(childArguments(executor), { provider: executor.provider, model: executor.model, reasoning_effort: 'medium' });
  assert.deepEqual(childArguments(main), main);
});
test('empty state performs no registry calls', async () => {
  const llm = registry(); const result = await describePresets(llm, {});
  assert.deepEqual(result.presets, []); assert.equal(llm.calls.length, 0);
});
test('describes real routes and does not infer, grant, select or fallback', async () => {
  const llm = registry(), result = await describePresets(llm, state());
  const roles = result.presets[0].roles;
  assert.equal(roles.main.status, 'catalogued'); assert.equal(roles.main.subagentArguments, undefined);
  assert.deepEqual(roles.executor.subagentArguments, childArguments(executor));
  assert.match(result.guidance.authorization, /NOT session authorization/);
  assert.match(result.guidance.availability, /NOT a successful inference/);
});
test('same model name in another provider is not a match', async () => {
  const llm = registry({ async listModels(provider) { return [{ id: provider === main.provider ? executor.model : 'other' }]; } });
  const result = await describePresets(llm, state());
  assert.equal(result.presets[0].roles.executor.status, 'model-not-advertised');
  assert.equal(result.presets[0].roles.executor.subagentArguments, undefined);
  assert.equal(llm.calls.filter(call => call[0] === 'resolve').length, 0);
});
test('provider unload and model disable are visible on the next read', async () => {
  const llm = registry(); assert.equal((await describePresets(llm, state())).presets[0].roles.executor.status, 'catalogued');
  llm.listProviders = () => [{ id: main.provider }];
  assert.equal((await describePresets(llm, state())).presets[0].roles.executor.status, 'provider-unavailable');
  llm.listProviders = () => [{ id: main.provider }, { id: executor.provider }];
  llm.listModels = async () => [];
  assert.equal((await describePresets(llm, state())).presets[0].roles.executor.status, 'model-not-advertised');
});
test('catalog failures are isolated and do not expose provider exceptions', async () => {
  const llm = registry({ async listModels(provider) { if (provider === executor.provider) throw Error('SECRET_TOKEN'); return [{ id: main.model }]; } });
  const result = await describePresets(llm, state());
  assert.equal(result.presets[0].roles.main.status, 'catalogued');
  assert.equal(result.presets[0].roles.executor.status, 'catalog-unavailable');
  assert.ok(!JSON.stringify(result).includes('SECRET_TOKEN'));
});
test('effort rejection is explicit and never clamps or copies another route', async () => {
  const llm = registry({ async resolveCallConfig(route) { if (route.reasoningEffort) throw Error('Unsupported effort and SECRET'); return { ...route }; } });
  const result = await describePresets(llm, state());
  assert.equal(result.presets[0].roles.executor.status, 'parameters-unavailable');
  assert.equal(result.presets[0].roles.executor.reasoningEffort, 'medium');
  assert.equal(result.presets[0].roles.executor.subagentArguments, undefined);
  assert.ok(!JSON.stringify(result).includes('SECRET'));
});
test('resolvers cannot silently replace the requested route', async () => {
  const llm = registry({ async resolveCallConfig(route) { return { ...route, provider: 'different' }; } });
  assert.equal((await describePresets(llm, state())).presets[0].roles.executor.status, 'route-mismatch');
});
test('deduplicates metadata reads within a request, not across generations', async () => {
  const value = state(); value.presets[0].reviewer = { ...executor };
  const llm = registry(); await describePresets(llm, value);
  assert.equal(llm.calls.filter(call => call[0] === 'models').length, 2);
  assert.equal(llm.calls.filter(call => call[0] === 'resolve').length, 2);
  await describePresets(llm, value);
  assert.equal(llm.calls.filter(call => call[0] === 'models').length, 4);
});
test('invalid tool input and unknown preset fail before registry access', async () => {
  const llm = registry();
  for (const args of [{ provider: 'other' }, { preset: '' }, { preset: '../foo' }, null]) await assert.rejects(describePresets(llm, state(), args), { code: 'INVALID_INPUT' });
  await assert.rejects(describePresets(llm, state(), { preset: 'missing' }), { code: 'PRESET_NOT_FOUND' });
  assert.equal(llm.calls.length, 0);
});
test('pre-cancel makes no calls and mid-cancel stops subsequent roles', async () => {
  const pre = new AbortController(); pre.abort(); const llm = registry();
  await assert.rejects(describePresets(llm, state(), {}, pre.signal), { name: 'AbortError' }); assert.equal(llm.calls.length, 0);
  const mid = new AbortController(); let began; const ready = new Promise(resolve => began = resolve);
  const pending = describePresets(registry({ listModels() { began(); return new Promise(() => {}); } }), state(), {}, mid.signal);
  await ready; mid.abort(); await assert.rejects(pending, { name: 'AbortError' });
});
test('cancellation reaches native parameter validation', async () => {
  const control = new AbortController(); let received, started; const ready = new Promise(resolve => started = resolve);
  const pending = describePresets(registry({ resolveCallConfig(_route, signal) { received = signal; started(); return new Promise(() => {}); } }), state(), {}, control.signal);
  await ready; control.abort(); await assert.rejects(pending, { name: 'AbortError' }); assert.equal(received, control.signal);
});
test('abort races consume late rejected metadata promises', async () => {
  const control = new AbortController(); let fail; const source = new Promise((_resolve, reject) => fail = reject);
  const waiting = abortable(source, control.signal); control.abort(); await assert.rejects(waiting, { name: 'AbortError' });
  fail(Error('late secret error')); await new Promise(resolve => setImmediate(resolve));
});
test('arbitrary errors are never echoed', () => {
  const result = safeError(Error('api-key=secret'));
  assert.equal(result.code, 'INTERNAL_ERROR'); assert.ok(!JSON.stringify(result).includes('secret'));
});
