import z from '@deepseek-ai/schemastery';
import { describePresets, validateHubValue, safeError } from './core.js';
import { describePool, POOL_PROMPT } from './pool.js';

export const name = 'model-hub';
export const inject = ['llm', 'tools', 'settings', 'systemPrompt'];
// One volatile value validates cross-field invariants before persistence.
// Keep the self-serializing pure factory: Settings clones schemas before wire use.
export const Config = z.object({
  state: z.transform(z.any(), validateHubValue, true)
    .default({ pool: { mode: 'all', models: [] }, activePresetId: '', presets: [] }).volatile(),
});

export function apply(ctx, config) {
  ctx.effect(() => ctx.settings.configure({ auto: false }, ctx.fiber));
  const lifetime = new AbortController();
  ctx.effect(() => () => lifetime.abort());
  const output = {
    schema: { type: 'object', properties: {
      ok: { type: 'boolean' }, value: { type: 'object', additionalProperties: true },
      error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' } }, required: ['code', 'message'], additionalProperties: false },
    }, required: ['ok'], additionalProperties: false },
    render: (_args, result) => [{ type: 'text', text: JSON.stringify(result) }],
  };
  const reader = describe => async (args, exec) => {
    const signal = exec?.signal ? AbortSignal.any([exec.signal, lifetime.signal]) : lifetime.signal;
    try {
      signal.throwIfAborted();
      const value = await describe(ctx.llm, config.state.get(), args, signal);
      signal.throwIfAborted();
      return { ok: true, value };
    } catch (error) {
      signal.throwIfAborted();
      return { ok: false, error: safeError(error) };
    }
  };
  const poolTool = {
    name: 'model_hub_pool',
    description: 'Discover the shared model pool for dynamic subagent model selection, not fixed role pairs. No arguments lists pool providers without catalog I/O. Use view=models to browse/search across providers, provider to list one, or provider+model for exact detail/efforts. Choose any suitable candidate also allowed by native list_subagent_models for THIS session, then use native subagent with exact provider/model. Metadata only, never inference or permission changes; adapters may perform authenticated metadata I/O. Catalog visibility is not a quota/health guarantee. New models are candidates, not automatic grants.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      view: { type: 'string', enum: ['providers', 'models', 'detail'], description: 'Defaults to providers; provider or query implies models, provider+model implies detail. Explicit models without provider searches the whole pool.' },
      provider: { type: 'string', description: 'Exact provider id; optional for models, required for detail.' },
      model: { type: 'string', description: 'Exact model id for detail, requires provider; do not combine with query/pagination.' },
      query: { type: 'string', description: 'At most 128 characters; matches advertised ids/names/descriptions, not guessed capabilities or quality.' },
      offset: { type: 'integer', minimum: 0, description: 'Page offset, default 0. Directory changes may change subsequent pages.' },
      limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Page size, default 25.' },
    } },
    output, isConcurrencySafe: () => true, timeoutMs: 30000, execute: reader(describePool),
  };
  ctx.effect(() => ctx.tools.register(poolTool));
  ctx.effect(() => ctx.tools.register({
    name: 'model_hub_routes',
    description: 'Read optional saved role templates. Templates are shortcuts, NOT a two/three-model limit: use model_hub_pool for dynamic selection from the entire pool. Metadata only, never inference or permission changes. Check native list_subagent_models for THIS session before native subagent. Saving a template or changing the pool does not change the main model or session authorization.',
    parameters: { type: 'object', additionalProperties: false, properties: {
      preset: { type: 'string', description: 'Optional saved template id. Omit to list templates and the active template id.' },
    } },
    output, isConcurrencySafe: () => true, timeoutMs: 30000, execute: reader(describePresets),
  }));
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'tool:model-hub:dynamic-pool', order: 100, interpolate: false,
    text(context) {
      if (ctx.tools.get('model_hub_pool', context.scope, context.toolSet) !== poolTool
          || !ctx.tools.get('subagent', context.scope, context.toolSet)) return '';
      return POOL_PROMPT;
    },
  }));
}
