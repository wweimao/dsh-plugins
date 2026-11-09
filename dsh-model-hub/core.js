export const VERSION = '0.2.0';
export const NAMESPACE = 'model-hub';
export const NATIVE_NAMESPACE = 'subagent-model-selection-settings';
export const ROLES = ['main', 'executor', 'reviewer'];
const messages = {
  INVALID_CONFIG: 'Invalid model-hub configuration. Fix the pool or templates in Settings.',
  INVALID_INPUT: 'Invalid model-hub query.',
  PRESET_NOT_FOUND: 'The requested preset does not exist.',
  INTERNAL_ERROR: 'Model-hub could not read the current routing state.',
};
export class HubError extends Error {
  constructor(code) { super(messages[code] ?? messages.INTERNAL_ERROR); this.name = 'HubError'; this.code = code; }
}
export function safeError(error) {
  const code = error instanceof HubError && Object.hasOwn(messages, error.code) ? error.code : 'INTERNAL_ERROR';
  return { code, message: messages[code] };
}
function object(value, allowed, required = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || Object.keys(value).some(key => !allowed.includes(key))
      || required.some(key => !Object.hasOwn(value, key))) throw new HubError('INVALID_CONFIG');
}
function text(value, max, empty = false) {
  if (typeof value !== 'string' || (!empty && !value.length) || value.length > max || /[\u0000-\u001f\u007f-\u009f]/u.test(value)) throw new HubError('INVALID_CONFIG');
  return value;
}
function presetId(value, empty = false) {
  text(value, 64, empty);
  if (value !== '' && !/^[a-z][a-z0-9-]*$/.test(value)) throw new HubError('INVALID_CONFIG');
  return value;
}
/**
 * Must remain SELF-CONTAINED: Settings serializes this function's source and
 * rehydrates it in the browser. Module closures/imports do not cross that wire.
 * The optional route mode shares validation with local helpers; Settings calls
 * the callback with exactly one argument, always validating the whole state.
 */
