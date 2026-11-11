import { createPlanner, dateInZone, PlannerError, publicError } from './core.js';
import { plannerTools } from './tools.js';

const PATH = '/api/local-planner';
const MAX_BODY = 131072;
function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
function failure(error) {
  const safe = publicError(error);
  return json({ ok: false, error: safe }, { invalid_input: 400, not_found: 404, conflict: 409, disposed: 503 }[safe.code] ?? 503);
}
async function readBody(request, signal) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') ?? '')) throw new PlannerError('invalid_input', 'Use application/json.');
  const declared = request.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > MAX_BODY)) throw new PlannerError('invalid_input', 'Request is too large.');
  const reader = request.body?.getReader();
  if (!reader) throw new PlannerError('invalid_input', 'JSON body required.');
  let bytes = 0;
  const chunks = [];
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const part = await reader.read();
      if (part.done) break;
      bytes += part.value.length;
      if (bytes > MAX_BODY) { await reader.cancel(); throw new PlannerError('invalid_input', 'Request is too large.'); }
      chunks.push(part.value);
    }
  } finally { signal.removeEventListener('abort', cancel); reader.releaseLock(); }
  signal.throwIfAborted();
  const data = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); }
  catch { throw new PlannerError('invalid_input', 'Invalid UTF-8 JSON body.'); }
}

/** Called inside one ctx.effect; all cleanup is sequenced here rather than in separate effects. */
export async function mountPlanner(ctx, valueSchema, { timeZone = 'Asia/Shanghai' } = {}) {
  let domain;
  let planner;
  let closing = false;
  const routes = [];
  const tools = [];
  const streams = new Set();
  const requests = new Set();
  const lifetime = new AbortController();
  let disposed;
  async function dispose() {
    if (disposed) return disposed;
    closing = true;
    disposed = (async () => {
      lifetime.abort();
      await Promise.allSettled(routes.map(off => off()));
      for (const off of tools) off();
      for (const close of [...streams]) close();
      // Accepted table writes may already be committing; never close storage under them.
      await planner?.close();
      await Promise.allSettled([...requests]);
      await domain?.close();
    })();
    return disposed;
  }
  try {
    domain = await ctx.storageDomain.open({ name: 'local_planner', version: 1, layout: 'per-record', tables: { items: { valueSchema } } });
    planner = createPlanner(domain.table('items'), { timeZone });
    const track = operation => {
      requests.add(operation);
      void operation.finally(() => requests.delete(operation)).catch(() => {});
      return operation;
    };
    routes.push(ctx.connection.fetch.register({
      path: PATH, methods: ['GET', 'POST'], requestBody: 'buffered',
      fetch: request => track((async () => {
        try {
          if (closing) throw new PlannerError('disposed', 'Planner is unloading.');
          const signal = AbortSignal.any([request.signal, lifetime.signal]);
          signal.throwIfAborted();
          // GET is always read-only, even if a caller places mutation parameters in its URL.
          const input = request.method === 'GET' ? { action: 'summary' } : await readBody(request, signal);
          signal.throwIfAborted();
          return json({ ok: true, value: await planner.dispatch(input, { kind: 'user' }, signal) });
        } catch (error) { return failure(error); }
      })()),
    }));
    routes.push(ctx.connection.fetch.register({
      path: `${PATH}/events`, methods: ['GET'], requestBody: 'buffered',
      fetch: async request => {
        if (closing) return failure(new PlannerError('disposed', 'Planner is unloading.'));
        if (streams.size >= 64) return json({ ok: false, error: { code: 'busy', message: 'Too many open planner views.' } }, 429);
        const encoder = new TextEncoder();
        let cleanup = () => {};
        const body = new ReadableStream({
          start(controller) {
            let ended = false;
            let timer;
            let off = () => {};
            const close = () => {
              if (ended) return;
              ended = true;
              clearInterval(timer);
              off();
              streams.delete(close);
              request.signal.removeEventListener('abort', close);
              lifetime.signal.removeEventListener('abort', close);
              try { controller.close(); } catch { /* Already cancelled by the reader. */ }
            };
            cleanup = close;
            const send = text => {
              if (ended) return;
              // Do not queue unbounded events for a browser that stopped reading.
              if ((controller.desiredSize ?? 0) < -4) return close();
              try { controller.enqueue(encoder.encode(text)); } catch { close(); }
            };
            streams.add(close);
            off = planner.subscribe(() => send('event: change\ndata: {}\n\n'));
            request.signal.addEventListener('abort', close, { once: true });
            lifetime.signal.addEventListener('abort', close, { once: true });
            let day = dateInZone(new Date(), timeZone);
            timer = setInterval(() => {
              const currentDay = dateInZone(new Date(), timeZone);
              if (currentDay !== day) { day = currentDay; send('event: change\ndata: {}\n\n'); }
              else send(': heartbeat\n\n');
            }, 20000);
            timer.unref?.();
            if (request.signal.aborted || lifetime.signal.aborted) close();
            else send('retry: 5000\nevent: change\ndata: {}\n\n');
          },
          cancel() { cleanup(); },
        });
        return new Response(body, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff' } });
      },
    }));
    for (const definition of plannerTools(planner)) tools.push(ctx.tools.register(definition));
    return dispose;
  } catch (error) { await dispose(); throw error; }
}
