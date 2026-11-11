import { validateRecord } from '../core.js';

export function memoryTable({ failWrite = false, beforeWrite } = {}) {
  const records = new Map();
  let chain = Promise.resolve();
  let closed = false;
  const queue = operation => { const result = chain.then(operation); chain = result.catch(() => {}); return result; };
  const writable = async () => { if (closed) throw new Error('closed'); await beforeWrite?.(); if (failWrite) throw new Error('injected backend failure'); };
  return {
    records,
    get size() { return records.size; },
    get(key) { if (closed) throw new Error('closed'); return records.get(key); },
    entries() { if (closed) throw new Error('closed'); return records.entries(); },
    async put(key, value) { return queue(async () => { await writable(); records.set(key, structuredClone(validateRecord(value))); }); },
    async update(key, fn) { return queue(async () => { const value = fn(records.get(key)); await writable(); records.set(key, structuredClone(validateRecord(value))); return records.get(key); }); },
    async close() { await chain; closed = true; },
  };
}
export function mockHost(options = {}) {
  const routes = new Map(), tools = new Map();
  const table = memoryTable(options);
  const state = { closed: false, spec: null };
  const ctx = {
    storageDomain: { async open(spec) { state.spec = spec; return { table: () => table, async close() { await table.close(); state.closed = true; } }; } },
    connection: { fetch: { register(route) { if (routes.has(route.path)) throw new Error('duplicate route'); routes.set(route.path, route); return async () => routes.delete(route.path); } } },
    tools: { register(tool) { tools.set(tool.name, tool); return () => tools.delete(tool.name); } },
  };
  return { ctx, table, state, routes, tools };
}
export function jsonRequest(value, options = {}) {
  return new Request('http://localhost/api/local-planner', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value), ...options });
}