export function createHubValidator() {
function validateHubValue(value = {}, mode = 'state') {
  const fail = () => {
    const error = new Error('Invalid model-hub configuration. Fix the pool or templates in Settings.');
    error.code = 'INVALID_CONFIG';
    throw error;
  };
  const object = (input, allowed, required = []) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)
        || Object.keys(input).some(key => !allowed.includes(key))
        || required.some(key => !Object.hasOwn(input, key))) fail();
  };
  const text = (input, max, empty = false) => {
    if (typeof input !== 'string' || (!empty && !input.length) || input.length > max || /[\u0000-\u001f\u007f-\u009f]/u.test(input)) fail();
    return input;
  };
  const presetId = (input, empty = false) => {
    text(input, 64, empty);
    if (input !== '' && !/^[a-z][a-z0-9-]*$/.test(input)) fail();
    return input;
  };
  const route = input => {
    object(input, ['provider', 'model', 'reasoningEffort'], ['provider', 'model']);
    return { provider: text(input.provider, 160), model: text(input.model, 256),
      ...(input.reasoningEffort === undefined ? {} : { reasoningEffort: text(input.reasoningEffort, 64) }) };
  };
  const identity = input => {
    object(input, ['provider', 'model'], ['provider', 'model']);
    return { provider: text(input.provider, 160), model: text(input.model, 256) };
  };
  if (mode === 'route') return route(value);
  if (mode === 'identity') return identity(value);
  if (mode !== 'state') fail();
  object(value, ['pool', 'activePresetId', 'presets']);
  const inputPool = Object.hasOwn(value, 'pool') ? value.pool : { mode: 'all', models: [] };
  object(inputPool, ['mode', 'models'], ['mode', 'models']);
  if (!['all', 'selected'].includes(inputPool.mode) || !Array.isArray(inputPool.models) || inputPool.models.length > 4096
      || inputPool.mode === 'all' && inputPool.models.length !== 0) fail();
  const identities = new Set();
  const pool = { mode: inputPool.mode, models: inputPool.models.map(input => {
    const model = identity(input), key = JSON.stringify([model.provider, model.model]);
    if (identities.has(key)) fail();
    identities.add(key);
    return model;
  }) };
  const activePresetId = presetId(value.activePresetId ?? '', true);
  const source = value.presets ?? [];
  if (!Array.isArray(source) || source.length > 16) fail();
  const seen = new Set();
  const presets = source.map(preset => {
    object(preset, ['id', 'name', 'main', 'executor', 'reviewer'], ['id', 'name', 'main', 'executor']);
    const id = presetId(preset.id);
    if (seen.has(id)) fail();
    seen.add(id);
    const name = text(preset.name, 80);
    if (!name.trim()) fail();
    return { id, name, main: route(preset.main), executor: route(preset.executor),
      ...(preset.reviewer === undefined ? {} : { reviewer: route(preset.reviewer) }) };
  });
  if (activePresetId && !seen.has(activePresetId)) fail();
  return { pool, activePresetId, presets };
}
  // DSH clones Schemastery schemas before publishing them. Its hydration step
  // reconstructs callbacks but drops their serializer. Reconstruct this pure
  // factory instead so every hydrated validator retains its own serializer.
  // Only trusted source code is serialized; configuration values never enter it.
  validateHubValue.toJSON = () => `(${createHubValidator.toString()})()`;
  return validateHubValue;
}
export const validateHubValue = createHubValidator();
export function normalizeIdentity(value) {
  try { return validateHubValue(value, 'identity'); }
  catch { throw new HubError('INVALID_CONFIG'); }
}
export function normalizeRoute(value) {
  try { return validateHubValue(value, 'route'); }
  catch { throw new HubError('INVALID_CONFIG'); }
}
export function normalizeState(value = {}) {
  try { return validateHubValue(value); }
  catch { throw new HubError('INVALID_CONFIG'); }
}
export const routeKey = route => JSON.stringify([route.provider, route.model]);
export function presetRoutes(preset) {
  const routes = new Map();
  for (const role of ROLES) if (preset[role]) {
    const route = normalizeRoute(preset[role]);
    routes.set(routeKey(route), { provider: route.provider, model: route.model });
  }
  return [...routes.values()];
}
export function childArguments(route) {
  const selected = normalizeRoute(route);
  return { provider: selected.provider, model: selected.model,
    ...(selected.reasoningEffort === undefined ? {} : { reasoning_effort: selected.reasoningEffort }) };
}
export function abortable(promise, signal) {
  if (!signal) return Promise.resolve(promise);
  if (signal.aborted) { Promise.resolve(promise).catch(() => {}); return Promise.reject(signal.reason); }
  return new Promise((resolve, reject) => {
    const abort = () => { cleanup(); reject(signal.reason); };
    const cleanup = () => signal.removeEventListener('abort', abort);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
  });
}
/** Metadata only: adapters may resolve credentials or make catalog I/O; no inference or policy edits. */
export async function describePresets(llm, rawState, args = {}, signal) {
  signal?.throwIfAborted();
  const state = normalizeState(rawState);
  try { object(args, ['preset']); if (args.preset !== undefined) presetId(args.preset); }
  catch { throw new HubError('INVALID_INPUT'); }
  const presets = args.preset === undefined ? state.presets : state.presets.filter(preset => preset.id === args.preset);
  if (args.preset !== undefined && !presets.length) throw new HubError('PRESET_NOT_FOUND');
  const providers = presets.length ? new Set(llm.listProviders().map(provider => provider.id)) : new Set();
  const catalogs = new Map(), validations = new Map();
  const inspect = async route => {
    const key = JSON.stringify([route.provider, route.model, route.reasoningEffort ?? null]);
    if (validations.has(key)) return validations.get(key);
    const operation = (async () => {
      signal?.throwIfAborted();
      if (!providers.has(route.provider)) return 'provider-unavailable';
      try {
        if (!catalogs.has(route.provider)) catalogs.set(route.provider, Promise.resolve().then(() => {
          signal?.throwIfAborted(); return llm.listModels(route.provider);
        }).then(models => new Set(models.map(model => model.id))));
        const models = await abortable(catalogs.get(route.provider), signal);
        if (!models.has(route.model)) return 'model-not-advertised';
      } catch { signal?.throwIfAborted(); return 'catalog-unavailable'; }
      try {
        const resolved = await abortable(llm.resolveCallConfig({ ...route }, signal), signal);
        signal?.throwIfAborted();
        return resolved.provider === route.provider && resolved.model === route.model ? 'catalogued' : 'route-mismatch';
      } catch { signal?.throwIfAborted(); return 'parameters-unavailable'; }
    })();
    validations.set(key, operation);
    return operation;
  };
  const described = [];
  // Sequential presets bound metadata work and honor cancellation between roles.
  for (const preset of presets) {
    const roles = {};
    for (const role of ROLES) if (preset[role]) {
      signal?.throwIfAborted();
      const route = preset[role], status = await inspect(route);
      roles[role] = { ...route, status, ...(role !== 'main' && status === 'catalogued' ? { subagentArguments: childArguments(route) } : {}) };
    }
    described.push({ id: preset.id, name: preset.name, roles });
  }
  signal?.throwIfAborted();
  return {
    pluginVersion: VERSION, activePresetId: state.activePresetId, presets: described,
    pool: { mode: state.pool.mode, selectedCount: state.pool.mode === 'selected' ? state.pool.models.length : null, tool: 'model_hub_pool' },
    guidance: {
      dynamicSelection: 'Role templates are optional, not a limit on model choice. Use model_hub_pool to choose any pool candidate suited to the task, intersected with native list_subagent_models for THIS session.',
      execution: 'Use native list_subagent_models to check THIS session, then native subagent with the exact saved provider/model. Supply your bounded task separately. Never silently substitute another provider or effort.',
      authorization: 'Saved presets are preferences, NOT session authorization. Only a human can grant routes for NEW sessions in Settings. Existing session policy remains unchanged.',
      availability: 'catalogued means current catalog membership and valid call parameters, NOT a successful inference, sufficient quota or valid credentials.',
      main: 'Main-model preferences do not change the current session or the global default. Select the intended main model when opening a new conversation.',
    },
  };
}
