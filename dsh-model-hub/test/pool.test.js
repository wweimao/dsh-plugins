import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { normalizeState, validateHubValue } from '../core.js';
import { describePool, normalizePoolQuery } from '../pool.js';
const identity = (provider, model) => ({ provider, model });
const selected = models => ({ pool: { mode: 'selected', models } });
function registry() {
  const calls = [], providers = [{ id: 'alpha', name: 'Alpha' }, { id: 'beta', name: 'Beta' }];
  const models = new Map(providers.map(provider => [provider.id, ['small', 'shared', 'large'].map(id => ({ id, name: id, description: 'Model ' + id, apiKey: 'SECRET' }))]));
  const llm = {
    calls, providers, models,
    listProviders() { calls.push(['providers']); return providers; },
    async listModels(provider) { calls.push(['models', provider]); return models.get(provider) ?? []; },
    async resolveModelInfo(provider, model, signal) {
      calls.push(['detail', provider, model, signal]);
      return { provider, id: model, name: model, inputModalities: ['text', 'image'],
        context: { contextWindow: 128000, private: 'SECRET' }, defaultMaxTokens: 4096,
        reasoning: { efforts: [{ id: 'adapter-deep', name: 'Deep', description: 'Provider data' }], defaultEffort: 'adapter-deep', apiKey: 'SECRET' },
        apiKey: 'SECRET', profile: { auth: 'SECRET' }, headers: { authorization: 'SECRET' } };
    },
    prepareCall() { throw Error('No inference preparation'); },
    resolveCallConfig() { throw Error('No redundant call-config preparation'); },
    stream() { throw Error('No inference'); },
    discoverModels() { throw Error('No endpoint interrogation'); },
  };
  return llm;
}
test('legacy state becomes an all-model preference, while a pool needs no fixed role template', () => {
  assert.deepEqual(normalizeState({ activePresetId: '', presets: [] }), { pool: { mode: 'all', models: [] }, activePresetId: '', presets: [] });
  const models = Array.from({ length: 7 }, (_, n) => identity('p', 'm' + n));
  const state = normalizeState(selected(models));
  assert.equal(state.pool.models.length, 7); assert.deepEqual(state.presets, []);
  state.pool.models[0].model = 'changed'; assert.equal(models[0].model, 'm0');
  assert.deepEqual(normalizeState(selected([])).pool, { mode: 'selected', models: [] });
});
test('pool shape is closed and bounded; duplicate identities and fixed effort are rejected', () => {
  const route = identity('a', 'same');
  for (const pool of [undefined, null, {}, [], { mode: 'all' }, { mode: 'selected', models: [] , apiKey: 'SECRET' },
    { mode: 'other', models: [] }, { mode: 'all', models: [route] },
    { mode: 'selected', models: [route, route] }, { mode: 'selected', models: [{ ...route, reasoningEffort: 'high' }] },
    { mode: 'selected', models: [{ provider: 'a', model: 'bad\n' }] },
    { mode: 'selected', models: Array.from({ length: 4097 }, (_, n) => identity('a', 'm' + n)) }]) {
    assert.throws(() => normalizeState({ pool }), { code: 'INVALID_CONFIG' });
  }
  assert.equal(normalizeState(selected([route, identity('b', 'same')])).pool.models.length, 2);
  assert.equal(normalizeState(selected(Array.from({ length: 4096 }, (_, n) => identity('a', 'm' + n)))).pool.models.length, 4096);
});
test('pool validation factory survives multiple closure-free serialization cycles', () => {
  let source = validateHubValue.toJSON();
  for (let cycle = 0; cycle < 4; cycle++) {
    const validator = vm.runInNewContext(source);
    const value = validator(selected([identity('a', 'm'), identity('b', 'm')]));
    assert.equal(value.pool.models.length, 2);
    assert.throws(() => validator(selected([identity('a', 'm'), identity('a', 'm')])), { code: 'INVALID_CONFIG' });
    source = validator.toJSON();
  }
});
test('pool queries reject execution, credentials and inconsistent parameters before registry access', async () => {
  const llm = registry();
  for (const args of [null, [], { apiKey: 'SECRET' }, { prompt: 'execute' }, { view: 'invalid' }, { view: null }, { limit: 0 }, { limit: 101 },
    { offset: -1 }, { offset: 0.5 }, { query: 'x'.repeat(129) }, { provider: 'x\n' }, { model: 'm' },
    { provider: 'a', model: 'm', query: '' }, { provider: 'a', model: 'm', offset: 0 }, { view: 'providers', provider: 'a' }, { view: 'models', model: 'm' }]) {
    await assert.rejects(describePool(llm, {}, args), { code: 'INVALID_INPUT' });
  }
  assert.deepEqual(llm.calls, []);
  assert.equal(normalizePoolQuery().view, 'providers');
  assert.equal(normalizePoolQuery({ query: '' }).view, 'models');
  assert.equal(normalizePoolQuery({ provider: 'a', model: 'm' }).view, 'detail');
});
test('overview only reads the provider registry, without catalog or exact metadata I/O', async () => {
  const llm = registry(), value = await describePool(llm, {});
  assert.deepEqual(llm.calls, [['providers']]); assert.equal(value.total, 2);
  assert.equal(value.authorization, 'not-evaluated'); assert.equal(value.items[0].selectedModelCount, null);
  assert.equal(value.guidance.selection.includes('optional'), true);
});
test('whole pool contains more than three models and paginates real identities without exact lookups', async () => {
  const llm = registry(), first = await describePool(llm, {}, { view: 'models', limit: 4 });
  assert.equal(first.total, 6); assert.equal(first.items.length, 4); assert.equal(first.nextOffset, 4);
  assert.deepEqual(first.items.map(row => [row.provider, row.model]), [['alpha', 'large'], ['alpha', 'shared'], ['alpha', 'small'], ['beta', 'large']]);
  const second = await describePool(llm, {}, { view: 'models', offset: first.nextOffset, limit: 4 });
  assert.equal(second.items.length, 2); assert.equal(second.nextOffset, null);
  assert.equal(llm.calls.filter(call => call[0] === 'detail').length, 0);
  for (const row of first.items) assert.deepEqual(row.subagentArguments, identity(row.provider, row.model));
  assert.equal(JSON.stringify(first).includes('SECRET'), false);
});
test('search works across channels and same model names never collide', async () => {
  const llm = registry(), search = await describePool(llm, {}, { query: 'shared' });
  assert.equal(search.total, 2); assert.notEqual(search.items[0].provider, search.items[1].provider);
  const one = await describePool(llm, {}, { provider: 'beta', query: 'shared' });
  assert.equal(one.total, 1); assert.equal(one.items[0].provider, 'beta');
});
test('all mode discovers added models and removed providers on the next call without granting anything', async () => {
  const llm = registry(); assert.equal((await describePool(llm, {}, { view: 'models' })).total, 6);
  llm.models.get('alpha').push({ id: 'future', name: 'Future' });
  assert.equal((await describePool(llm, {}, { view: 'models' })).total, 7);
  llm.providers.splice(1);
  const after = await describePool(llm, {}, { view: 'models' });
  assert.equal(after.total, 4); assert.equal(after.authorization, 'not-evaluated');
});
test('selected pool retains unavailable members rather than deleting or substituting them', async () => {
  const llm = registry(), input = selected([identity('alpha', 'small'), identity('alpha', 'gone'), identity('missing', 'same')]);
  const before = JSON.stringify(input), result = await describePool(llm, input, { view: 'models' });
  assert.equal(result.total, 3); assert.equal(result.partial, true);
  assert.equal(result.items.find(row => row.model === 'gone').status, 'model-not-advertised');
  assert.equal(result.items.find(row => row.provider === 'missing').status, 'provider-unavailable');
  assert.equal(result.items.filter(row => row.subagentArguments !== undefined).length, 1);
  assert.equal(JSON.stringify(input), before);
});
test('detail rejects a model outside the selected pool before adapter metadata access', async () => {
  const llm = registry(), result = await describePool(llm, selected([identity('alpha', 'small')]), { provider: 'beta', model: 'shared' });
  assert.equal(result.item.status, 'not-in-pool'); assert.deepEqual(llm.calls, [['providers']]);
});
test('exact detail exposes only real capability fields and opaque native effort ids', async () => {
  const llm = registry(), control = new AbortController();
  const result = await describePool(llm, {}, { provider: 'alpha', model: 'small' }, control.signal);
  assert.equal(result.item.status, 'catalogued'); assert.equal(result.item.contextWindow, 128000);
  assert.equal(result.item.defaultOutputTokenCap, 4096);
  assert.deepEqual(result.item.reasoning.efforts.map(effort => effort.id), ['adapter-deep']);
  assert.equal(result.item.reasoning.defaultEffort, 'adapter-deep');
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
  assert.equal(llm.calls.find(call => call[0] === 'detail')[3], control.signal);
});
test('exact lookup never resolves a non-advertised model or substitutes a mismatched route', async () => {
  const llm = registry();
  assert.equal((await describePool(llm, {}, { provider: 'alpha', model: 'hidden' })).item.status, 'model-not-advertised');
  assert.equal(llm.calls.some(call => call[0] === 'detail'), false);
  llm.resolveModelInfo = async () => ({ provider: 'beta', id: 'small' });
  const mismatch = await describePool(llm, {}, { provider: 'alpha', model: 'small' });
  assert.equal(mismatch.item.status, 'route-mismatch'); assert.equal(mismatch.item.subagentArguments, undefined);
});
test('catalog failures are isolated and arbitrary adapter errors never leave the tool', async () => {
  const llm = registry(), base = llm.listModels;
  llm.listModels = async provider => { if (provider === 'alpha') throw Error('SECRET credentials'); return base(provider); };
  const result = await describePool(llm, {}, { view: 'models' });
  assert.equal(result.partial, true); assert.equal(result.total, 3);
  assert.deepEqual(result.failures, [{ provider: 'alpha', status: 'catalog-unavailable' }]);
  assert.equal(JSON.stringify(result).includes('SECRET'), false);
});
test('malformed or oversized catalogs fail closed for their provider', async () => {
  for (const data of [[{ id: 'bad\n' }], [{ id: 'same' }, { id: 'same' }], Array(20001).fill({ id: 'many' })]) {
    const llm = registry(); llm.listModels = async () => data;
    const result = await describePool(llm, {}, { provider: 'alpha' });
    assert.equal(result.total, 0); assert.equal(result.partial, true);
  }
});
test('unknown capabilities stay absent and malformed detail remains unavailable', async () => {
  const llm = registry(); llm.resolveModelInfo = async () => ({ provider: 'alpha', id: 'small', context: { contextWindow: Infinity } });
  const unknown = (await describePool(llm, {}, { provider: 'alpha', model: 'small' })).item;
  assert.equal(unknown.reasoning, undefined); assert.equal(unknown.contextWindow, undefined); assert.equal(unknown.inputModalities, undefined);
  llm.resolveModelInfo = async () => ({ provider: 'alpha', id: 'small', reasoning: { efforts: [{ id: 'valid' }], defaultEffort: 'wrong' } });
  assert.equal((await describePool(llm, {}, { provider: 'alpha', model: 'small' })).item.status, 'details-unavailable');
});
test('failure diagnostics stay bounded even with thousands of missing pool providers', async () => {
  const models = Array.from({ length: 4096 }, (_, n) => identity('p-' + String(n).padStart(4, '0') + '-' + 'x'.repeat(153), 'm'));
  const result = await describePool({ listProviders: () => [] }, selected(models), { view: 'models', limit: 1 });
  assert.equal(result.total, 4096); assert.equal(result.items.length, 1);
  assert.equal(result.failureCount, 4096); assert.equal(result.failures.length, 25);
  assert.equal(result.failuresTruncated, true); assert.equal(result.partial, true);
  assert.ok(JSON.stringify(result).length < 20000);
});
test('pre-aborted discovery makes no registry calls', async () => {
  const llm = registry(), control = new AbortController(); control.abort();
  await assert.rejects(describePool(llm, {}, {}, control.signal), { name: 'AbortError' });
  assert.deepEqual(llm.calls, []);
});
test('bounded catalog fanout stops waiting on abort and never starts remaining providers', async () => {
  const llm = registry(), control = new AbortController(), pending = [];
  llm.providers.splice(0, 2, ...Array.from({ length: 9 }, (_, n) => ({ id: 'p' + n })));
  llm.listModels = provider => new Promise((resolve, reject) => pending.push({ provider, resolve, reject }));
  const task = describePool(llm, {}, { view: 'models' }, control.signal);
  assert.equal(pending.length, 4); control.abort();
  await assert.rejects(task, { name: 'AbortError' }); assert.equal(pending.length, 4);
  for (const call of pending) call.reject(Error('Late SECRET failure'));
  await new Promise(resolve => setImmediate(resolve));
});
test('an abort during exact detail stops the result even if metadata settles later', async () => {
  const llm = registry(), control = new AbortController(); let started, settle;
  const ready = new Promise(resolve => { started = resolve; });
  llm.resolveModelInfo = () => { started(); return new Promise(resolve => { settle = resolve; }); };
  const task = describePool(llm, {}, { provider: 'alpha', model: 'small' }, control.signal);
  await ready; control.abort(); await assert.rejects(task, { name: 'AbortError' });
  settle({ provider: 'alpha', id: 'small' });
});
